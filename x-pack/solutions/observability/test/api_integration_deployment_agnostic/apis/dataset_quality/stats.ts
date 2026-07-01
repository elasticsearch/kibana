/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LogsSynthtraceEsClient, SyntheticsSynthtraceEsClient } from '@kbn/synthtrace';
import { log, syntheticsMonitor, timerange } from '@kbn/synthtrace-client';
import expect from '@kbn/expect';
import rison from '@kbn/rison';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { RoleCredentials, SupertestWithRoleScopeType } from '../../services';
import { customRoles } from './custom_roles';
import { addIntegrationToLogIndexTemplate, cleanLogIndexTemplate } from './utils';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const customRoleScopedSupertest = getService('customRoleScopedSupertest');
  const saml = getService('samlAuth');
  const synthtrace = getService('synthtrace');
  const es = getService('es');
  const retry = getService('retry');

  async function callApiAs(
    roleScopedSupertestWithCookieCredentials: SupertestWithRoleScopeType,
    types: Array<'logs' | 'metrics' | 'traces' | 'synthetics'> = ['logs'],
    includeCreationDate = false
  ) {
    return roleScopedSupertestWithCookieCredentials
      .get('/internal/dataset_quality/data_streams/stats')
      .query({
        types: rison.encodeArray(types),
        includeCreationDate,
      });
  }

  const waitForSizeBytes = async (
    roleScopedSupertestWithCookieCredentials: SupertestWithRoleScopeType,
    types: Array<'logs' | 'metrics' | 'traces' | 'synthetics'> = ['logs'],
    includeCreationDate = false
  ) => {
    // Metering stats api is cached and refreshed every 30 seconds
    await retry.waitForWithTimeout('Metering stats cache is refreshed', 45000, async () => {
      const res = await callApiAs(
        roleScopedSupertestWithCookieCredentials,
        types,
        includeCreationDate
      );
      if (res.body.dataStreamsStats[0].sizeBytes === 0) {
        throw new Error("Metering stats cache hasn't refreshed");
      }
      return true;
    });
  };

  describe('Stats', function () {
    // This disables the forward-compatibility test for Kibana 8.19 with ES upgraded to 9.0.
    // These versions are not expected to work together.
    // The tests raise "unknown index privilege [read_failure_store]" error in ES 9.0.
    this.onlyEsVersion('8.19 || >=9.1');

    let synthtraceLogsEsClient: LogsSynthtraceEsClient;
    let syntheticsSynthrace: SyntheticsSynthtraceEsClient;

    async function ingestDocuments({
      from = '2023-11-20T15:00:00.000Z',
      to = '2023-11-20T15:01:00.000Z',
      interval = '1m',
      rate = 1,
      dataset = 'synth.1',
    }: { from?: string; to?: string; interval?: string; rate?: number; dataset?: string } = {}) {
      await synthtraceLogsEsClient.index([
        timerange(from, to)
          .interval(interval)
          .rate(rate)
          .generator((timestamp) =>
            log
              .create()
              .message('This is a log message')
              .timestamp(timestamp)
              .dataset(dataset)
              .defaults({
                'log.file.path': '/my-service.log',
              })
          ),
      ]);
    }

    before(async () => {
      synthtraceLogsEsClient = synthtrace.createLogsSynthtraceEsClient();
      syntheticsSynthrace = synthtrace.createSyntheticsEsClient();
    });

    after(async () => {
      await synthtraceLogsEsClient.clean();
    });

    describe('No access user', () => {
      let supertestNoAccessWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.noAccessUserRole);
        supertestNoAccessWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
      });

      it('returns user authorization as false for noAccessUser', async () => {
        const resp = await callApiAs(supertestNoAccessWithCookieCredentials);

        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canRead).to.be(false);
        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canMonitor).to.be(
          false
        );
        expect(resp.body.datasetUserPrivileges.canViewIntegrations).to.be(false);
        expect(resp.body.dataStreamsStats).to.eql([]);
      });
    });

    describe('Read user', () => {
      let supertestReadWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.readUserRole);
        supertestReadWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
      });

      it('get empty stats for a readUser', async () => {
        const resp = await callApiAs(supertestReadWithCookieCredentials);

        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canRead).to.be(true);
        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canMonitor).to.be(
          false
        );
        expect(resp.body.datasetUserPrivileges.canViewIntegrations).to.be(false);
        expect(resp.body.dataStreamsStats).to.eql([]);
      });
    });

    // A role with `read` + `view_index_metadata` but no `monitor`:
    // - wildcard canMonitor (from getDatasetPrivileges) is true — it uses view_index_metadata
    // - per-stream canMonitor is false — it uses the monitor privilege directly
    describe('Read + view_index_metadata user (no monitor)', () => {
      let supertestReadViewMetaWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.readAndViewMetadataUserRole);
        supertestReadViewMetaWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();

        await synthtraceLogsEsClient.index([
          timerange('2023-11-20T15:00:00.000Z', '2023-11-20T15:01:00.000Z')
            .interval('1m')
            .rate(1)
            .generator((timestamp) =>
              log
                .create()
                .message('This is a log message')
                .timestamp(timestamp)
                .dataset('synth.1')
                .defaults({ 'log.file.path': '/my-service.log' })
            ),
        ]);
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
        await synthtraceLogsEsClient.clean();
      });

      it('reports canMonitor true and canRead true for the wildcard', async () => {
        const resp = await callApiAs(supertestReadViewMetaWithCookieCredentials);

        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canRead).to.be(true);
        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canMonitor).to.be(
          true
        );
      });

      it('reports canMonitor false per data stream because monitor privilege is absent', async () => {
        const resp = await callApiAs(supertestReadViewMetaWithCookieCredentials);

        const stream = resp.body.dataStreamsStats.find(
          ({ name }: { name: string }) => name === 'logs-synth.1-default'
        );
        expect(stream).to.be.ok();
        expect(stream.userPrivileges.canMonitor).to.be(false);
      });
    });

    // A role built with a negated/complement index pattern (excluding `logs-apm*`)
    // can read most logs data streams while the wildcard `logs-*-*` privilege check
    // returns false. Stats must still list the accessible streams and omit the
    // excluded ones, so the page is usable for such roles.
    describe('Negated logs role with partial stream access', () => {
      const accessibleDataStreamName = 'logs-synth-default';
      const excludedDataStreamName = 'logs-apm.error-default';

      let supertestNegatedWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await synthtraceLogsEsClient.index([
          timerange('2023-11-20T15:00:00.000Z', '2023-11-20T15:01:00.000Z')
            .interval('1m')
            .rate(1)
            .generator((timestamp) => [
              log
                .create()
                .message('Accessible log message')
                .timestamp(timestamp)
                .dataset('synth')
                .defaults({ 'log.file.path': '/my-service.log' }),
              log
                .create()
                .message('Excluded log message')
                .timestamp(timestamp)
                .dataset('apm.error')
                .defaults({ 'log.file.path': '/my-service.log' }),
            ]),
        ]);

        await saml.setCustomRole(customRoles.negatedLogsUserRole);
        supertestNegatedWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
        await synthtraceLogsEsClient.clean();
      });

      it('lists accessible logs streams and omits negated ones despite the wildcard check failing', async () => {
        const resp = await callApiAs(supertestNegatedWithCookieCredentials);

        // Wildcard privilege check fails for the negated role.
        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canRead).to.be(false);

        const names = resp.body.dataStreamsStats.map(({ name }: { name: string }) => name);
        expect(names).to.contain(accessibleDataStreamName);
        expect(names).to.not.contain(excludedDataStreamName);
      });
    });

    describe('uncategorized datastreams', () => {
      let supertestDatasetQualityMonitorWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.datasetQualityMonitorUserRole);
        supertestDatasetQualityMonitorWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();

        await synthtraceLogsEsClient.index([
          timerange('2023-11-20T15:00:00.000Z', '2023-11-20T15:01:00.000Z')
            .interval('1m')
            .rate(1)
            .generator((timestamp) =>
              log.create().message('This is a log message').timestamp(timestamp).defaults({
                'log.file.path': '/my-service.log',
              })
            ),
        ]);
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
        await synthtraceLogsEsClient.clean();
      });

      it('returns stats correctly', async () => {
        await waitForSizeBytes(supertestDatasetQualityMonitorWithCookieCredentials);
        const stats = await callApiAs(supertestDatasetQualityMonitorWithCookieCredentials);

        expect(stats.body.dataStreamsStats.length).to.be(1);
        expect(stats.body.dataStreamsStats[0].integration).not.ok();
        expect(stats.body.dataStreamsStats[0].sizeBytes).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].lastActivity).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].totalDocs).greaterThan(0);
      });
    });

    describe('categorized datastreams', () => {
      const integration = 'my-custom-integration';
      let supertestDatasetQualityMonitorWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.datasetQualityMonitorUserRole);
        supertestDatasetQualityMonitorWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();
        await addIntegrationToLogIndexTemplate({ esClient: es, name: integration });

        await synthtraceLogsEsClient.index([
          timerange('2023-11-20T15:00:00.000Z', '2023-11-20T15:01:00.000Z')
            .interval('1m')
            .rate(1)
            .generator((timestamp) =>
              log.create().message('This is a log message').timestamp(timestamp).defaults({
                'log.file.path': '/my-service.log',
              })
            ),
        ]);
      });

      after(async () => {
        await cleanLogIndexTemplate({ esClient: es });
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
        await synthtraceLogsEsClient.clean();
      });

      it('returns stats correctly', async () => {
        await waitForSizeBytes(supertestDatasetQualityMonitorWithCookieCredentials);
        const stats = await callApiAs(supertestDatasetQualityMonitorWithCookieCredentials);

        expect(stats.body.dataStreamsStats.length).to.be(1);
        expect(stats.body.dataStreamsStats[0].integration).to.be(integration);
        expect(stats.body.dataStreamsStats[0].sizeBytes).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].lastActivity).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].totalDocs).greaterThan(0);
      });

      it('does not return creation date by default', async () => {
        const stats = await callApiAs(supertestDatasetQualityMonitorWithCookieCredentials);
        expect(stats.body.dataStreamsStats[0].creationDate).to.be(undefined);
      });

      it('returns creation date when specified', async () => {
        const stats = await callApiAs(
          supertestDatasetQualityMonitorWithCookieCredentials,
          ['logs'],
          true
        );
        expect(stats.body.dataStreamsStats[0].creationDate).greaterThan(0);
      });
    });

    describe('query schema accepts types and datasetQuery together', () => {
      let supertestDatasetQualityMonitorWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.datasetQualityMonitorUserRole);
        supertestDatasetQualityMonitorWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
      });

      it('accepts both types and datasetQuery in a single request', async () => {
        const resp = await supertestDatasetQualityMonitorWithCookieCredentials
          .get('/internal/dataset_quality/data_streams/stats')
          .query({
            types: rison.encodeArray(['logs']),
            datasetQuery: 'synth',
          });

        expect(resp.status).to.be(200);
      });
    });

    describe('multiple dataStream types are requested', () => {
      let supertestDatasetQualityMonitorWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.datasetQualityMonitorUserRole);
        supertestDatasetQualityMonitorWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();
        await synthtraceLogsEsClient.index([
          timerange('2023-11-20T15:00:00.000Z', '2023-11-20T15:01:00.000Z')
            .interval('1m')
            .rate(1)
            .generator((timestamp) => [
              log.create().message('This is a log message').timestamp(timestamp).defaults({
                'log.file.path': '/my-service.log',
              }),
            ]),
        ]);
        await syntheticsSynthrace.index([
          timerange('2023-11-20T15:00:00.000Z', '2023-11-20T15:01:00.000Z')
            .interval('1m')
            .rate(1)
            .generator((timestamp) => [
              syntheticsMonitor.create().dataset('http').timestamp(timestamp),
            ]),
        ]);
      });

      it('returns stats correctly', async () => {
        await waitForSizeBytes(supertestDatasetQualityMonitorWithCookieCredentials, [
          'logs',
          'synthetics',
        ]);
        const stats = await callApiAs(supertestDatasetQualityMonitorWithCookieCredentials, [
          'logs',
          'synthetics',
        ]);

        expect(stats.body.dataStreamsStats.length).to.be(2);
        expect(stats.body.dataStreamsStats[0].sizeBytes).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].lastActivity).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].totalDocs).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].name).match(new RegExp(/^logs-[\w.]+-[\w.]+/));
        expect(stats.body.dataStreamsStats[1].sizeBytes).greaterThan(0);
        expect(stats.body.dataStreamsStats[1].lastActivity).greaterThan(0);
        expect(stats.body.dataStreamsStats[1].totalDocs).greaterThan(0);
        expect(stats.body.dataStreamsStats[1].name).match(new RegExp(/^synthetics-[\w.]+-[\w.]+/));
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
        await synthtraceLogsEsClient.clean();
        await syntheticsSynthrace.clean();
      });
    });

    describe('Dataset quality monitor user', () => {
      let supertestDatasetQualityMonitorWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await saml.setCustomRole(customRoles.datasetQualityMonitorUserRole);
        supertestDatasetQualityMonitorWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await saml.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await saml.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await saml.deleteCustomRole();
      });

      it('returns non empty stats for an authorized user', async () => {
        await ingestDocuments();
        await waitForSizeBytes(supertestDatasetQualityMonitorWithCookieCredentials);
        const stats = await callApiAs(supertestDatasetQualityMonitorWithCookieCredentials);

        expect(stats.body.dataStreamsStats[0].sizeBytes).greaterThan(0);
        expect(stats.body.dataStreamsStats[0].lastActivity).greaterThan(0);
      });

      it('get list of privileged data streams for datasetQualityMonitorUser', async () => {
        // Index only one document to logs-test-1-default and logs-test-1-default data stream using synthtrace
        await ingestDocuments({ dataset: 'test.1' });
        await ingestDocuments({ dataset: 'test.2' });
        const resp = await callApiAs(supertestDatasetQualityMonitorWithCookieCredentials);

        expect(resp.body.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canMonitor).to.be(
          true
        );
        expect(
          resp.body.dataStreamsStats
            .map(
              ({
                name,
                userPrivileges: { canMonitor: hasPrivilege },
              }: {
                name: string;
                userPrivileges: { canMonitor: boolean };
              }) => ({
                name,
                hasPrivilege,
              })
            )
            .filter(({ name }: { name: string }) => name.includes('test'))
        ).to.eql([
          { name: 'logs-test.1-default', hasPrivilege: true },
          { name: 'logs-test.2-default', hasPrivilege: true },
        ]);
      });
    });

    describe('Admin user', () => {
      let supertestAdminWithCookieCredentials: SupertestWithRoleScopeType;

      before(async () => {
        supertestAdminWithCookieCredentials = await roleScopedSupertest.getSupertestWithRoleScope(
          'admin',
          {
            useCookieHeader: true,
            withInternalHeaders: true,
          }
        );
      });

      it('returns correct user privileges for an elevated user', async () => {
        const resp = await callApiAs(supertestAdminWithCookieCredentials);

        expect(resp.body.datasetUserPrivileges).to.eql({
          datasetsPrivilages: {
            'logs-*-*': {
              canRead: true,
              canMonitor: true,
              canReadFailureStore: true,
              canManageFailureStore: true,
            },
          },
          canViewIntegrations: true,
        });
      });
    });
  });
}
