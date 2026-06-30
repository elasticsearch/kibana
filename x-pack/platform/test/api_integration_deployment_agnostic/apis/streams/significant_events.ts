/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { IngestStreamLifecycle, Streams } from '@kbn/streams-schema';
import { isDslLifecycle, isIlmLifecycle, emptyAssets } from '@kbn/streams-schema';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS } from '@kbn/management-settings-ids';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { StreamsSupertestRepositoryClient } from './helpers/repository_client';
import { createStreamsRepositoryAdminClient } from './helpers/repository_client';
import {
  bulkQueries,
  deleteStream,
  disableStreams,
  enableStreams,
  getQueries,
  putStream,
} from './helpers/requests';
import type { RoleCredentials } from '../../services';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const esClient = getService('es');
  const kibanaServer = getService('kibanaServer');
  const alertingApi = getService('alertingApiCommon');
  const samlAuth = getService('samlAuth');
  let roleAuthc: RoleCredentials;
  let apiClient: StreamsSupertestRepositoryClient;

  describe('Significant Events', function () {
    before(async () => {
      roleAuthc = await samlAuth.createM2mApiKeyWithRoleScope('admin');
      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
      await enableStreams(apiClient);
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: true,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    after(async () => {
      await disableStreams(apiClient);
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: false,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    describe('Wired streams update', () => {
      const STREAM_NAME = 'logs.otel.queries-test';
      const stream: Streams.WiredStream.UpsertRequest['stream'] = {
        type: 'wired',
        description: '',
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [] },
          settings: {},
          wired: {
            routing: [],
            fields: {},
          },
          failure_store: { inherit: {} },
        },
      };

      beforeEach(async () => {
        await putStream(apiClient, STREAM_NAME, {
          stream,
          ...emptyAssets,
        }).then((response) => expect(response).to.have.property('acknowledged', true));
      });

      afterEach(async () => {
        await deleteStream(apiClient, STREAM_NAME);
      });

      it('updates the queries', async () => {
        const esqlQuery = `FROM ${STREAM_NAME}, ${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message: 'OOM Error'")`;
        const response = await bulkQueries(apiClient, STREAM_NAME, [
          {
            index: {
              id: 'aaa',
              title: 'OOM Error',
              description: '',
              esql: { query: esqlQuery },
            },
          },
        ]);
        expect(response).to.have.property('acknowledged', true);

        const { queries } = await getQueries(apiClient, STREAM_NAME);
        expect(queries.length).to.eql(1);
        expect(queries[0]).to.eql({
          id: 'aaa',
          type: 'match',
          title: 'OOM Error',
          description: '',
          esql: { query: esqlQuery },
        });
      });

      it('deletes all queries on stream and its children', async () => {
        let response = await putStream(apiClient, STREAM_NAME, {
          stream: {
            ...stream,
            ingest: {
              ...stream.ingest,
              wired: {
                ...stream.ingest.wired,
                routing: [
                  {
                    destination: 'logs.otel.queries-test.child',
                    where: {
                      always: {},
                    },
                    status: 'enabled',
                  },
                ],
              },
            },
          },
          ...emptyAssets,
        });
        expect(response).to.have.property('acknowledged', true);
        await bulkQueries(apiClient, STREAM_NAME, [
          {
            index: {
              id: 'logs.otel.queries-test.query1',
              title: 'should not be deleted',
              description: '',
              esql: {
                query:
                  'FROM logs.otel.queries-test,logs.otel.queries-test.* METADATA _id, _source | WHERE KQL("message:\\"irrelevant\\"")',
              },
            },
          },
        ]);

        response = await putStream(apiClient, 'logs.otel.queries-test.child', {
          stream: {
            ...stream,
            ingest: {
              ...stream.ingest,
              wired: {
                ...stream.ingest.wired,
                routing: [
                  {
                    destination: 'logs.otel.queries-test.child.first',
                    where: {
                      field: 'attributes.field',
                      lt: 15,
                    },
                    status: 'enabled',
                  },
                  {
                    destination: 'logs.otel.queries-test.child.second',
                    where: {
                      field: 'attributes.field',
                      gt: 15,
                    },
                    status: 'enabled',
                  },
                ],
              },
            },
          },
          ...emptyAssets,
        });
        expect(response).to.have.property('acknowledged', true);
        await bulkQueries(apiClient, 'logs.otel.queries-test.child', [
          {
            index: {
              id: 'logs.otel.queries-test.child.query1',
              title: 'must be deleted',
              description: '',
              esql: {
                query:
                  'FROM logs.otel.queries-test.child,logs.otel.queries-test.child.* METADATA _id, _source | WHERE KQL("message:\\"irrelevant\\"")',
              },
            },
          },
        ]);

        response = await putStream(apiClient, 'logs.otel.queries-test.child.first', {
          stream,
          ...emptyAssets,
        });
        expect(response).to.have.property('acknowledged', true);
        await bulkQueries(apiClient, 'logs.otel.queries-test.child.first', [
          {
            index: {
              id: 'logs.otel.queries-test.child.first.query1',
              title: 'must be deleted',
              description: '',
              esql: {
                query:
                  'FROM logs.otel.queries-test.child.first,logs.otel.queries-test.child.first.* METADATA _id, _source | WHERE KQL("message:\\"irrelevant\\"")',
              },
            },
          },
          {
            index: {
              id: 'logs.otel.queries-test.child.first.query2',
              title: 'must be deleted',
              description: '',
              esql: {
                query:
                  'FROM logs.otel.queries-test.child.first,logs.otel.queries-test.child.first.* METADATA _id, _source | WHERE KQL("message:\\"irrelevant\\"")',
              },
            },
          },
        ]);

        await deleteStream(apiClient, 'logs.otel.queries-test.child');

        // the parent stream keeps its query while the deleted child subtree's queries are gone
        const { queries: parentQueries } = await getQueries(apiClient, STREAM_NAME);
        expect(parentQueries).to.have.length(1);
        expect(parentQueries[0].id).to.eql('logs.otel.queries-test.query1');

        const rules = await alertingApi.searchRules(roleAuthc, '');
        expect(rules.body.data).to.have.length(1);
        expect(rules.body.data[0].name).to.eql('should not be deleted');
      });
    });

    describe('Classic streams update', () => {
      const classicPutBody: Streams.ClassicStream.UpsertRequest = {
        stream: {
          type: 'classic',
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            classic: {},
            failure_store: { inherit: {} },
          },
        },
        ...emptyAssets,
      };

      const createDataStream = async (name: string, lifecycle: IngestStreamLifecycle) => {
        await esClient.indices.putIndexTemplate({
          name,
          index_patterns: [name],
          data_stream: {},
          template: isDslLifecycle(lifecycle)
            ? {
                lifecycle: { data_retention: lifecycle.dsl.data_retention },
                settings: {
                  'index.lifecycle.prefer_ilm': false,
                  'index.default_pipeline': 'logs@default-pipeline',
                },
              }
            : isIlmLifecycle(lifecycle)
            ? {
                settings: {
                  'index.default_pipeline': 'logs@default-pipeline',
                  'index.lifecycle.prefer_ilm': true,
                  'index.lifecycle.name': lifecycle.ilm.policy,
                },
              }
            : undefined,
        });
        await esClient.indices.createDataStream({ name });

        return async () => {
          await esClient.indices.deleteDataStream({ name });
          await esClient.indices.deleteIndexTemplate({ name });
        };
      };

      it('updates the queries', async () => {
        const indexName = 'classic-stream-queries';
        const esqlQuery = `FROM ${indexName} METADATA _id, _source | WHERE KQL("message: 'OOM Error'")`;
        const clean = await createDataStream(indexName, { dsl: { data_retention: '77d' } });
        await putStream(apiClient, indexName, classicPutBody);

        const initialQueries = await getQueries(apiClient, indexName);
        expect(initialQueries.queries.length).to.eql(0);

        await bulkQueries(apiClient, indexName, [
          {
            index: {
              id: 'aaa',
              title: 'OOM Error',
              description: '',
              esql: { query: esqlQuery },
            },
          },
        ]);

        const { queries } = await getQueries(apiClient, indexName);
        expect(queries.length).to.eql(1);
        expect(queries[0]).to.eql({
          id: 'aaa',
          type: 'match',
          title: 'OOM Error',
          description: '',
          esql: { query: esqlQuery },
        });

        await clean();
        await deleteStream(apiClient, indexName);
      });
    });
  });
}
