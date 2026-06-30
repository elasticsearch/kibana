/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { omit, sortBy } from 'lodash';
import { emptyAssets } from '@kbn/streams-schema';
import type { Streams } from '@kbn/streams-schema';
import { v4 } from 'uuid';
import { STREAMS_ESQL_RULE_TYPE_ID } from '@kbn/rule-data-utils';
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
  const alertingApi = getService('alertingApiCommon');
  const samlAuth = getService('samlAuth');
  const kibanaServer = getService('kibanaServer');
  let roleAuthc: RoleCredentials;

  let apiClient: StreamsSupertestRepositoryClient;

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
        fields: {
          'attributes.numberfield': {
            type: 'long',
          },
        },
      },
      failure_store: { inherit: {} },
    },
  };

  describe('Queries API', function () {
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
      await samlAuth.invalidateM2mApiKeyWithRoleScope(roleAuthc);
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: false,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    beforeEach(async () => {
      await putStream(apiClient, STREAM_NAME, {
        stream,
        ...emptyAssets,
      });
    });

    afterEach(async () => {
      await deleteStream(apiClient, STREAM_NAME);
    });

    it('lists empty queries when none are defined on the stream', async () => {
      const response = await getQueries(apiClient, STREAM_NAME);

      expect(response).to.eql({ queries: [] });
    });

    it('lists queries when defined on the stream', async () => {
      const queries = [
        {
          id: v4(),
          type: 'match' as const,
          title: 'OutOfMemoryError',
          description: '',
          esql: {
            query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'OutOfMemoryError'")`,
          },
        },
        {
          id: v4(),
          type: 'match' as const,
          title: 'cluster_block_exception',
          description: '',
          esql: {
            query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'cluster_block_exception'")`,
          },
        },
      ];

      const bulkResponse = await bulkQueries(
        apiClient,
        STREAM_NAME,
        queries.map((query) => ({ index: omit(query, 'type') }))
      );
      expect(bulkResponse).to.have.property('acknowledged', true);

      const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
      expect(sortBy(getQueriesResponse.queries, 'id')).to.eql(sortBy(queries, 'id'));

      const rules = await alertingApi.searchRules(
        roleAuthc,
        'alert.attributes.name:OutOfMemoryError'
      );
      expect(rules.body.data).to.have.length(1);
      expect(rules.body.data[0].rule_type_id).to.eql(STREAMS_ESQL_RULE_TYPE_ID);
      expect(rules.body.data[0].params.query).to.eql(
        `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'OutOfMemoryError'")`
      );
    });

    it('rejects a stray top-level `queries` field on PUT and leaves detections unchanged', async () => {
      // Significant-event queries are not part of the stream upsert; request validation rejects a
      // stray `queries` field (DeepStrict) instead of silently dropping it. Cast past the type
      // that no longer allows `queries`.
      await putStream(
        apiClient,
        STREAM_NAME,
        {
          stream,
          ...emptyAssets,
          queries: [
            {
              id: v4(),
              title: 'stray query',
              esql: {
                query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'stray'")`,
              },
            },
          ],
        } as Streams.WiredStream.UpsertRequest,
        400
      );

      const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
      expect(getQueriesResponse.queries).to.eql([]);
    });

    describe('PUT /api/streams/{name}/queries/{queryId}', () => {
      it('inserts a query when inexistant', async () => {
        const query = {
          id: v4(),
          type: 'match' as const,
          title: 'initial title',
          description: '',
          esql: {
            query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'initial query'")`,
          },
        };
        const upsertQueryResponse = await apiClient
          .fetch('PUT /api/streams/{name}/queries/{queryId} 2023-10-31', {
            params: {
              path: { name: STREAM_NAME, queryId: query.id },
              body: {
                title: query.title,
                esql: query.esql,
              },
            },
          })
          .expect(200)
          .then((res) => res.body);
        expect(upsertQueryResponse.acknowledged).to.be(true);

        const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
        expect(getQueriesResponse.queries).to.eql([query]);

        const rules = await alertingApi.searchRules(roleAuthc, '');
        expect(rules.body.data).to.have.length(1);
        expect(rules.body.data[0].name).to.eql(query.title);
      });

      it('returns 400 and does not save when ES|QL query is missing METADATA _id,_source', async () => {
        const queryId = v4();
        await apiClient
          .fetch('PUT /api/streams/{name}/queries/{queryId} 2023-10-31', {
            params: {
              path: { name: STREAM_NAME, queryId },
              body: {
                title: 'missing metadata',
                esql: { query: `FROM ${STREAM_NAME},${STREAM_NAME}.* | WHERE KQL("message:'x'")` },
              },
            },
          })
          .expect(400);

        const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
        expect(getQueriesResponse.queries).to.eql([]);
      });

      it('returns 400 and does not save when ES|QL query references invalid sources', async () => {
        const queryId = v4();
        await apiClient
          .fetch('PUT /api/streams/{name}/queries/{queryId} 2023-10-31', {
            params: {
              path: { name: STREAM_NAME, queryId },
              body: {
                title: 'invalid sources',
                esql: { query: 'FROM logs.ecs METADATA _id, _source' },
              },
            },
          })
          .expect(400);

        const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
        expect(getQueriesResponse.queries).to.eql([]);
      });

      it('updates the query and create a new rule when updating an existing query esql', async () => {
        const query = {
          id: 'first',
          type: 'match' as const,
          title: 'initial title',
          description: '',
          esql: {
            query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("initial query")`,
          },
        };
        await bulkQueries(apiClient, STREAM_NAME, [{ index: omit(query, 'type') }]);
        const initialRules = await alertingApi.searchRules(roleAuthc, '');

        const updatedEsql = `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("updated query")`;
        const upsertQueryResponse = await apiClient
          .fetch('PUT /api/streams/{name}/queries/{queryId} 2023-10-31', {
            params: {
              path: { name: STREAM_NAME, queryId: query.id },
              body: {
                title: query.title,
                esql: { query: updatedEsql },
              },
            },
          })
          .expect(200)
          .then((res) => res.body);
        expect(upsertQueryResponse.acknowledged).to.be(true);

        const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
        expect(getQueriesResponse.queries).to.eql([
          {
            id: query.id,
            type: 'match',
            title: query.title,
            description: '',
            esql: { query: updatedEsql },
          },
        ]);

        const updatedRules = await alertingApi.searchRules(roleAuthc, '');
        expect(updatedRules.body.data).to.have.length(1);
        expect(updatedRules.body.data[0].name).to.eql(query.title);
        expect(updatedRules.body.data[0].id).not.to.eql(initialRules.body.data[0].id);
      });

      it('updates the query and the rule when updating an existing query title', async () => {
        const query = {
          id: 'first',
          type: 'match' as const,
          title: 'initial title',
          description: '',
          esql: {
            query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("initial query")`,
          },
        };
        await bulkQueries(apiClient, STREAM_NAME, [{ index: omit(query, 'type') }]);
        const initialRules = await alertingApi.searchRules(roleAuthc, '');

        const upsertQueryResponse = await apiClient
          .fetch('PUT /api/streams/{name}/queries/{queryId} 2023-10-31', {
            params: {
              path: { name: STREAM_NAME, queryId: query.id },
              body: {
                title: 'updated title',
                esql: query.esql,
              },
            },
          })
          .expect(200)
          .then((res) => res.body);
        expect(upsertQueryResponse.acknowledged).to.be(true);

        const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
        expect(getQueriesResponse.queries).to.eql([
          {
            id: query.id,
            type: 'match',
            title: 'updated title',
            description: '',
            esql: { query: query.esql.query },
          },
        ]);

        const updatedRules = await alertingApi.searchRules(roleAuthc, '');
        expect(updatedRules.body.data).to.have.length(1);
        expect(updatedRules.body.data[0].name).to.eql('updated title');
        expect(updatedRules.body.data[0].id).to.eql(initialRules.body.data[0].id);
      });
    });

    it('deletes an existing query and the associated rule successfully', async () => {
      const queryId = v4();
      await bulkQueries(apiClient, STREAM_NAME, [
        {
          index: {
            id: queryId,
            title: 'Significant Query',
            description: '',
            esql: {
              query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'query'")`,
            },
          },
        },
      ]);

      const deleteQueryResponse = await apiClient
        .fetch('DELETE /api/streams/{name}/queries/{queryId} 2023-10-31', {
          params: { path: { name: STREAM_NAME, queryId } },
        })
        .expect(200)
        .then((res) => res.body);
      expect(deleteQueryResponse.acknowledged).to.be(true);

      const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
      expect(getQueriesResponse.queries).to.eql([]);

      const rules = await alertingApi.searchRules(roleAuthc, '');
      expect(rules.body.data).to.have.length(0);
    });

    it('returns a 404 when deleting an inexistant query', async () => {
      const queryId = v4();
      await apiClient
        .fetch('DELETE /api/streams/{name}/queries/{queryId} 2023-10-31', {
          params: { path: { name: STREAM_NAME, queryId } },
        })
        .expect(404);
    });

    it('bulks insert and remove queries', async () => {
      const firstQuery = {
        id: 'first',
        type: 'match' as const,
        title: 'first query',
        description: '',
        esql: {
          query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("query 1")`,
        },
      };
      const secondQuery = {
        id: 'second',
        type: 'match' as const,
        title: 'second query',
        description: '',
        esql: {
          query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("query 2")`,
        },
      };
      const thirdQuery = {
        id: 'third',
        type: 'match' as const,
        title: 'third query',
        description: '',
        esql: {
          query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("query 3")`,
        },
      };
      await bulkQueries(
        apiClient,
        STREAM_NAME,
        [firstQuery, secondQuery, thirdQuery].map((query) => ({ index: omit(query, 'type') }))
      );
      const initialRules = await alertingApi.searchRules(roleAuthc, '');

      const newQuery = {
        id: 'fourth',
        title: 'fourth query',
        description: '',
        esql: {
          query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("query 4")`,
        },
      };
      const updateThirdQuery = {
        id: 'third',
        title: 'third query',
        description: '',
        esql: {
          query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("query 3 updated")`,
        },
      };

      const bulkResponse = await apiClient
        .fetch('POST /api/streams/{name}/queries/_bulk 2023-10-31', {
          params: {
            path: { name: STREAM_NAME },
            body: {
              operations: [
                {
                  index: newQuery,
                },
                {
                  delete: {
                    id: 'inexistant',
                  },
                },
                {
                  index: updateThirdQuery,
                },
                {
                  delete: {
                    id: 'second',
                  },
                },
              ],
            },
          },
        })
        .expect(200)
        .then((res) => res.body);
      expect(bulkResponse).to.have.property('acknowledged', true);

      const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
      const expectedQueries = [
        firstQuery,
        { ...updateThirdQuery, type: 'match' },
        { ...newQuery, type: 'match' },
      ];
      expect(sortBy(getQueriesResponse.queries, 'id')).to.eql(sortBy(expectedQueries, 'id'));

      const updatedRules = await alertingApi.searchRules(roleAuthc, '');
      expect(updatedRules.body.data).to.have.length(3);
      const ruleNames = updatedRules.body.data.map((rule: any) => rule.name);
      expect(ruleNames.includes(firstQuery.title)).to.be(true);
      expect(ruleNames.includes(updateThirdQuery.title)).to.be(true);
      expect(ruleNames.includes(newQuery.title)).to.be(true);

      const initialThirdRuleId = initialRules.body.data.find(
        (rule: any) => rule.name === thirdQuery.title
      ).id;
      expect(initialThirdRuleId).not.to.eql(
        updatedRules.body.data.find((rule: any) => rule.name === updateThirdQuery.title).id
      );
    });

    it('returns 400 and does not apply changes when bulk includes an invalid ES|QL query', async () => {
      const firstQuery = {
        id: 'first',
        type: 'match' as const,
        title: 'first query',
        description: '',
        esql: {
          query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("query 1")`,
        },
      };
      await bulkQueries(apiClient, STREAM_NAME, [{ index: omit(firstQuery, 'type') }]);

      const invalidQuery = {
        id: 'invalid',
        title: 'invalid query',
        description: '',
        esql: {
          query: `FROM ${STREAM_NAME},${STREAM_NAME}.* | WHERE KQL("query invalid")`,
        },
      };

      await apiClient
        .fetch('POST /api/streams/{name}/queries/_bulk 2023-10-31', {
          params: {
            path: { name: STREAM_NAME },
            body: {
              operations: [{ index: invalidQuery }, { delete: { id: firstQuery.id } }],
            },
          },
        })
        .expect(400);

      const getQueriesResponse = await getQueries(apiClient, STREAM_NAME);
      expect(getQueriesResponse.queries).to.eql([firstQuery]);
    });

    describe('POST /internal/streams/queries/_bulk_delete', () => {
      const SECOND_STREAM_NAME = 'logs.otel.queries-test-bulk-delete';

      beforeEach(async () => {
        await putStream(apiClient, SECOND_STREAM_NAME, { stream, ...emptyAssets });
      });

      afterEach(async () => {
        await deleteStream(apiClient, SECOND_STREAM_NAME);
      });

      it('deletes queries across multiple streams in one request', async () => {
        const firstQuery = {
          id: v4(),
          title: 'cross-stream bulk delete 1',
          description: '',
          esql: {
            query: `FROM ${STREAM_NAME},${STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'q1'")`,
          },
        };
        const secondQuery = {
          id: v4(),
          title: 'cross-stream bulk delete 2',
          description: '',
          esql: {
            query: `FROM ${SECOND_STREAM_NAME},${SECOND_STREAM_NAME}.* METADATA _id, _source | WHERE KQL("message:'q2'")`,
          },
        };

        await apiClient
          .fetch('POST /api/streams/{name}/queries/_bulk 2023-10-31', {
            params: {
              path: { name: STREAM_NAME },
              body: { operations: [{ index: firstQuery }] },
            },
          })
          .expect(200);
        await apiClient
          .fetch('POST /api/streams/{name}/queries/_bulk 2023-10-31', {
            params: {
              path: { name: SECOND_STREAM_NAME },
              body: { operations: [{ index: secondQuery }] },
            },
          })
          .expect(200);

        const response = await apiClient
          .fetch('POST /internal/streams/queries/_bulk_delete', {
            params: { body: { queryIds: [firstQuery.id, secondQuery.id] } },
          })
          .expect(200)
          .then((res) => res.body);

        expect(response).to.eql({ succeeded: 2, failed: 0, skipped: 0 });
        expect((await getQueries(apiClient, STREAM_NAME)).queries).to.eql([]);
        expect((await getQueries(apiClient, SECOND_STREAM_NAME)).queries).to.eql([]);
      });
    });
  });
}
