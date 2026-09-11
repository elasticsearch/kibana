/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest, testData } from '../fixtures';
import { RULE_AUTHOR_RUN_SAVED_ONLY_ROLE } from '../fixtures/roles';

apiTest.describe(
  'Detection rules with Osquery response actions',
  { tag: [...tags.stateful.all, ...tags.serverless.security.complete] },
  () => {
    let credentials: RoleApiCredentials;
    let runSavedOnlyCredentials: RoleApiCredentials;
    let packSavedObjectId: string;
    let savedQueryId: string;
    let savedQuerySoId: string;
    const createdRuleIds: string[] = [];

    apiTest.beforeAll(async ({ requestAuth, apiServices }) => {
      credentials = await requestAuth.getApiKeyForPrivilegedUser();
      runSavedOnlyCredentials = await requestAuth.getApiKeyForCustomRole(
        RULE_AUTHOR_RUN_SAVED_ONLY_ROLE
      );

      const packResponse = await apiServices.osquery.packs.create(
        testData.getMinimalPack({
          name: `ra-pack-${Date.now()}`,
          queries: {
            memoryInfo: {
              query: 'SELECT * FROM memory_info;',
              interval: 3600,
              platform: 'linux',
            },
            systemInfo: {
              query: 'SELECT * FROM system_info;',
              interval: 3600,
            },
          },
        })
      );
      packSavedObjectId = (packResponse.data as Record<string, Record<string, string>>).data
        .saved_object_id;

      const savedQueryResponse = await apiServices.osquery.savedQueries.create(
        testData.getMinimalSavedQuery()
      );
      const savedQueryData = (savedQueryResponse.data as Record<string, Record<string, string>>)
        .data;
      savedQueryId = savedQueryData.id;
      savedQuerySoId = savedQueryData.saved_object_id;
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      for (const ruleId of createdRuleIds) {
        await kbnClient.request({
          method: 'DELETE',
          path: `/api/detection_engine/rules?id=${ruleId}`,
          headers: { 'elastic-api-version': testData.OSQUERY_API_VERSION },
          ignoreErrors: [404],
        });
      }

      if (packSavedObjectId) {
        await apiServices.osquery.packs.delete(packSavedObjectId);
      }

      if (savedQuerySoId) {
        await apiServices.osquery.savedQueries.delete(savedQuerySoId);
      }
    });

    apiTest('creates a rule with a single Osquery query action', async ({ apiClient }) => {
      const ruleBody = testData.getMinimalRule({
        response_actions: [
          {
            action_type_id: '.osquery',
            params: { query: 'select * from uptime;' },
          },
        ],
      });

      const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
        headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
        body: ruleBody,
        responseType: 'json',
      });
      expect(createResponse).toHaveStatusCode(200);
      expect(createResponse.body).toBeDefined();
      createdRuleIds.push(createResponse.body.id);

      expect(createResponse.body.response_actions).toHaveLength(1);
      expect(createResponse.body.response_actions[0]).toMatchObject({
        action_type_id: '.osquery',
        params: expect.objectContaining({ query: 'select * from uptime;' }),
      });

      const getResponse = await apiClient.get(
        `${testData.API_PATHS.DETECTION_RULES}?id=${createResponse.body.id}`,
        {
          headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
          responseType: 'json',
        }
      );
      expect(getResponse).toHaveStatusCode(200);
      expect(getResponse.body).toBeDefined();
      expect(getResponse.body.response_actions).toHaveLength(1);
      expect(getResponse.body.response_actions[0].params.query).toBe('select * from uptime;');
    });

    apiTest(
      'creates a rule with full Osquery params including ecs_mapping and timeout',
      async ({ apiClient }) => {
        const ruleBody = testData.getMinimalRule({
          response_actions: [
            {
              action_type_id: '.osquery',
              params: {
                query: 'select * from os_version;',
                ecs_mapping: { 'host.os.name': { field: 'name' } },
                timeout: 120,
              },
            },
          ],
        });

        const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
          body: ruleBody,
          responseType: 'json',
        });
        expect(createResponse).toHaveStatusCode(200);
        expect(createResponse.body).toBeDefined();
        createdRuleIds.push(createResponse.body.id);

        const { params } = createResponse.body.response_actions[0];
        expect(params.query).toBe('select * from os_version;');
        expect(params.ecs_mapping).toStrictEqual({ 'host.os.name': { field: 'name' } });
        expect(params.timeout).toBe(120);
      }
    );

    apiTest('creates a rule with pack-based Osquery action', async ({ apiClient }) => {
      const ruleBody = testData.getMinimalRule({
        response_actions: [
          {
            action_type_id: '.osquery',
            params: {
              pack_id: packSavedObjectId,
              queries: [
                {
                  id: 'memoryInfo',
                  query: 'SELECT * FROM memory_info;',
                  interval: 3600,
                  platform: 'linux',
                },
                {
                  id: 'systemInfo',
                  query: 'SELECT * FROM system_info;',
                  interval: 3600,
                },
              ],
            },
          },
        ],
      });

      const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
        headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
        body: ruleBody,
        responseType: 'json',
      });
      expect(createResponse).toHaveStatusCode(200);
      expect(createResponse.body).toBeDefined();
      createdRuleIds.push(createResponse.body.id);

      const { params } = createResponse.body.response_actions[0];
      expect(params.pack_id).toBe(packSavedObjectId);
      expect(params.queries).toHaveLength(2);
    });

    apiTest('updates a rule to add Osquery response actions', async ({ apiClient }) => {
      const ruleBody = testData.getMinimalRule();
      const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
        headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
        body: ruleBody,
        responseType: 'json',
      });
      expect(createResponse).toHaveStatusCode(200);
      expect(createResponse.body).toBeDefined();
      createdRuleIds.push(createResponse.body.id);

      const updateResponse = await apiClient.put(testData.API_PATHS.DETECTION_RULES, {
        headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
        body: {
          ...ruleBody,
          id: createResponse.body.id,
          response_actions: [
            {
              action_type_id: '.osquery',
              params: { query: 'select * from uptime;' },
            },
          ],
        },
        responseType: 'json',
      });
      expect(updateResponse).toHaveStatusCode(200);
      expect(updateResponse.body.response_actions).toHaveLength(1);

      const getResponse = await apiClient.get(
        `${testData.API_PATHS.DETECTION_RULES}?id=${createResponse.body.id}`,
        {
          headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
          responseType: 'json',
        }
      );
      expect(getResponse).toHaveStatusCode(200);
      expect(getResponse.body).toBeDefined();
      expect(getResponse.body.response_actions).toHaveLength(1);
    });

    apiTest('updates a rule to remove Osquery response actions', async ({ apiClient }) => {
      const ruleBody = testData.getMinimalRule({
        response_actions: [
          {
            action_type_id: '.osquery',
            params: { query: 'select * from uptime;' },
          },
        ],
      });
      const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
        headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
        body: ruleBody,
        responseType: 'json',
      });
      expect(createResponse).toHaveStatusCode(200);
      expect(createResponse.body).toBeDefined();
      createdRuleIds.push(createResponse.body.id);
      expect(createResponse.body.response_actions).toHaveLength(1);

      const updateResponse = await apiClient.put(testData.API_PATHS.DETECTION_RULES, {
        headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
        body: {
          ...ruleBody,
          id: createResponse.body.id,
          response_actions: [],
        },
        responseType: 'json',
      });
      expect(updateResponse).toHaveStatusCode(200);
      expect(updateResponse.body.response_actions).toHaveLength(0);
    });

    apiTest(
      'creates a rule with multiple Osquery actions of different types',
      async ({ apiClient }) => {
        const ruleBody = testData.getMinimalRule({
          response_actions: [
            {
              action_type_id: '.osquery',
              params: { query: 'select * from uptime;' },
            },
            {
              action_type_id: '.osquery',
              params: {
                pack_id: packSavedObjectId,
                queries: [
                  {
                    id: 'memoryInfo',
                    query: 'SELECT * FROM memory_info;',
                    interval: 3600,
                  },
                ],
              },
            },
            {
              action_type_id: '.osquery',
              params: {
                query: 'select * from os_version;',
                ecs_mapping: { 'host.os.platform': { field: 'platform' } },
                timeout: 300,
              },
            },
          ],
        });

        const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
          body: ruleBody,
          responseType: 'json',
        });
        expect(createResponse).toHaveStatusCode(200);
        expect(createResponse.body).toBeDefined();
        createdRuleIds.push(createResponse.body.id);

        const actions = createResponse.body.response_actions;
        expect(actions).toHaveLength(3);
        expect(actions[0].params.query).toBe('select * from uptime;');
        expect(actions[1].params.pack_id).toBe(packSavedObjectId);
        expect(actions[2].params.ecs_mapping).toStrictEqual({
          'host.os.platform': { field: 'platform' },
        });
      }
    );

    const mismatchedOsqueryAction = () => ({
      action_type_id: '.osquery' as const,
      params: {
        saved_query_id: savedQueryId,
        query: 'select 42 as custom;',
      },
    });

    const buildRulesImportMultipart = (rule: object) => {
      const ndjson = `${JSON.stringify(rule)}\n`;
      const boundary = '----scoutFormBoundary';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="rules.ndjson"',
        'Content-Type: application/x-ndjson',
        '',
        ndjson,
        `--${boundary}--`,
        '',
      ].join('\r\n');

      return {
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body: Buffer.from(body),
      };
    };

    apiTest(
      'rejects a mismatched query on rule create for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const response = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...runSavedOnlyCredentials.apiKeyHeader },
          body: testData.getMinimalRule({
            response_actions: [mismatchedOsqueryAction()],
          }),
          responseType: 'json',
        });

        // Register before asserting: if this ever regresses to a 200, the rule really was
        // created and still needs cleaning up, but the failing assertion would skip the push.
        if (response.statusCode === 200 && response.body?.id) {
          createdRuleIds.push(response.body.id);
        }

        expect(response).toHaveStatusCode(403);
      }
    );

    apiTest(
      'rejects a queries array on rule create for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const response = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...runSavedOnlyCredentials.apiKeyHeader },
          body: testData.getMinimalRule({
            response_actions: [
              {
                action_type_id: '.osquery',
                params: {
                  saved_query_id: savedQueryId,
                  queries: [{ id: 'x', query: 'select 42 as custom;' }],
                },
              },
            ],
          }),
          responseType: 'json',
        });

        // Register before asserting - see the note on the mismatched-query test above.
        if (response.statusCode === 200 && response.body?.id) {
          createdRuleIds.push(response.body.id);
        }

        expect(response).toHaveStatusCode(403);
      }
    );

    apiTest(
      'accepts a resolvable saved-query response action for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const response = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...runSavedOnlyCredentials.apiKeyHeader },
          body: testData.getMinimalRule({
            response_actions: [
              {
                action_type_id: '.osquery',
                params: { saved_query_id: savedQueryId },
              },
            ],
          }),
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(200);
        createdRuleIds.push(response.body.id);
      }
    );

    apiTest(
      'accepts a pack response action with copied queries for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const response = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...runSavedOnlyCredentials.apiKeyHeader },
          body: testData.getMinimalRule({
            response_actions: [
              {
                action_type_id: '.osquery',
                params: {
                  pack_id: packSavedObjectId,
                  queries: [
                    {
                      id: 'memoryInfo',
                      query: 'SELECT * FROM memory_info;',
                      interval: 3600,
                    },
                  ],
                },
              },
            ],
          }),
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(200);
        createdRuleIds.push(response.body.id);
      }
    );

    apiTest(
      'rejects a mismatched query on rule update for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const ruleBody = testData.getMinimalRule();
        const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
          body: ruleBody,
          responseType: 'json',
        });
        expect(createResponse).toHaveStatusCode(200);
        createdRuleIds.push(createResponse.body.id);

        const updateResponse = await apiClient.put(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...runSavedOnlyCredentials.apiKeyHeader },
          body: {
            ...ruleBody,
            id: createResponse.body.id,
            response_actions: [mismatchedOsqueryAction()],
          },
          responseType: 'json',
        });

        expect(updateResponse).toHaveStatusCode(403);
      }
    );

    apiTest(
      'rejects a mismatched query on rule patch for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
          body: testData.getMinimalRule(),
          responseType: 'json',
        });
        expect(createResponse).toHaveStatusCode(200);
        createdRuleIds.push(createResponse.body.id);

        const patchResponse = await apiClient.patch(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...runSavedOnlyCredentials.apiKeyHeader },
          body: {
            id: createResponse.body.id,
            response_actions: [mismatchedOsqueryAction()],
          },
          responseType: 'json',
        });

        expect(patchResponse).toHaveStatusCode(403);
      }
    );

    apiTest(
      'rejects a mismatched query on rule import for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const rule = testData.getMinimalRule({
          rule_id: `ra-import-${Date.now()}`,
          response_actions: [mismatchedOsqueryAction()],
        });
        const multipart = buildRulesImportMultipart(rule);

        const importResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES_IMPORT, {
          headers: {
            ...runSavedOnlyCredentials.apiKeyHeader,
            'kbn-xsrf': testData.COMMON_HEADERS['kbn-xsrf'],
            'x-elastic-internal-origin': 'kibana',
            'elastic-api-version': testData.OSQUERY_API_VERSION,
            ...multipart.headers,
          },
          body: multipart.body,
          responseType: 'json',
        });

        expect(importResponse).toHaveStatusCode(200);
        expect(importResponse.body).toStrictEqual(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                error: expect.objectContaining({ status_code: 403 }),
              }),
            ]),
          })
        );
      }
    );

    apiTest(
      'rejects a mismatched query on bulk duplicate for a runSavedQueries-only author',
      async ({ apiClient }) => {
        const createResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES, {
          headers: { ...testData.COMMON_HEADERS, ...credentials.apiKeyHeader },
          body: testData.getMinimalRule({
            response_actions: [mismatchedOsqueryAction()],
          }),
          responseType: 'json',
        });
        expect(createResponse).toHaveStatusCode(200);
        createdRuleIds.push(createResponse.body.id);

        const bulkResponse = await apiClient.post(testData.API_PATHS.DETECTION_RULES_BULK_ACTION, {
          headers: { ...testData.COMMON_HEADERS, ...runSavedOnlyCredentials.apiKeyHeader },
          body: {
            action: 'duplicate',
            ids: [createResponse.body.id],
            duplicate: { include_exceptions: false, include_expired_exceptions: false },
          },
          responseType: 'json',
        });

        // Register any duplicates before asserting: `expect` throws synchronously, so if this
        // ever regresses to a 200 the rules would survive into the next run on the shared
        // server — and that regression is exactly the escalation this test guards against.
        const created = (
          bulkResponse.body as { attributes?: { results?: { created?: Array<{ id: string }> } } }
        ).attributes?.results?.created;
        if (created) {
          for (const rule of created) {
            createdRuleIds.push(rule.id);
          }
        }

        // The bulk actions route reports per-rule failures with a 500 envelope; the
        // authz rejection itself is surfaced as `status_code: 403` in `attributes.errors`.
        expect(bulkResponse).toHaveStatusCode(500);
        expect(bulkResponse.body).toStrictEqual(
          expect.objectContaining({
            attributes: expect.objectContaining({
              errors: expect.arrayContaining([expect.objectContaining({ status_code: 403 })]),
            }),
          })
        );
      }
    );
  }
);
