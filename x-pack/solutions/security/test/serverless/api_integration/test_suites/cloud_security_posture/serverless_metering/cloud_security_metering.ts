/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  CDR_LATEST_NATIVE_VULNERABILITIES_INDEX_PATTERN,
  CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS,
} from '@kbn/cloud-security-posture-common';
import type * as http from 'http';
import { createPackagePolicy } from '@kbn/cloud-security-posture-common/test_helper';
import { EsIndexDataProvider } from '../utils';
import { getMockFindings, getMockGcpComputeFindings } from './mock_data';
import type { FtrProviderContext } from '../../../ftr_provider_context';
import type { RoleCredentials } from '../../../services';
import type { UsageRecord } from './mock_usage_server';
import { getInterceptedRequestPayload, setupMockServer } from './mock_usage_server';

export default function (providerContext: FtrProviderContext) {
  const mockUsageApiApp = setupMockServer();
  const { getService } = providerContext;
  const retry = getService('retry');
  const kibanaServer = getService('kibanaServer');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const svlCommonApi = getService('svlCommonApi');
  const svlUserManager = getService('svlUserManager');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const findingsIndex = new EsIndexDataProvider(
    es,
    CDR_LATEST_NATIVE_MISCONFIGURATIONS_INDEX_ALIAS
  );
  const vulnerabilitiesIndex = new EsIndexDataProvider(
    es,
    CDR_LATEST_NATIVE_VULNERABILITIES_INDEX_PATTERN
  );

  /*
  This test aims to intercept the usage API request sent by the metering background task manager.
  The task manager is running by default in security serverless project in the background and sending usage API requests to the usage API.
   This test mocks the usage API server and intercepts the usage API request sent by the metering background task manager.
  */
  describe('Intercept the usage API request sent by the metering background task manager', function () {
    this.tags(['skipMKI']);

    let mockUsageApiServer: http.Server;
    let agentPolicyId: string;
    let roleAuthc: RoleCredentials;
    let internalRequestHeader: { 'x-elastic-internal-origin': string; 'kbn-xsrf': string };
    before(async () => {
      mockUsageApiServer = mockUsageApiApp.listen(8089); // Start the usage api mock server on port 8089
    });

    beforeEach(async () => {
      roleAuthc = await svlUserManager.createM2mApiKeyWithRoleScope('admin');
      internalRequestHeader = svlCommonApi.getInternalRequestHeader();

      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');

      const { body: agentPolicyResponse } = await supertestWithoutAuth
        .post(`/api/fleet/agent_policies`)
        .set(internalRequestHeader)
        .set(roleAuthc.apiKeyHeader)
        .send({
          name: 'Test policy',
          namespace: 'default',
        });

      agentPolicyId = agentPolicyResponse.item.id;

      await findingsIndex.deleteAll();
      await vulnerabilitiesIndex.deleteAll();
    });

    afterEach(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
      await findingsIndex.deleteAll();
      await vulnerabilitiesIndex.deleteAll();
    });
    after(async () => {
      await svlUserManager.invalidateM2mApiKeyWithRoleScope(roleAuthc);
      mockUsageApiServer.close();
    });

    it('Should intercept usage API request for CSPM', async () => {
      await createPackagePolicy(
        supertestWithoutAuth,
        agentPolicyId,
        'cspm',
        'cloudbeat/cis_aws',
        'aws',
        'cspm',
        'CSPM-1',
        roleAuthc,
        internalRequestHeader
      );
      const billableFindings = getMockFindings({
        postureType: 'cspm',
        isBillableAsset: true,
        numberOfFindings: 5,
      });

      const notBillableFindings = getMockFindings({
        postureType: 'cspm',
        isBillableAsset: false,
        numberOfFindings: 10,
      });

      await findingsIndex.addBulk([...billableFindings, ...notBillableFindings]);

      let interceptedRequestBody: UsageRecord[] = [];
      await retry.try(async () => {
        interceptedRequestBody = getInterceptedRequestPayload();
        expect(interceptedRequestBody.length).to.greaterThan(0);
        const usageSubTypes = interceptedRequestBody.map((record) => record.usage.sub_type);
        expect(usageSubTypes).to.contain('cspm');
        expect(interceptedRequestBody[0].usage.type).to.be('cloud_security');
        expect(interceptedRequestBody[0].usage.quantity).to.be(billableFindings.length);
      });
    });

    it('Should only count GCP compute instances with at least 24h running time for CSPM', async () => {
      await createPackagePolicy(
        supertestWithoutAuth,
        agentPolicyId,
        'cspm',
        'cloudbeat/cis_aws',
        'aws',
        'cspm',
        'CSPM-1',
        roleAuthc,
        internalRequestHeader
      );

      // Billable: past the 24h minimum running duration
      const longRunningInstances = getMockGcpComputeFindings({
        numberOfFindings: 2,
        runningDurationHours: 48,
        status: 'RUNNING',
      });
      const longTerminatedInstances = getMockGcpComputeFindings({
        numberOfFindings: 1,
        runningDurationHours: 30,
        status: 'TERMINATED',
      });

      // Not billable: ephemeral instances below the 24h minimum
      const shortRunningInstances = getMockGcpComputeFindings({
        numberOfFindings: 3,
        runningDurationHours: 2,
        status: 'RUNNING',
      });
      const shortTerminatedInstances = getMockGcpComputeFindings({
        numberOfFindings: 2,
        runningDurationHours: 3,
        status: 'TERMINATED',
      });

      // Not billable: >=24h historical run, but the stop event is older than the
      // look-back window — already billed on its stop day, must not be re-billed.
      const staleTerminatedInstances = getMockGcpComputeFindings({
        numberOfFindings: 2,
        runningDurationHours: 30,
        status: 'TERMINATED',
        stoppedHoursAgo: 48,
      });

      await findingsIndex.addBulk([
        ...longRunningInstances,
        ...longTerminatedInstances,
        ...shortRunningInstances,
        ...shortTerminatedInstances,
        ...staleTerminatedInstances,
      ]);

      let interceptedRequestBody: UsageRecord[] = [];
      await retry.try(async () => {
        interceptedRequestBody = getInterceptedRequestPayload();
        expect(interceptedRequestBody.length).to.greaterThan(0);
        const usageSubTypes = interceptedRequestBody.map((record) => record.usage.sub_type);
        expect(usageSubTypes).to.contain('cspm');
        expect(interceptedRequestBody[0].usage.type).to.be('cloud_security');
        // Only the 3 instances with >=24h running time whose run is current (running now,
        // or stopped within the look-back window) are billable — ephemeral and
        // stale-stopped instances are not.
        expect(interceptedRequestBody[0].usage.quantity).to.be(
          longRunningInstances.length + longTerminatedInstances.length
        );
      });
    });

    it('Should intercept usage API request for KSPM', async () => {
      await createPackagePolicy(
        supertestWithoutAuth,
        agentPolicyId,
        'kspm',
        'cloudbeat/cis_k8s',
        'vanilla',
        'kspm',
        'KSPM-1',
        roleAuthc,
        internalRequestHeader
      );
      const billableFindings = getMockFindings({
        postureType: 'kspm',
        isBillableAsset: true,
        numberOfFindings: 3,
      });

      const notBillableFindings = getMockFindings({
        postureType: 'kspm',
        isBillableAsset: false,
        numberOfFindings: 11,
      });

      await findingsIndex.addBulk([...billableFindings, ...notBillableFindings]);

      let interceptedRequestBody: UsageRecord[] = [];

      await retry.try(async () => {
        interceptedRequestBody = getInterceptedRequestPayload();
        expect(interceptedRequestBody.length).to.greaterThan(0);
        const usageSubTypes = interceptedRequestBody.map((record) => record.usage.sub_type);
        expect(usageSubTypes).to.contain('kspm');
        expect(interceptedRequestBody[0].usage.type).to.be('cloud_security');
        expect(interceptedRequestBody[0].usage.quantity).to.be(billableFindings.length);
      });
    });

    it('Should intercept usage API request for CNVM', async () => {
      await createPackagePolicy(
        supertestWithoutAuth,
        agentPolicyId,
        'vuln_mgmt',
        'cloudbeat/vuln_mgmt_aws',
        'aws',
        'vuln_mgmt',
        'CNVM-1',
        roleAuthc,
        internalRequestHeader
      );

      const billableFindings = getMockFindings({
        postureType: 'cnvm',
        numberOfFindings: 2,
      });

      await vulnerabilitiesIndex.addBulk(billableFindings);

      let interceptedRequestBody: UsageRecord[] = [];

      await retry.try(async () => {
        interceptedRequestBody = getInterceptedRequestPayload();
        expect(interceptedRequestBody.length).to.greaterThan(0);
        if (interceptedRequestBody.length > 0) {
          const usageSubTypes = interceptedRequestBody.map((record) => record.usage.sub_type);
          expect(usageSubTypes).to.contain('cnvm');
          expect(interceptedRequestBody[0].usage.type).to.be('cloud_security');
          expect(interceptedRequestBody[0].usage.quantity).to.be(billableFindings.length);
        }
      });
    });

    it('Should intercept usage API request with all integrations usage records', async () => {
      // Create one package policy - it takes care forCSPM, KSMP and CNVM
      await createPackagePolicy(
        supertestWithoutAuth,
        agentPolicyId,
        'cspm',
        'cloudbeat/cis_aws',
        'aws',
        'cspm',
        'CSPM-1',
        roleAuthc,
        internalRequestHeader
      );

      const billableFindingsCSPM = getMockFindings({
        postureType: 'cspm',
        isBillableAsset: true,
        numberOfFindings: 5,
      });

      const notBillableFindingsCSPM = getMockFindings({
        postureType: 'cspm',
        isBillableAsset: false,
        numberOfFindings: 10,
      });

      const billableFindingsKSPM = getMockFindings({
        postureType: 'kspm',
        isBillableAsset: true,
        numberOfFindings: 3,
      });

      const billableFindingsCNVM = getMockFindings({
        postureType: 'cnvm',
        numberOfFindings: 2,
      });

      const notBillableFindingsKSPM = getMockFindings({
        postureType: 'kspm',
        isBillableAsset: false,
        numberOfFindings: 11,
      });

      await Promise.all([
        findingsIndex.addBulk([
          ...billableFindingsCSPM,
          ...notBillableFindingsCSPM,
          ...billableFindingsKSPM,
          ...notBillableFindingsKSPM,
        ]),
        vulnerabilitiesIndex.addBulk([...billableFindingsCNVM]),
      ]);

      // Intercept and verify usage API request
      let interceptedRequestBody: UsageRecord[] = [];

      await retry.try(async () => {
        interceptedRequestBody = getInterceptedRequestPayload();
        const usageSubTypes = interceptedRequestBody.map((record) => record.usage.sub_type);

        expect(usageSubTypes).to.contain('cspm');
        expect(usageSubTypes).to.contain('kspm');
        expect(usageSubTypes).to.contain('cnvm');
        const totalUsageQuantity = interceptedRequestBody.reduce(
          (acc, record) => acc + record.usage.quantity,
          0
        );
        expect(totalUsageQuantity).to.be(
          billableFindingsCSPM.length + billableFindingsKSPM.length + billableFindingsCNVM.length
        );
      });
    });
  });
}
