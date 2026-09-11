/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { alertingAuthorizationMock } from '@kbn/alerting-plugin/server/authorization/alerting_authorization.mock';
import { ruleDataServiceMock } from '../rule_data_plugin_service/rule_data_plugin_service.mock';
import type { ConstructorOptions } from './alerts_client';
import { AlertsClient } from './alerts_client';
import { fromKueryExpression } from '@kbn/es-query';
import { IndexPatternsFetcher } from '@kbn/data-views-plugin/server';
import { MAX_ALERT_IDS_PER_REQUEST } from './constants';

describe('AlertsClient', () => {
  const alertingAuthMock = alertingAuthorizationMock.create();
  const ruleDataService = ruleDataServiceMock.create();
  const requestHandlerContext = coreMock.createRequestHandlerContext();
  const esClientScopedMock = requestHandlerContext.elasticsearch.client.asCurrentUser;
  const esClientMock = requestHandlerContext.elasticsearch.client.asInternalUser;
  const getRuleListMock = jest.fn();
  const getAlertIndicesAliasMock = jest.fn();

  let alertsClient: AlertsClient;

  beforeEach(() => {
    jest.clearAllMocks();
    alertingAuthMock.getSpaceId.mockReturnValue('space-1');
    alertingAuthMock.getAllAuthorizedRuleTypesFindOperation.mockResolvedValue(
      new Map([
        [
          'test-rule-type-1',
          {
            id: 'test-rule-type-1',
            authorizedConsumers: { foo: { all: true, read: true } },
          },
        ],
      ])
    );

    alertingAuthMock.getAuthorizationFilter.mockResolvedValue({
      filter: fromKueryExpression(
        'alert.attributes.alertTypeId: test-rule-type-1 AND alert.attributes.consumer: foo'
      ),
      ensureRuleTypeIsAuthorized: jest.fn(),
    });

    const alertsClientParams: ConstructorOptions = {
      logger: loggingSystemMock.create().get(),
      authorization: alertingAuthMock,
      esClient: esClientMock,
      esClientScoped: esClientScopedMock,
      ruleDataService,
      getRuleType: jest.fn(),
      getRuleList: getRuleListMock,
      getAlertIndicesAlias: getAlertIndicesAliasMock,
    };

    alertsClient = new AlertsClient(alertsClientParams);
  });

  describe('find', () => {
    it('creates the ruleTypeIds filter correctly', async () => {
      await alertsClient.find({ ruleTypeIds: ['test-rule-type-1', 'test-rule-type-2'] });

      expect(esClientMock.search.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "_source": undefined,
          "aggs": undefined,
          "expand_wildcards": Array [
            "open",
            "hidden",
          ],
          "fields": Array [
            "kibana.alert.rule.rule_type_id",
            "kibana.alert.rule.consumer",
            "kibana.alert.workflow_status",
            "kibana.space_ids",
          ],
          "ignore_unavailable": true,
          "index": ".alerts-*",
          "query": Object {
            "bool": Object {
              "filter": Array [
                Object {
                  "arguments": Array [
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "alert.attributes.alertTypeId",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "test-rule-type-1",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "alert.attributes.consumer",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "foo",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                  ],
                  "function": "and",
                  "type": "function",
                },
                Object {
                  "terms": Object {
                    "kibana.space_ids": Array [
                      "space-1",
                      "*",
                    ],
                  },
                },
                Object {
                  "terms": Object {
                    "kibana.alert.rule.rule_type_id": Array [
                      "test-rule-type-1",
                      "test-rule-type-2",
                    ],
                  },
                },
              ],
              "must": Array [],
              "must_not": Array [],
              "should": Array [],
            },
          },
          "runtime_mappings": undefined,
          "seq_no_primary_term": true,
          "size": undefined,
          "sort": Array [
            Object {
              "@timestamp": Object {
                "order": "asc",
                "unmapped_type": "date",
              },
            },
          ],
          "track_total_hits": undefined,
        }
      `);
    });

    it('creates the consumers filter correctly', async () => {
      await alertsClient.find({ consumers: ['test-consumer-1', 'test-consumer-2'] });

      expect(esClientMock.search.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "_source": undefined,
          "aggs": undefined,
          "expand_wildcards": Array [
            "open",
            "hidden",
          ],
          "fields": Array [
            "kibana.alert.rule.rule_type_id",
            "kibana.alert.rule.consumer",
            "kibana.alert.workflow_status",
            "kibana.space_ids",
          ],
          "ignore_unavailable": true,
          "index": ".alerts-*",
          "query": Object {
            "bool": Object {
              "filter": Array [
                Object {
                  "arguments": Array [
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "alert.attributes.alertTypeId",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "test-rule-type-1",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                    Object {
                      "arguments": Array [
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "alert.attributes.consumer",
                        },
                        Object {
                          "isQuoted": false,
                          "type": "literal",
                          "value": "foo",
                        },
                      ],
                      "function": "is",
                      "type": "function",
                    },
                  ],
                  "function": "and",
                  "type": "function",
                },
                Object {
                  "terms": Object {
                    "kibana.space_ids": Array [
                      "space-1",
                      "*",
                    ],
                  },
                },
                Object {
                  "terms": Object {
                    "kibana.alert.rule.consumer": Array [
                      "test-consumer-1",
                      "test-consumer-2",
                    ],
                  },
                },
              ],
              "must": Array [],
              "must_not": Array [],
              "should": Array [],
            },
          },
          "runtime_mappings": undefined,
          "seq_no_primary_term": true,
          "size": undefined,
          "sort": Array [
            Object {
              "@timestamp": Object {
                "order": "asc",
                "unmapped_type": "date",
              },
            },
          ],
          "track_total_hits": undefined,
        }
      `);
    });
  });

  describe('getAlertFields', () => {
    beforeEach(async () => {
      jest.spyOn({ getRuleList: getRuleListMock }, 'getRuleList').mockReturnValue(new Map([]));
      jest
        .spyOn(alertingAuthMock, 'getAllAuthorizedRuleTypesFindOperation')
        .mockResolvedValue(new Map([]));

      jest
        .spyOn({ getAlertIndicesAlias: getAlertIndicesAliasMock }, 'getAlertIndicesAlias')
        .mockImplementation((ruleTypeIds: string[]) => {
          return [];
        });

      IndexPatternsFetcher.prototype.getFieldsForWildcard = jest.fn().mockResolvedValue({
        fields: [],
        indices: [],
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('should fetch all rule types when ruleTypeIds is empty array', async () => {
      await alertsClient.getAlertFields([]);

      expect(getRuleListMock).toHaveBeenCalled();
    });

    test('should fetch alert indices separately for siem and other rule types', async () => {
      jest.spyOn(alertingAuthMock, 'getAllAuthorizedRuleTypesFindOperation').mockResolvedValueOnce(
        // @ts-expect-error: mocking only necessary methods
        new Map([
          ['.es-query', {}],
          ['logs.alert.document.count', {}],
          ['siem.esqlRule', {}],
        ])
      );

      await alertsClient.getAlertFields([
        '.es-query',
        'logs.alert.document.count',
        'siem.esqlRule',
      ]);

      expect(getRuleListMock).not.toHaveBeenCalled();

      expect(getAlertIndicesAliasMock).toHaveBeenCalledTimes(2);
      expect(getAlertIndicesAliasMock).toHaveBeenNthCalledWith(1, ['siem.esqlRule']);
      expect(getAlertIndicesAliasMock).toHaveBeenNthCalledWith(2, [
        '.es-query',
        'logs.alert.document.count',
      ]);
    });

    test('should fetch alert fields correctly', async () => {
      jest.spyOn(alertingAuthMock, 'getAllAuthorizedRuleTypesFindOperation').mockResolvedValueOnce(
        // @ts-expect-error: mocking only necessary methods
        new Map([
          ['.es-query', {}],
          ['logs.alert.document.count', {}],
          ['siem.esqlRule', {}],
        ])
      );

      jest
        .spyOn({ getAlertIndicesAlias: getAlertIndicesAliasMock }, 'getAlertIndicesAlias')
        .mockImplementation((ruleTypeIds: string[]) => {
          if (ruleTypeIds.includes('siem.esqlRule')) {
            return ['.alerts-security.alerts-default'];
          } else {
            return ['.alerts-stack.alerts-default', '.alerts-observability.logs.alerts-default'];
          }
        });

      IndexPatternsFetcher.prototype.getFieldsForWildcard = jest
        .fn()
        .mockResolvedValueOnce({
          fields: [
            { name: '@timestamp', type: 'date' },
            { name: 'event.category', type: 'string' },
            { name: 'signal.status', type: 'keyword' },
          ],
          indices: ['.alerts-security.alerts-default'],
        })
        .mockResolvedValueOnce({
          fields: [
            { name: 'message', type: 'string' },
            { name: 'log.level', type: 'string' },
          ],
          indices: ['.alerts-stack.alerts-default', '.alerts-observability.logs.alerts-default'],
        });

      const response = await alertsClient.getAlertFields([
        '.es-query',
        'logs.alert.document.count',
        'siem.esqlRule',
      ]);

      expect(getRuleListMock).not.toHaveBeenCalled();

      expect(response.fields).toEqual([
        {
          name: 'message',
          type: 'string',
        },
        {
          name: 'log.level',
          type: 'string',
        },
        {
          name: '@timestamp',
          type: 'date',
        },
        {
          name: 'event.category',
          type: 'string',
        },
        { name: 'signal.status', type: 'keyword' },
      ]);
    });

    test('returns only SIEM fields when no other rule types are authorized', async () => {
      // Mock authorization to return only SIEM rule types
      jest
        .spyOn(alertingAuthMock, 'getAllAuthorizedRuleTypesFindOperation')
        .mockResolvedValueOnce(new Map([['siem.esqlRule', { authorizedConsumers: {} }]]));

      jest
        .spyOn({ getAlertIndicesAlias: getAlertIndicesAliasMock }, 'getAlertIndicesAlias')
        .mockImplementation((ruleTypeIds: string[]) => {
          if (ruleTypeIds.includes('siem.esqlRule')) {
            return ['.alerts-security.alerts-default'];
          } else {
            return [];
          }
        });

      IndexPatternsFetcher.prototype.getFieldsForWildcard = jest
        .fn()
        .mockResolvedValueOnce({
          fields: [
            { name: '@timestamp', type: 'date' },
            { name: 'event.category', type: 'string' },
            { name: 'signal.status', type: 'keyword' },
          ],
          indices: ['.alerts-security.alerts-default'],
        })
        .mockResolvedValueOnce({
          fields: [],
          indices: [],
        });

      const response = await alertsClient.getAlertFields(['siem.esqlRule']);

      expect(getRuleListMock).not.toHaveBeenCalled();

      // should not fetch other fields as there are no other indices
      expect(IndexPatternsFetcher.prototype.getFieldsForWildcard).toHaveBeenCalledTimes(1);

      expect(IndexPatternsFetcher.prototype.getFieldsForWildcard).toHaveBeenCalledWith({
        fieldCapsOptions: {
          allow_no_indices: true,
        },
        includeEmptyFields: false,
        indexFilter: {
          range: {
            '@timestamp': {
              gte: 'now-90d',
            },
          },
        },
        pattern: ['.alerts-security.alerts-default'],
        metaFields: ['_id', '_index'],
      });

      expect(response.fields).toHaveLength(3);
      expect(response.fields).toEqual([
        { name: '@timestamp', type: 'date' },
        { name: 'event.category', type: 'string' },
        { name: 'signal.status', type: 'keyword' },
      ]);
    });

    test('merges fields and removes duplicates', async () => {
      jest.spyOn(alertingAuthMock, 'getAllAuthorizedRuleTypesFindOperation').mockResolvedValueOnce(
        // @ts-expect-error: mocking only necessary methods
        new Map([
          ['.es-query', {}],
          ['logs.alert.document.count', {}],
          ['siem.esqlRule', {}],
        ])
      );

      jest
        .spyOn({ getAlertIndicesAlias: getAlertIndicesAliasMock }, 'getAlertIndicesAlias')
        .mockImplementation((ruleTypeIds: string[]) => {
          if (ruleTypeIds.includes('siem.esqlRule')) {
            return ['.alerts-security.alerts-default'];
          } else {
            return ['.alerts-stack.alerts-default'];
          }
        });

      IndexPatternsFetcher.prototype.getFieldsForWildcard = jest
        .fn()
        .mockResolvedValueOnce({
          fields: [
            { name: 'user.name', type: 'string' },
            { name: 'source.ip', type: 'ip' },
          ],
          indices: ['.alerts-security.alerts-default'],
        })
        .mockResolvedValueOnce({
          fields: [
            { name: 'source.ip', type: 'ip' },
            { name: 'destination.port', type: 'number' },
          ],
          indices: ['.alerts-stack.alerts-default'],
        });

      const response = await alertsClient.getAlertFields(['siem.esqlRule', '.es-query']);

      expect(response.fields).toHaveLength(3);
      expect(response.fields).toEqual([
        { name: 'source.ip', type: 'ip' },
        { name: 'destination.port', type: 'number' },
        { name: 'user.name', type: 'string' },
      ]);
    });

    test('returns empty fields when no rule types are authorized', async () => {
      jest
        .spyOn(alertingAuthMock, 'getAllAuthorizedRuleTypesFindOperation')
        .mockResolvedValueOnce(new Map());
      const response = await alertsClient.getAlertFields(['siem.esqlRule']);
      expect(response.fields).toHaveLength(0);
    });

    test('returns empty fields when no indices are found', async () => {
      jest.spyOn(alertingAuthMock, 'getAllAuthorizedRuleTypesFindOperation').mockResolvedValueOnce(
        // @ts-expect-error: mocking only necessary methods
        new Map([['siem.esqlRule', {}]])
      );

      jest
        .spyOn({ getAlertIndicesAlias: getAlertIndicesAliasMock }, 'getAlertIndicesAlias')
        .mockImplementation(() => []);

      const response = await alertsClient.getAlertFields(['siem.esqlRule']);

      expect(response.fields).toHaveLength(0);
    });
  });

  describe('bulkUpdateTags', () => {
    beforeEach(() => {
      esClientMock.updateByQuery.mockResolvedValue({
        total: 2,
        updated: 2,
        failures: [],
      });
    });

    describe('validation', () => {
      it('should return early when no operations are provided', async () => {
        await expect(
          alertsClient.bulkUpdateTags({
            alertIds: ['alert-1', 'alert-2'],
            index: '.alerts-security.alerts-default',
          })
        ).rejects.toMatchInlineSnapshot(`[Error: No tags to add or remove were provided]`);

        expect(esClientMock.updateByQuery).not.toHaveBeenCalled();
      });

      it.each([
        [[], ''],
        [undefined, undefined],
        [null, null],
      ])('should throw error when alert ids is %s and query is %s', async (alertIds, query) => {
        await expect(
          alertsClient.bulkUpdateTags({
            alertIds,
            query,
            index: '.alerts-security.alerts-default',
            add: ['urgent', 'production'],
          })
        ).rejects.toMatchInlineSnapshot(
          `[Error: No alert ids or query were provided for updating]`
        );

        expect(esClientMock.updateByQuery).not.toHaveBeenCalled();
      });

      it('should handle empty add array', async () => {
        await expect(
          alertsClient.bulkUpdateTags({
            alertIds: ['alert-1', 'alert-2'],
            index: '.alerts-security.alerts-default',
            add: [],
          })
        ).rejects.toMatchInlineSnapshot(`[Error: No tags to add or remove were provided]`);
      });

      it('should handle empty remove array', async () => {
        await expect(
          alertsClient.bulkUpdateTags({
            alertIds: ['alert-1', 'alert-2'],
            index: '.alerts-security.alerts-default',
            remove: [],
          })
        ).rejects.toMatchInlineSnapshot(`[Error: No tags to add or remove were provided]`);
      });

      it(`should throw error when there are more than ${MAX_ALERT_IDS_PER_REQUEST} alert ids`, async () => {
        await expect(
          alertsClient.bulkUpdateTags({
            alertIds: Array.from(
              { length: MAX_ALERT_IDS_PER_REQUEST + 1 },
              (_, i) => `alert-${i + 1}`
            ),
            index: '.alerts-security.alerts-default',
            remove: [],
          })
        ).rejects.toMatchInlineSnapshot(`[Error: Cannot use more than 1000 ids]`);
      });
    });

    describe('With alertIds', () => {
      beforeEach(() => {
        // @ts-expect-error: only the aggregations field is needed for this test
        esClientMock.search.mockResolvedValue({
          aggregations: {
            ruleTypeIds: {
              buckets: [
                {
                  key: 'rule-type-id-1',
                  consumers: { buckets: [{ key: 'consumer-1' }, { key: 'consumer-2' }] },
                },
                {
                  key: 'rule-type-id-2',
                  consumers: { buckets: [{ key: 'consumer-1' }, { key: 'consumer-3' }] },
                },
              ],
            },
          },
        });
      });

      it('authorizes the alerts correctly', async () => {
        await alertsClient.bulkUpdateTags({
          alertIds: ['alert-1', 'alert-2'],
          index: '.alerts-security.alerts-default',
          add: ['urgent', 'production'],
        });

        expect(alertingAuthMock.bulkEnsureAuthorized).toHaveBeenCalledWith({
          entity: 'alert',
          operation: 'update',
          ruleTypeIdConsumersPairs: [
            {
              consumers: ['consumer-1', 'consumer-2'],
              ruleTypeId: 'rule-type-id-1',
            },
            {
              consumers: ['consumer-1', 'consumer-3'],
              ruleTypeId: 'rule-type-id-2',
            },
          ],
        });
      });

      it('should bulk update alerts correctly', async () => {
        await alertsClient.bulkUpdateTags({
          alertIds: ['alert-1', 'alert-2'],
          index: '.alerts-security.alerts-default',
          add: ['urgent', 'production'],
          remove: ['outdated', 'test'],
        });

        expect(esClientMock.updateByQuery).toHaveBeenCalledTimes(1);
      });

      it('should scope the updateByQuery to the current space', async () => {
        await alertsClient.bulkUpdateTags({
          alertIds: ['alert-1', 'alert-2'],
          index: '.alerts-security.alerts-default',
          add: ['urgent'],
        });

        const query = esClientMock.updateByQuery.mock.calls[0][0].query;
        expect(query).toEqual({
          bool: {
            filter: [
              { ids: { values: ['alert-1', 'alert-2'] } },
              { terms: { 'kibana.space_ids': ['space-1', '*'] } },
            ],
          },
        });
      });

      it('should construct the query and aggs correctly when getting the rule type ids and consumers', async () => {
        await alertsClient.bulkUpdateTags({
          alertIds: ['alert-1', 'alert-2'],
          index: '.alerts-security.alerts-default',
          add: ['urgent', 'production'],
          remove: ['outdated', 'test'],
        });

        expect(esClientMock.search).toHaveBeenCalledTimes(1);

        expect(esClientMock.search.mock.calls[0][0]).toMatchInlineSnapshot(`
          Object {
            "aggs": Object {
              "ruleTypeIds": Object {
                "aggs": Object {
                  "consumers": Object {
                    "terms": Object {
                      "field": "kibana.alert.rule.consumer",
                      "size": 100,
                    },
                  },
                },
                "terms": Object {
                  "field": "kibana.alert.rule.rule_type_id",
                  "size": 100,
                },
              },
            },
            "index": ".alerts-security.alerts-default",
            "query": Object {
              "bool": Object {
                "filter": Array [
                  Object {
                    "terms": Object {
                      "kibana.space_ids": Array [
                        "space-1",
                        "*",
                      ],
                    },
                  },
                  Object {
                    "ids": Object {
                      "values": Array [
                        "alert-1",
                        "alert-2",
                      ],
                    },
                  },
                ],
              },
            },
            "size": 0,
          }
        `);
      });

      it('should format the response correctly with success and error', async () => {
        esClientMock.updateByQuery.mockResolvedValue({
          total: 2,
          updated: 1,
          failures: [
            {
              id: 'alert-2',
              index: '.alerts-security.alerts-default',
              status: 1,
              cause: { type: 'some_error', reason: 'Something went wrong' },
            },
          ],
        });

        const res = await alertsClient.bulkUpdateTags({
          alertIds: ['alert-1', 'alert-2'],
          index: '.alerts-security.alerts-default',
          add: ['urgent', 'production'],
          remove: ['outdated', 'test'],
        });

        expect(esClientMock.updateByQuery).toHaveBeenCalledTimes(1);

        expect(res).toEqual({
          failures: [
            {
              id: 'alert-2',
              index: '.alerts-security.alerts-default',
              code: 'some_error',
              message: 'Something went wrong',
            },
          ],
          total: 2,
          updated: 1,
        });
      });

      it('should throw if no rule type ids are found by the auth aggs', async () => {
        // @ts-expect-error: only the aggregations field is needed for this test
        esClientMock.search.mockResolvedValue({
          aggregations: {
            ruleTypeIds: {
              buckets: [
                {
                  key: 'rule-type-id-1',
                  consumers: { buckets: [] },
                },
              ],
            },
          },
        });

        await expect(
          alertsClient.bulkUpdateTags({
            alertIds: ['alert-1', 'alert-2'],
            index: '.alerts-security.alerts-default',
            add: ['urgent', 'production'],
            remove: ['outdated', 'test'],
          })
        ).rejects.toMatchInlineSnapshot(
          `[Error: Not authorized to access any of the requested alerts]`
        );
      });

      it('should throw if no consumers are found by the auth aggs', async () => {
        // @ts-expect-error: only the aggregations field is needed for this test
        esClientMock.search.mockResolvedValue({
          aggregations: {
            ruleTypeIds: {
              buckets: [],
            },
          },
        });

        await expect(
          alertsClient.bulkUpdateTags({
            alertIds: ['alert-1', 'alert-2'],
            index: '.alerts-security.alerts-default',
            add: ['urgent', 'production'],
            remove: ['outdated', 'test'],
          })
        ).rejects.toMatchInlineSnapshot(`[Error: No alerts found]`);
      });
    });

    describe('With query', () => {
      it('authorizes the alerts correctly', async () => {
        await alertsClient.bulkUpdateTags({
          query: 'some-query',
          index: '.alerts-security.alerts-default',
          add: ['urgent', 'production'],
          remove: ['outdated', 'test'],
        });
      });

      it('should bulk update alerts correctly with the correct filters', async () => {
        await alertsClient.bulkUpdateTags({
          query: 'some-query',
          index: '.alerts-security.alerts-default',
          add: ['urgent', 'production'],
          remove: ['outdated', 'test'],
        });

        expect(esClientMock.updateByQuery).toHaveBeenCalledTimes(1);

        const query = esClientMock.updateByQuery.mock.calls[0][0].query;

        expect(query).toMatchInlineSnapshot(`
          Object {
            "bool": Object {
              "filter": Array [
                Object {
                  "bool": Object {
                    "filter": Array [
                      Object {
                        "multi_match": Object {
                          "lenient": true,
                          "query": "some-query",
                          "type": "best_fields",
                        },
                      },
                      Object {
                        "arguments": Array [
                          Object {
                            "arguments": Array [
                              Object {
                                "isQuoted": false,
                                "type": "literal",
                                "value": "alert.attributes.alertTypeId",
                              },
                              Object {
                                "isQuoted": false,
                                "type": "literal",
                                "value": "test-rule-type-1",
                              },
                            ],
                            "function": "is",
                            "type": "function",
                          },
                          Object {
                            "arguments": Array [
                              Object {
                                "isQuoted": false,
                                "type": "literal",
                                "value": "alert.attributes.consumer",
                              },
                              Object {
                                "isQuoted": false,
                                "type": "literal",
                                "value": "foo",
                              },
                            ],
                            "function": "is",
                            "type": "function",
                          },
                        ],
                        "function": "and",
                        "type": "function",
                      },
                    ],
                    "must": Array [],
                    "must_not": Array [],
                    "should": Array [],
                  },
                },
                Object {
                  "terms": Object {
                    "kibana.space_ids": Array [
                      "space-1",
                      "*",
                    ],
                  },
                },
              ],
            },
          }
        `);
      });

      it('should format the response correctly with success and error', async () => {
        esClientMock.updateByQuery.mockResolvedValue({
          total: 2,
          updated: 1,
          failures: [
            {
              id: 'alert-2',
              index: '.alerts-security.alerts-default',
              status: 1,
              cause: { type: 'some_error', reason: 'Something went wrong' },
            },
          ],
        });

        const res = await alertsClient.bulkUpdateTags({
          query: 'some-query',
          index: '.alerts-security.alerts-default',
          add: ['urgent', 'production'],
          remove: ['outdated', 'test'],
        });

        expect(esClientMock.updateByQuery).toHaveBeenCalledTimes(1);

        expect(res).toEqual({
          failures: [
            {
              id: 'alert-2',
              index: '.alerts-security.alerts-default',
              code: 'some_error',
              message: 'Something went wrong',
            },
          ],
          total: 2,
          updated: 1,
        });
      });
    });
  });
});
