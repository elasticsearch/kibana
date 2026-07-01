/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { log, timerange } from '@kbn/synthtrace-client';
import expect from '@kbn/expect';

import type { APIClientRequestParamsOf } from '@kbn/dataset-quality-plugin/common/rest';
import type { LogsSynthtraceEsClient } from '@kbn/synthtrace';
import type { DataStreamDocsStat } from '@kbn/dataset-quality-plugin/common/api_types';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { RoleCredentials, SupertestWithRoleScopeType } from '../../services';
import { closeDataStream, rolloverDataStream } from './utils';
import { customRoles } from './custom_roles';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const esClient = getService('es');
  const samlAuth = getService('samlAuth');
  const roleScopedSupertest = getService('roleScopedSupertest');
  const customRoleScopedSupertest = getService('customRoleScopedSupertest');
  const synthtrace = getService('synthtrace');
  const from = '2024-09-20T11:00:00.000Z';
  const to = '2024-09-20T11:01:00.000Z';
  const dataStreamType = 'logs';
  const dataset = 'synth';
  const syntheticsDataset = 'synthetics';
  const namespace = 'default';
  const serviceName = 'my-service';
  const hostName = 'synth-host';
  const dataStreamName = `${dataStreamType}-${dataset}-${namespace}`;
  const syntheticsDataStreamName = `${dataStreamType}-${syntheticsDataset}-${namespace}`;

  const endpoint = 'GET /internal/dataset_quality/data_streams/total_docs';
  type ApiParams = APIClientRequestParamsOf<typeof endpoint>['params']['query'];

  async function callApiAs({
    roleScopedSupertestWithCookieCredentials,
    apiParams: { type, start, end },
  }: {
    roleScopedSupertestWithCookieCredentials: SupertestWithRoleScopeType;
    apiParams: ApiParams;
  }) {
    return roleScopedSupertestWithCookieCredentials
      .get(`/internal/dataset_quality/data_streams/total_docs`)
      .query({
        type,
        start,
        end,
      });
  }

  describe('DataStream total docs', function () {
    // this mutes the forward-compatibility test with Elasticsearch, 8.19 kibana and 9.0 ES.
    // There are not expected to work together.
    this.onlyEsVersion('8.19 || >=9.1');

    let adminRoleAuthc: RoleCredentials;
    let supertestAdminWithCookieCredentials: SupertestWithRoleScopeType;
    let synthtraceLogsEsClient: LogsSynthtraceEsClient;

    before(async () => {
      synthtraceLogsEsClient = await synthtrace.createLogsSynthtraceEsClient();
      adminRoleAuthc = await samlAuth.createM2mApiKeyWithRoleScope('admin');
      supertestAdminWithCookieCredentials = await roleScopedSupertest.getSupertestWithRoleScope(
        'admin',
        {
          useCookieHeader: true,
          withInternalHeaders: true,
        }
      );
    });

    after(async () => {
      await samlAuth.invalidateM2mApiKeyWithRoleScope(adminRoleAuthc);
    });

    describe('when all data streams are open', () => {
      before(async () => {
        await synthtraceLogsEsClient.index([
          timerange(from, to)
            .interval('1m')
            .rate(1)
            .generator((timestamp) => [
              log
                .create()
                .message('This is a log message')
                .timestamp(timestamp)
                .dataset(dataset)
                .namespace(namespace)
                .defaults({
                  'log.file.path': '/my-service.log',
                  'service.name': serviceName,
                  'host.name': hostName,
                }),
              log
                .create()
                .message('This is a log message')
                .timestamp(timestamp)
                .dataset(syntheticsDataset)
                .namespace(namespace)
                .defaults({
                  'log.file.path': '/my-service.log',
                  'service.name': serviceName,
                  'host.name': hostName,
                }),
            ]),
        ]);
      });

      after(async () => {
        await synthtraceLogsEsClient.clean();
      });

      it('returns number of documents per DataStream', async () => {
        const resp = await callApiAs({
          roleScopedSupertestWithCookieCredentials: supertestAdminWithCookieCredentials,
          apiParams: {
            type: dataStreamType,
            start: from,
            end: to,
          },
        });

        expect(resp.body.totalDocs.length).to.be(2);
        expect(resp.body.totalDocs[0].dataset).to.be(dataStreamName);
        expect(resp.body.totalDocs[0].count).to.be(1);
        expect(resp.body.totalDocs[1].dataset).to.be(syntheticsDataStreamName);
        expect(resp.body.totalDocs[1].count).to.be(1);
      });

      it('returns empty when all documents are outside timeRange', async () => {
        const resp = await callApiAs({
          roleScopedSupertestWithCookieCredentials: supertestAdminWithCookieCredentials,
          apiParams: {
            type: dataStreamType,
            start: '2024-09-21T11:00:00.000Z',
            end: '2024-09-21T11:01:00.000Z',
          },
        });

        expect(resp.body.totalDocs.length).to.be(0);
      });
    });

    describe('when there are data streams closed', () => {
      before(async () => {
        await synthtraceLogsEsClient.index([
          timerange(from, to)
            .interval('1m')
            .rate(1)
            .generator((timestamp) =>
              log
                .create()
                .message('This is a log message')
                .timestamp(timestamp)
                .dataset('synth.open')
                .defaults({
                  'log.file.path': '/my-service.log',
                })
            ),
          timerange(from, to)
            .interval('1m')
            .rate(1)
            .generator((timestamp) =>
              log
                .create()
                .message('This is a log message')
                .timestamp(timestamp)
                .dataset('synth.closed')
                .defaults({
                  'log.file.path': '/my-service.log',
                })
            ),
        ]);

        await closeDataStream(esClient, 'logs-synth.closed-default');
      });

      after(async () => {
        await synthtraceLogsEsClient.clean();
      });

      it('returns stats correctly', async () => {
        const stats = await callApiAs({
          roleScopedSupertestWithCookieCredentials: supertestAdminWithCookieCredentials,
          apiParams: {
            type: dataStreamType,
            start: from,
            end: to,
          },
        });

        expect(stats.body.totalDocs.length).to.be(1);

        const docsStats = stats.body.totalDocs.reduce(
          (acc: Record<string, { count: number }>, curr: DataStreamDocsStat) => ({
            ...acc,
            [curr.dataset]: {
              count: curr.count,
            },
          }),
          {}
        );

        expect(docsStats['logs-synth.open-default']).to.eql({
          count: 1,
        });
      });

      describe('when new backing indices are open', () => {
        before(async () => {
          await rolloverDataStream(esClient, 'logs-synth.closed-default');

          await synthtraceLogsEsClient.index([
            timerange(from, to)
              .interval('1m')
              .rate(1)
              .generator((timestamp) =>
                log
                  .create()
                  .message('This is a log message')
                  .timestamp(timestamp)
                  .dataset('synth.open')
                  .defaults({
                    'log.file.path': '/my-service.log',
                  })
              ),
            timerange(from, to)
              .interval('1m')
              .rate(1)
              .generator((timestamp) =>
                log
                  .create()
                  .message('This is a log message')
                  .timestamp(timestamp)
                  .dataset('synth.closed')
                  .defaults({
                    'log.file.path': '/my-service.log',
                  })
              ),
          ]);
        });

        after(async () => {
          await synthtraceLogsEsClient.clean();
        });

        it('returns stats correctly when some of the backing indices are closed and others are open', async () => {
          const stats = await callApiAs({
            roleScopedSupertestWithCookieCredentials: supertestAdminWithCookieCredentials,
            apiParams: {
              type: dataStreamType,
              start: from,
              end: to,
            },
          });
          expect(stats.body.totalDocs.length).to.be(2);

          const docsStats = stats.body.totalDocs.reduce(
            (acc: Record<string, { count: number }>, curr: DataStreamDocsStat) => ({
              ...acc,
              [curr.dataset]: {
                count: curr.count,
              },
            }),
            {}
          );

          expect(docsStats['logs-synth.open-default']).to.eql({
            count: 2,
          });
          expect(docsStats['logs-synth.closed-default']).to.eql({
            count: 1,
          });
        });
      });
    });

    describe('No access user', () => {
      let supertestNoAccessWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await samlAuth.setCustomRole(customRoles.noAccessUserRole);
        supertestNoAccessWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await samlAuth.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await samlAuth.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await samlAuth.deleteCustomRole();
      });

      it('should return a 403 when the user does not have sufficient privileges', async () => {
        const res = await callApiAs({
          roleScopedSupertestWithCookieCredentials: supertestNoAccessWithCookieCredentials,
          apiParams: {
            type: dataStreamType,
            start: from,
            end: to,
          },
        });
        expect(res.statusCode).to.be(403);
      });
    });

    // A user with only logs access gets 403 when requesting a non-log type: no
    // accessible streams are found and the wildcard read check also fails.
    describe('Read-only logs user requesting non-log types', () => {
      let supertestReadWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        await samlAuth.setCustomRole(customRoles.readUserRole);
        supertestReadWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await samlAuth.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await samlAuth.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await samlAuth.deleteCustomRole();
      });

      for (const nonLogType of ['metrics', 'traces', 'synthetics'] as const) {
        it(`returns 403 for type="${nonLogType}" when the user only has logs access`, async () => {
          const res = await callApiAs({
            roleScopedSupertestWithCookieCredentials: supertestReadWithCookieCredentials,
            apiParams: { type: nonLogType, start: from, end: to },
          });

          expect(res.statusCode).to.be(403);
        });
      }
    });

    // A role built with a negated/complement index pattern (excluding `logs-apm*`)
    // can still read most logs data streams, but the wildcard `logs-*-*`
    // `_has_privileges` read check returns false. The endpoint must not 403; it
    // should return counts for the accessible streams only.
    describe('Negated logs role with partial stream access', () => {
      const accessibleDataset = 'synth';
      const excludedDataset = 'apm.error';
      const accessibleDataStreamName = `${dataStreamType}-${accessibleDataset}-${namespace}`;
      const excludedDataStreamName = `${dataStreamType}-${excludedDataset}-${namespace}`;

      let supertestNegatedWithCookieCredentials: SupertestWithRoleScopeType;
      let roleAuthc: RoleCredentials;

      before(async () => {
        // Index different doc counts so the test can assert counts, not just names.
        // accessible: 1 doc, excluded: 3 docs — verifies excluded docs are not folded in.
        await synthtraceLogsEsClient.index([
          timerange(from, to)
            .interval('1m')
            .rate(1)
            .generator((timestamp) => [
              log
                .create()
                .message('Accessible log message')
                .timestamp(timestamp)
                .dataset(accessibleDataset)
                .namespace(namespace)
                .defaults({ 'log.file.path': '/my-service.log' }),
            ]),
          timerange(from, to)
            .interval('20s')
            .rate(1)
            .generator((timestamp) => [
              log
                .create()
                .message('Excluded log message')
                .timestamp(timestamp)
                .dataset(excludedDataset)
                .namespace(namespace)
                .defaults({ 'log.file.path': '/my-service.log' }),
            ]),
        ]);

        await samlAuth.setCustomRole(customRoles.negatedLogsUserRole);
        supertestNegatedWithCookieCredentials =
          await customRoleScopedSupertest.getSupertestWithCustomRoleScope({
            useCookieHeader: true,
            withInternalHeaders: true,
          });
        roleAuthc = await samlAuth.createM2mApiKeyWithCustomRoleScope();
      });

      after(async () => {
        await synthtraceLogsEsClient.clean();
        await samlAuth.invalidateM2mApiKeyWithRoleScope(roleAuthc);
        await samlAuth.deleteCustomRole();
      });

      it('returns 200 with counts only for accessible streams; excluded stream docs are not counted', async () => {
        const res = await callApiAs({
          roleScopedSupertestWithCookieCredentials: supertestNegatedWithCookieCredentials,
          apiParams: {
            type: dataStreamType,
            start: from,
            end: to,
          },
        });

        expect(res.statusCode).to.be(200);

        const statsByDataset = res.body.totalDocs.reduce(
          (acc: Record<string, number>, stat: DataStreamDocsStat) => {
            acc[stat.dataset] = stat.count;
            return acc;
          },
          {}
        );

        // The accessible stream must appear with its own count (1 doc).
        expect(statsByDataset[accessibleDataStreamName]).to.be.greaterThan(0);
        // The excluded stream must not appear at all — its docs must not be
        // folded into any result entry, proving the wildcard aggregation is auth-scoped.
        expect(statsByDataset[excludedDataStreamName]).to.be(undefined);
      });
    });
  });
}
