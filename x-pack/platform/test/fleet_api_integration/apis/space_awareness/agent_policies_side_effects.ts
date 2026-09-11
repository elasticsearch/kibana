/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { CreateAgentPolicyResponse } from '@kbn/fleet-plugin/common';
import type { FtrProviderContext } from '../../../api_integration/ftr_provider_context';
import { skipIfNoDockerRegistry } from '../../helpers';
import { SpaceTestApiClient } from './api_helper';
import { cleanFleetIndices, createTestSpace } from './helpers';

export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;
  const supertest = getService('supertest');
  const esClient = getService('es');
  const kibanaServer = getService('kibanaServer');
  const spaces = getService('spaces');
  let TEST_SPACE_1: string;

  describe('agent policies side effects', function () {
    skipIfNoDockerRegistry(providerContext);
    const apiClient = new SpaceTestApiClient(supertest);

    let defaultSpacePolicy1: CreateAgentPolicyResponse;
    let spaceTest1Policy1: CreateAgentPolicyResponse;
    let allSpaceTestPolicy1: CreateAgentPolicyResponse;

    function fetchAllPolicies() {
      return Promise.all([
        apiClient.getAgentPolicy(defaultSpacePolicy1.item.id),
        apiClient.getAgentPolicy(spaceTest1Policy1.item.id, TEST_SPACE_1),
        apiClient.getAgentPolicy(allSpaceTestPolicy1.item.id),
      ]);
    }

    before(async () => {
      TEST_SPACE_1 = spaces.getDefaultTestSpace();
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.savedObjects.cleanStandardList({
        space: TEST_SPACE_1,
      });
      await cleanFleetIndices(esClient);

      await apiClient.postEnableSpaceAwareness();
      await createTestSpace(providerContext, TEST_SPACE_1);

      const [_defaultSpacePolicy1, _spaceTest1Policy1, _allSpaceTestPolicy1] = await Promise.all([
        apiClient.createAgentPolicy(),
        apiClient.createAgentPolicy(TEST_SPACE_1),
        apiClient.createAgentPolicy(undefined, {
          space_ids: ['*'],
        }),
      ]);
      defaultSpacePolicy1 = _defaultSpacePolicy1;
      spaceTest1Policy1 = _spaceTest1Policy1;
      allSpaceTestPolicy1 = _allSpaceTestPolicy1;
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.savedObjects.cleanStandardList({
        space: TEST_SPACE_1,
      });
      await cleanFleetIndices(esClient);
    });

    describe('Download source', () => {
      let downloadSourceId: string;
      before(async () => {
        const res = await apiClient.postDownloadSource({
          name: `test ${Date.now()}`,
          host: 'https://test.fr',
        });
        downloadSourceId = res.item.id;
        await Promise.all([
          apiClient.putAgentPolicy(defaultSpacePolicy1.item.id, {
            name: defaultSpacePolicy1.item.name,
            namespace: defaultSpacePolicy1.item.namespace,
            description: defaultSpacePolicy1.item.description,
            download_source_id: downloadSourceId,
          }),
          apiClient.putAgentPolicy(
            spaceTest1Policy1.item.id,
            {
              name: spaceTest1Policy1.item.name,
              namespace: spaceTest1Policy1.item.namespace,
              description: spaceTest1Policy1.item.description,
              download_source_id: downloadSourceId,
            },
            TEST_SPACE_1
          ),
          apiClient.putAgentPolicy(allSpaceTestPolicy1.item.id, {
            name: allSpaceTestPolicy1.item.name,
            namespace: allSpaceTestPolicy1.item.namespace,
            description: allSpaceTestPolicy1.item.description,
            download_source_id: downloadSourceId,
          }),
        ]);
      });
      it('should bump policies accross all spaces on update', async () => {
        const policiesResBefore = await fetchAllPolicies();

        await apiClient.putDownloadSource(
          { name: `test update ${Date.now()}`, host: 'https://elastic.co' },
          downloadSourceId
        );

        const policiesResAfter = await fetchAllPolicies();

        for (const policyRes of policiesResBefore) {
          const policyAfter = policiesResAfter.find((p) => p.item.id === policyRes.item.id);
          expect(policyAfter?.item.revision).to.be.greaterThan(policyRes.item.revision);
        }
      });
      it('should remove download_source_id accross spaces', async () => {
        const policiesResBefore = await fetchAllPolicies();

        for (const policyRes of policiesResBefore) {
          expect(policyRes.item.download_source_id).to.be(downloadSourceId);
        }

        await apiClient.deleteDownloadSource(downloadSourceId);

        const policiesResAfter = await fetchAllPolicies();

        for (const policyRes of policiesResAfter) {
          expect(policyRes.item.download_source_id).not.to.be(downloadSourceId);
        }
      });
    });

    describe('Download source with multiple hosts', () => {
      let downloadSourceId: string;
      let otherDownloadSourceId: string;
      before(async () => {
        const [res, otherRes] = await Promise.all([
          apiClient.postDownloadSource({
            name: `test multiple ${Date.now()}`,
            host: 'https://test-multiple.fr',
          }),
          apiClient.postDownloadSource({
            name: `test multiple other ${Date.now()}`,
            host: 'https://test-multiple-other.fr',
          }),
        ]);
        downloadSourceId = res.item.id;
        otherDownloadSourceId = otherRes.item.id;

        await Promise.all([
          apiClient.putAgentPolicy(defaultSpacePolicy1.item.id, {
            name: defaultSpacePolicy1.item.name,
            namespace: defaultSpacePolicy1.item.namespace,
            description: defaultSpacePolicy1.item.description,
            download_source_ids: [downloadSourceId, otherDownloadSourceId],
          }),
          apiClient.putAgentPolicy(
            spaceTest1Policy1.item.id,
            {
              name: spaceTest1Policy1.item.name,
              namespace: spaceTest1Policy1.item.namespace,
              description: spaceTest1Policy1.item.description,
              download_source_ids: [downloadSourceId, otherDownloadSourceId],
            },
            TEST_SPACE_1
          ),
          apiClient.putAgentPolicy(allSpaceTestPolicy1.item.id, {
            name: allSpaceTestPolicy1.item.name,
            namespace: allSpaceTestPolicy1.item.namespace,
            description: allSpaceTestPolicy1.item.description,
            download_source_ids: [downloadSourceId, otherDownloadSourceId],
          }),
        ]);
      });

      it('should bump policies across all spaces on update', async () => {
        const policiesResBefore = await fetchAllPolicies();

        await apiClient.putDownloadSource(
          { name: `test multiple update ${Date.now()}`, host: 'https://elastic.co' },
          downloadSourceId
        );

        const policiesResAfter = await fetchAllPolicies();

        for (const policyRes of policiesResBefore) {
          const policyAfter = policiesResAfter.find((p) => p.item.id === policyRes.item.id);
          expect(policyAfter?.item.revision).to.be.greaterThan(policyRes.item.revision);
        }
      });

      it('should remove the deleted host from download_source_ids across spaces', async () => {
        const policiesResBefore = await fetchAllPolicies();

        for (const policyRes of policiesResBefore) {
          expect(policyRes.item.download_source_ids).to.eql([
            downloadSourceId,
            otherDownloadSourceId,
          ]);
        }

        await apiClient.deleteDownloadSource(downloadSourceId);

        const policiesResAfter = await fetchAllPolicies();

        for (const policyRes of policiesResAfter) {
          expect(policyRes.item.download_source_ids).to.eql([otherDownloadSourceId]);
        }
      });
    });

    describe('Fleet server host', () => {
      let fleetServerHostId: string;
      before(async () => {
        const res = await apiClient.postFleetServerHosts({
          name: `test ${Date.now()}`,
          host_urls: ['https://test.fr'],
        });
        fleetServerHostId = res.item.id;
        await Promise.all([
          apiClient.putAgentPolicy(defaultSpacePolicy1.item.id, {
            name: defaultSpacePolicy1.item.name,
            namespace: defaultSpacePolicy1.item.namespace,
            description: defaultSpacePolicy1.item.description,
            fleet_server_host_id: fleetServerHostId,
          }),
          apiClient.putAgentPolicy(allSpaceTestPolicy1.item.id, {
            name: allSpaceTestPolicy1.item.name,
            namespace: allSpaceTestPolicy1.item.namespace,
            description: allSpaceTestPolicy1.item.description,
            fleet_server_host_id: fleetServerHostId,
          }),
          apiClient.putAgentPolicy(
            spaceTest1Policy1.item.id,
            {
              name: spaceTest1Policy1.item.name,
              namespace: spaceTest1Policy1.item.namespace,
              description: spaceTest1Policy1.item.description,
              fleet_server_host_id: fleetServerHostId,
            },
            TEST_SPACE_1
          ),
        ]);
      });
      it('should remove fleet server host accross spaces', async () => {
        const policiesResBefore = await fetchAllPolicies();

        for (const policyRes of policiesResBefore) {
          expect(policyRes.item.fleet_server_host_id).to.be(fleetServerHostId);
        }

        await apiClient.deleteFleetServerHosts(fleetServerHostId);

        const policiesResAfter = await fetchAllPolicies();

        for (const policyRes of policiesResAfter) {
          expect(policyRes.item.fleet_server_host_id).not.to.be(fleetServerHostId);
        }
      });
    });

    describe('Output', () => {
      let outputId: string;
      before(async () => {
        const res = await apiClient.postOutput({
          name: `test ${Date.now()}`,
          type: 'elasticsearch',
          is_default: false,
          is_default_monitoring: false,
          hosts: ['https://test.fr'],
        });
        outputId = res.item.id;
        await Promise.all([
          apiClient.putAgentPolicy(defaultSpacePolicy1.item.id, {
            name: defaultSpacePolicy1.item.name,
            namespace: defaultSpacePolicy1.item.namespace,
            description: defaultSpacePolicy1.item.description,
            data_output_id: outputId,
            monitoring_output_id: outputId,
          }),
          apiClient.putAgentPolicy(allSpaceTestPolicy1.item.id, {
            name: allSpaceTestPolicy1.item.name,
            namespace: allSpaceTestPolicy1.item.namespace,
            description: allSpaceTestPolicy1.item.description,
            data_output_id: outputId,
            monitoring_output_id: outputId,
          }),
          apiClient.putAgentPolicy(
            spaceTest1Policy1.item.id,
            {
              name: spaceTest1Policy1.item.name,
              namespace: spaceTest1Policy1.item.namespace,
              description: spaceTest1Policy1.item.description,
              data_output_id: outputId,
              monitoring_output_id: outputId,
            },
            TEST_SPACE_1
          ),
        ]);
      });
      it('should remove output host accross spaces', async () => {
        const policiesResBefore = await fetchAllPolicies();

        for (const policyRes of policiesResBefore) {
          expect(policyRes.item.data_output_id).to.be(outputId);
          expect(policyRes.item.monitoring_output_id).to.be(outputId);
        }

        await apiClient.deleteOutput(outputId);

        const policiesResAfter = await fetchAllPolicies();

        for (const policyRes of policiesResAfter) {
          expect(policyRes.item.data_output_id).not.to.be(outputId);
          expect(policyRes.item.monitoring_output_id).not.to.be(outputId);
        }
      });
    });
  });
}
