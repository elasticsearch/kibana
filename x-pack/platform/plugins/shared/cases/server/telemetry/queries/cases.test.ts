/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsFindResponse } from '@kbn/core/server';
import { savedObjectsRepositoryMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { CasePersistedStatus } from '../../common/types/case';
import type {
  AttachmentAggregationResult,
  AttachmentFrameworkAggsResult,
  CaseAggregationResult,
  CasesTelemetryWithAlertsAggsByOwnerResults,
  FileAttachmentAggregationResults,
} from '../types';
import { getCasesTelemetryData } from './cases';
import { TelemetrySavedObjectsClient } from '../telemetry_saved_objects_client';
import { OBSERVABLE_TYPE_IPV4 } from '../../../common/constants';
import { AUTO_EXTRACT_OBSERVABLE_DESCRIPTION } from '../../../common/constants/observables';

const MOCK_FIND_TOTAL = 5;
const SOLUTION_TOTAL = 1;

describe('getCasesTelemetryData', () => {
  describe('getCasesTelemetryData', () => {
    const logger = loggingSystemMock.createLogger();
    const savedObjectsClient = savedObjectsRepositoryMock.create();
    const telemetrySavedObjectsClient = new TelemetrySavedObjectsClient(savedObjectsClient);

    const mockFind = (aggs: object, so: SavedObjectsFindResponse['saved_objects'] = []) => {
      savedObjectsClient.find.mockResolvedValueOnce({
        total: MOCK_FIND_TOTAL,
        saved_objects: so,
        per_page: 1,
        page: 1,
        aggregations: {
          ...aggs,
        },
      });
    };

    const mockSavedObjectResponse = (attributes: Record<string, unknown>) => {
      mockFind({}, [
        {
          attributes: { ...attributes },
          score: 1,
          id: 'test',
          references: [],
          type: 'cases',
        },
      ]);
    };

    const mockResponse = () => {
      const counts = {
        buckets: [
          { doc_count: 1, key: 1 },
          { doc_count: 2, key: 2 },
          { doc_count: 3, key: 3 },
        ],
      };

      const assignees = {
        assigneeFilters: {
          buckets: {
            atLeastOne: {
              doc_count: 0,
            },
            zero: {
              doc_count: 100,
            },
          },
        },
        totalAssignees: { value: 5 },
      };

      const observables = {
        observables: {
          doc_count: 1,
          byDescription: {
            buckets: [
              {
                key: AUTO_EXTRACT_OBSERVABLE_DESCRIPTION,
                doc_count: 1,
                byType: {
                  buckets: [
                    {
                      key: OBSERVABLE_TYPE_IPV4.key,
                      doc_count: 1,
                    },
                  ],
                },
              },
            ],
          },
        },
        totalWithMaxObservables: {
          buckets: [
            {
              key: 50,
              doc_count: 1,
            },
            {
              key: 3,
              doc_count: 1,
            },
          ],
        },
      };

      const solutionValues = {
        counts,
        ...observables,
        ...assignees,
      };

      const caseAggsResult: CaseAggregationResult = {
        users: { value: 1 },
        tags: { value: 2 },
        ...assignees,
        counts,
        securitySolution: { ...solutionValues },
        observability: { ...solutionValues },
        cases: { ...solutionValues },
        ...observables,
        syncAlerts: {
          buckets: [
            {
              key: 0,
              doc_count: 1,
            },
            {
              key: 1,
              doc_count: 1,
            },
          ],
        },
        extractObservables: {
          buckets: [
            {
              key: 0,
              doc_count: 1,
            },
            {
              key: 1,
              doc_count: 1,
            },
          ],
        },
        status: {
          buckets: [
            {
              key: CasePersistedStatus.OPEN,
              doc_count: 2,
            },
          ],
        },
        totalsByOwner: {
          buckets: [
            {
              key: 'observability',
              doc_count: SOLUTION_TOTAL,
            },
            {
              key: 'securitySolution',
              doc_count: SOLUTION_TOTAL,
            },
            {
              key: 'cases',
              doc_count: SOLUTION_TOTAL,
            },
          ],
        },
      };
      const caseWithAlertsResult: CasesTelemetryWithAlertsAggsByOwnerResults = {
        by_owner: {
          buckets: [
            {
              key: 'cases',
              doc_count: 10,
              references: {
                referenceType: {
                  referenceAgg: {
                    value: 10,
                  },
                },
              },
            },
            {
              key: 'observability',
              doc_count: 8,
              references: {
                referenceType: {
                  referenceAgg: {
                    value: 5,
                  },
                },
              },
            },
            {
              key: 'securitySolution',
              doc_count: 10,
              references: {
                referenceType: {
                  referenceAgg: {
                    value: 20,
                  },
                },
              },
            },
          ],
        },
      };

      const attachmentFramework: AttachmentFrameworkAggsResult = {
        externalReferenceTypes: {
          buckets: [
            {
              doc_count: 5,
              key: '.osquery',
              references: {
                cases: {
                  max: {
                    value: 10,
                  },
                },
              },
            },
            {
              doc_count: 5,
              key: '.files',
              references: {
                cases: {
                  max: {
                    value: 10,
                  },
                },
              },
            },
          ],
        },
        persistableReferenceTypes: {
          buckets: [
            {
              doc_count: 5,
              key: '.ml',
              references: {
                cases: {
                  max: {
                    value: 10,
                  },
                },
              },
            },
            {
              doc_count: 5,
              key: '.files',
              references: {
                cases: {
                  max: {
                    value: 10,
                  },
                },
              },
            },
          ],
        },
      };

      const attachmentAggsResult: AttachmentAggregationResult = {
        securitySolution: { ...attachmentFramework },
        observability: { ...attachmentFramework },
        cases: { ...attachmentFramework },
        participants: {
          value: 2,
        },
        ...attachmentFramework,
      };

      const filesRes: FileAttachmentAggregationResults = {
        securitySolution: {
          averageSize: { value: 500 },
          topMimeTypes: {
            buckets: [
              {
                doc_count: 5,
                key: 'image/png',
              },
              {
                doc_count: 1,
                key: 'application/json',
              },
            ],
          },
        },
        observability: {
          averageSize: { value: 500 },
          topMimeTypes: {
            buckets: [
              {
                doc_count: 5,
                key: 'image/png',
              },
              {
                doc_count: 1,
                key: 'application/json',
              },
            ],
          },
        },
        cases: {
          averageSize: { value: 500 },
          topMimeTypes: {
            buckets: [
              {
                doc_count: 5,
                key: 'image/png',
              },
              {
                doc_count: 1,
                key: 'application/json',
              },
            ],
          },
        },
        averageSize: { value: 500 },
        topMimeTypes: {
          buckets: [
            {
              doc_count: 5,
              key: 'image/png',
            },
            {
              doc_count: 1,
              key: 'application/json',
            },
          ],
        },
      };

      mockFind(caseAggsResult);
      mockFind(caseWithAlertsResult);
      mockFind(attachmentAggsResult);

      mockFind({ references: { referenceType: { referenceAgg: { value: 3 } } } });
      mockFind({ references: { referenceType: { referenceAgg: { value: 4 } } } });

      mockSavedObjectResponse({
        created_at: '2022-03-08T12:24:11.429Z',
      });
      mockSavedObjectResponse({
        updated_at: '2022-03-08T12:24:11.429Z',
      });
      mockSavedObjectResponse({
        closed_at: '2022-03-08T12:24:11.429Z',
      });
      mockFind(filesRes);
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('it returns the correct res', async () => {
      mockResponse();

      const attachmentFramework = (total: number, average: number) => {
        return {
          attachmentFramework: {
            externalAttachments: [
              {
                average,
                maxOnACase: 10,
                total,
                type: '.osquery',
              },
              {
                average,
                maxOnACase: 10,
                total,
                type: '.files',
              },
            ],
            persistableAttachments: [
              {
                average,
                maxOnACase: 10,
                total,
                type: '.ml',
              },
              {
                average,
                maxOnACase: 10,
                total,
                type: '.files',
              },
            ],
            files: {
              averageSize: 500,
              average,
              maxOnACase: 10,
              total,
              topMimeTypes: [
                {
                  count: 5,
                  name: 'image/png',
                },
                {
                  count: 1,
                  name: 'application/json',
                },
              ],
            },
          },
        };
      };

      const res = await getCasesTelemetryData({
        savedObjectsClient: telemetrySavedObjectsClient,
        logger,
      });

      const allAttachmentsTotal = 5;
      const allAttachmentsAverage = allAttachmentsTotal / MOCK_FIND_TOTAL;

      const solutionAttachmentsTotal = 5;
      const solutionAttachmentsAverage = solutionAttachmentsTotal / SOLUTION_TOTAL;
      const solutionAttachmentFrameworkStats = attachmentFramework(
        solutionAttachmentsTotal,
        solutionAttachmentsAverage
      );

      expect(res).toEqual({
        all: {
          total: MOCK_FIND_TOTAL,
          daily: 3,
          weekly: 2,
          monthly: 1,
          latestDates: {
            closedAt: '2022-03-08T12:24:11.429Z',
            createdAt: '2022-03-08T12:24:11.429Z',
            updatedAt: '2022-03-08T12:24:11.429Z',
          },
          status: {
            closed: 0,
            inProgress: 0,
            open: 2,
          },
          syncAlertsOff: 1,
          syncAlertsOn: 1,
          extractObservablesOff: 1,
          extractObservablesOn: 1,
          observables: {
            auto: { default: 1, custom: 0 },
            manual: { default: 0, custom: 0 },
            total: 1,
          },
          totalWithMaxObservables: 1,
          totalParticipants: 2,
          totalTags: 2,
          totalUsers: 1,
          totalWithAlerts: 3,
          totalWithConnectors: 4,
          assignees: {
            total: 5,
            totalWithZero: 100,
            totalWithAtLeastOne: 0,
          },
          ...attachmentFramework(allAttachmentsTotal, allAttachmentsAverage),
        },
        main: {
          assignees: {
            total: 5,
            totalWithZero: 100,
            totalWithAtLeastOne: 0,
          },
          ...solutionAttachmentFrameworkStats,
          total: 1,
          daily: 3,
          weekly: 2,
          monthly: 1,
          status: {
            closed: 0,
            inProgress: 0,
            open: 0,
          },
          totalWithAlerts: 10,
          observables: {
            auto: { default: 1, custom: 0 },
            manual: { default: 0, custom: 0 },
            total: 1,
          },
          totalWithMaxObservables: 1,
        },
        obs: {
          assignees: {
            total: 5,
            totalWithZero: 100,
            totalWithAtLeastOne: 0,
          },
          observables: {
            auto: { default: 1, custom: 0 },
            manual: { default: 0, custom: 0 },
            total: 1,
          },
          totalWithMaxObservables: 1,
          ...solutionAttachmentFrameworkStats,
          total: 1,
          daily: 3,
          weekly: 2,
          monthly: 1,
          status: {
            closed: 0,
            inProgress: 0,
            open: 0,
          },
          totalWithAlerts: 5,
        },
        sec: {
          assignees: {
            total: 5,
            totalWithZero: 100,
            totalWithAtLeastOne: 0,
          },
          observables: {
            auto: { default: 1, custom: 0 },
            manual: { default: 0, custom: 0 },
            total: 1,
          },
          totalWithMaxObservables: 1,
          ...solutionAttachmentFrameworkStats,
          total: 1,
          daily: 3,
          weekly: 2,
          monthly: 1,
          status: {
            closed: 0,
            inProgress: 0,
            open: 0,
          },
          totalWithAlerts: 20,
        },
      });
    });

    it('should call find with correct arguments', async () => {
      mockResponse();

      await getCasesTelemetryData({ savedObjectsClient: telemetrySavedObjectsClient, logger });

      expect(savedObjectsClient.find.mock.calls[0][0]).toMatchInlineSnapshot(`
        Object {
          "aggs": Object {
            "assigneeFilters": Object {
              "filters": Object {
                "filters": Object {
                  "atLeastOne": Object {
                    "bool": Object {
                      "filter": Object {
                        "exists": Object {
                          "field": "cases.attributes.assignees.uid",
                        },
                      },
                    },
                  },
                  "zero": Object {
                    "bool": Object {
                      "must_not": Object {
                        "exists": Object {
                          "field": "cases.attributes.assignees.uid",
                        },
                      },
                    },
                  },
                },
              },
            },
            "cases": Object {
              "aggs": Object {
                "assigneeFilters": Object {
                  "filters": Object {
                    "filters": Object {
                      "atLeastOne": Object {
                        "bool": Object {
                          "filter": Object {
                            "exists": Object {
                              "field": "cases.attributes.assignees.uid",
                            },
                          },
                        },
                      },
                      "zero": Object {
                        "bool": Object {
                          "must_not": Object {
                            "exists": Object {
                              "field": "cases.attributes.assignees.uid",
                            },
                          },
                        },
                      },
                    },
                  },
                },
                "counts": Object {
                  "date_range": Object {
                    "field": "cases.attributes.created_at",
                    "format": "dd/MM/yyyy",
                    "ranges": Array [
                      Object {
                        "from": "now-1d",
                        "to": "now",
                      },
                      Object {
                        "from": "now-1w",
                        "to": "now",
                      },
                      Object {
                        "from": "now-1M",
                        "to": "now",
                      },
                    ],
                  },
                },
                "observables": Object {
                  "aggs": Object {
                    "byDescription": Object {
                      "aggs": Object {
                        "byType": Object {
                          "terms": Object {
                            "field": "cases.attributes.observables.typeKey",
                          },
                        },
                      },
                      "terms": Object {
                        "field": "cases.attributes.observables.description",
                      },
                    },
                  },
                  "nested": Object {
                    "path": "cases.attributes.observables",
                  },
                },
                "status": Object {
                  "terms": Object {
                    "field": "cases.attributes.status",
                  },
                },
                "totalAssignees": Object {
                  "value_count": Object {
                    "field": "cases.attributes.assignees.uid",
                  },
                },
                "totalWithMaxObservables": Object {
                  "terms": Object {
                    "field": "cases.attributes.total_observables",
                    "order": Object {
                      "_key": "desc",
                    },
                    "size": 100,
                  },
                },
              },
              "filter": Object {
                "term": Object {
                  "cases.attributes.owner": "cases",
                },
              },
            },
            "counts": Object {
              "date_range": Object {
                "field": "cases.attributes.created_at",
                "format": "dd/MM/yyyy",
                "ranges": Array [
                  Object {
                    "from": "now-1d",
                    "to": "now",
                  },
                  Object {
                    "from": "now-1w",
                    "to": "now",
                  },
                  Object {
                    "from": "now-1M",
                    "to": "now",
                  },
                ],
              },
            },
            "extractObservables": Object {
              "terms": Object {
                "field": "cases.attributes.settings.extractObservables",
              },
            },
            "observability": Object {
              "aggs": Object {
                "assigneeFilters": Object {
                  "filters": Object {
                    "filters": Object {
                      "atLeastOne": Object {
                        "bool": Object {
                          "filter": Object {
                            "exists": Object {
                              "field": "cases.attributes.assignees.uid",
                            },
                          },
                        },
                      },
                      "zero": Object {
                        "bool": Object {
                          "must_not": Object {
                            "exists": Object {
                              "field": "cases.attributes.assignees.uid",
                            },
                          },
                        },
                      },
                    },
                  },
                },
                "counts": Object {
                  "date_range": Object {
                    "field": "cases.attributes.created_at",
                    "format": "dd/MM/yyyy",
                    "ranges": Array [
                      Object {
                        "from": "now-1d",
                        "to": "now",
                      },
                      Object {
                        "from": "now-1w",
                        "to": "now",
                      },
                      Object {
                        "from": "now-1M",
                        "to": "now",
                      },
                    ],
                  },
                },
                "observables": Object {
                  "aggs": Object {
                    "byDescription": Object {
                      "aggs": Object {
                        "byType": Object {
                          "terms": Object {
                            "field": "cases.attributes.observables.typeKey",
                          },
                        },
                      },
                      "terms": Object {
                        "field": "cases.attributes.observables.description",
                      },
                    },
                  },
                  "nested": Object {
                    "path": "cases.attributes.observables",
                  },
                },
                "status": Object {
                  "terms": Object {
                    "field": "cases.attributes.status",
                  },
                },
                "totalAssignees": Object {
                  "value_count": Object {
                    "field": "cases.attributes.assignees.uid",
                  },
                },
                "totalWithMaxObservables": Object {
                  "terms": Object {
                    "field": "cases.attributes.total_observables",
                    "order": Object {
                      "_key": "desc",
                    },
                    "size": 100,
                  },
                },
              },
              "filter": Object {
                "term": Object {
                  "cases.attributes.owner": "observability",
                },
              },
            },
            "observables": Object {
              "aggs": Object {
                "byDescription": Object {
                  "aggs": Object {
                    "byType": Object {
                      "terms": Object {
                        "field": "cases.attributes.observables.typeKey",
                      },
                    },
                  },
                  "terms": Object {
                    "field": "cases.attributes.observables.description",
                  },
                },
              },
              "nested": Object {
                "path": "cases.attributes.observables",
              },
            },
            "securitySolution": Object {
              "aggs": Object {
                "assigneeFilters": Object {
                  "filters": Object {
                    "filters": Object {
                      "atLeastOne": Object {
                        "bool": Object {
                          "filter": Object {
                            "exists": Object {
                              "field": "cases.attributes.assignees.uid",
                            },
                          },
                        },
                      },
                      "zero": Object {
                        "bool": Object {
                          "must_not": Object {
                            "exists": Object {
                              "field": "cases.attributes.assignees.uid",
                            },
                          },
                        },
                      },
                    },
                  },
                },
                "counts": Object {
                  "date_range": Object {
                    "field": "cases.attributes.created_at",
                    "format": "dd/MM/yyyy",
                    "ranges": Array [
                      Object {
                        "from": "now-1d",
                        "to": "now",
                      },
                      Object {
                        "from": "now-1w",
                        "to": "now",
                      },
                      Object {
                        "from": "now-1M",
                        "to": "now",
                      },
                    ],
                  },
                },
                "observables": Object {
                  "aggs": Object {
                    "byDescription": Object {
                      "aggs": Object {
                        "byType": Object {
                          "terms": Object {
                            "field": "cases.attributes.observables.typeKey",
                          },
                        },
                      },
                      "terms": Object {
                        "field": "cases.attributes.observables.description",
                      },
                    },
                  },
                  "nested": Object {
                    "path": "cases.attributes.observables",
                  },
                },
                "status": Object {
                  "terms": Object {
                    "field": "cases.attributes.status",
                  },
                },
                "totalAssignees": Object {
                  "value_count": Object {
                    "field": "cases.attributes.assignees.uid",
                  },
                },
                "totalWithMaxObservables": Object {
                  "terms": Object {
                    "field": "cases.attributes.total_observables",
                    "order": Object {
                      "_key": "desc",
                    },
                    "size": 100,
                  },
                },
              },
              "filter": Object {
                "term": Object {
                  "cases.attributes.owner": "securitySolution",
                },
              },
            },
            "status": Object {
              "terms": Object {
                "field": "cases.attributes.status",
              },
            },
            "syncAlerts": Object {
              "terms": Object {
                "field": "cases.attributes.settings.syncAlerts",
              },
            },
            "tags": Object {
              "cardinality": Object {
                "field": "cases.attributes.tags",
              },
            },
            "totalAssignees": Object {
              "value_count": Object {
                "field": "cases.attributes.assignees.uid",
              },
            },
            "totalWithMaxObservables": Object {
              "terms": Object {
                "field": "cases.attributes.total_observables",
                "order": Object {
                  "_key": "desc",
                },
                "size": 100,
              },
            },
            "totalsByOwner": Object {
              "terms": Object {
                "field": "cases.attributes.owner",
              },
            },
            "users": Object {
              "cardinality": Object {
                "field": "cases.attributes.created_by.username",
              },
            },
          },
          "namespaces": Array [
            "*",
          ],
          "page": 0,
          "perPage": 0,
          "type": "cases",
        }
      `);

      expect(savedObjectsClient.find.mock.calls[1][0]).toMatchInlineSnapshot(`
        Object {
          "aggs": Object {
            "by_owner": Object {
              "aggs": Object {
                "references": Object {
                  "aggregations": Object {
                    "referenceType": Object {
                      "aggregations": Object {
                        "referenceAgg": Object {
                          "cardinality": Object {
                            "field": "cases-comments.references.id",
                          },
                        },
                      },
                      "filter": Object {
                        "term": Object {
                          "cases-comments.references.type": "cases",
                        },
                      },
                    },
                  },
                  "nested": Object {
                    "path": "cases-comments.references",
                  },
                },
              },
              "terms": Object {
                "field": "cases-comments.attributes.owner",
                "include": Array [
                  "securitySolution",
                  "observability",
                  "cases",
                ],
                "size": 3,
              },
            },
          },
          "filter": Object {
            "arguments": Array [
              Object {
                "isQuoted": false,
                "type": "literal",
                "value": "cases-comments.attributes.type",
              },
              Object {
                "isQuoted": false,
                "type": "literal",
                "value": "alert",
              },
            ],
            "function": "is",
            "type": "function",
          },
          "namespaces": Array [
            "*",
          ],
          "page": 0,
          "perPage": 0,
          "type": "cases-comments",
        }
      `);

      expect(savedObjectsClient.find.mock.calls[3][0]).toEqual({
        aggs: {
          references: {
            aggregations: {
              referenceType: {
                aggregations: {
                  referenceAgg: {
                    cardinality: {
                      field: 'cases-comments.references.id',
                    },
                  },
                },
                filter: {
                  term: {
                    'cases-comments.references.type': 'cases',
                  },
                },
              },
            },
            nested: {
              path: 'cases-comments.references',
            },
          },
        },
        filter: {
          arguments: [
            {
              type: 'literal',
              value: 'cases-comments.attributes.type',
              isQuoted: false,
            },
            {
              type: 'literal',
              value: 'alert',
              isQuoted: false,
            },
          ],
          function: 'is',
          type: 'function',
        },
        page: 0,
        perPage: 0,
        type: 'cases-comments',
        namespaces: ['*'],
      });

      expect(savedObjectsClient.find.mock.calls[4][0]).toEqual({
        aggs: {
          references: {
            aggregations: {
              referenceType: {
                aggregations: {
                  referenceAgg: {
                    cardinality: {
                      field: 'cases-user-actions.references.id',
                    },
                  },
                },
                filter: {
                  term: {
                    'cases-user-actions.references.type': 'cases',
                  },
                },
              },
            },
            nested: {
              path: 'cases-user-actions.references',
            },
          },
        },
        filter: {
          arguments: [
            {
              type: 'literal',
              value: 'cases-user-actions.attributes.type',
              isQuoted: false,
            },
            {
              type: 'literal',
              value: 'connector',
              isQuoted: false,
            },
          ],
          function: 'is',
          type: 'function',
        },
        page: 0,
        perPage: 0,
        type: 'cases-user-actions',
        namespaces: ['*'],
      });

      for (const [index, sortField] of ['created_at', 'updated_at', 'closed_at'].entries()) {
        const callIndex = index + 5;

        expect(savedObjectsClient.find.mock.calls[callIndex][0]).toEqual({
          page: 1,
          perPage: 1,
          sortField,
          sortOrder: 'desc',
          type: 'cases',
          namespaces: ['*'],
        });
      }

      expect(savedObjectsClient.find.mock.calls[8][0]).toMatchInlineSnapshot(`
        Object {
          "aggs": Object {
            "averageSize": Object {
              "avg": Object {
                "field": "file.attributes.size",
              },
            },
            "cases": Object {
              "aggs": Object {
                "averageSize": Object {
                  "avg": Object {
                    "field": "file.attributes.size",
                  },
                },
                "topMimeTypes": Object {
                  "terms": Object {
                    "field": "file.attributes.mime_type",
                    "size": 20,
                  },
                },
              },
              "filter": Object {
                "term": Object {
                  "file.attributes.Meta.owner": "cases",
                },
              },
            },
            "observability": Object {
              "aggs": Object {
                "averageSize": Object {
                  "avg": Object {
                    "field": "file.attributes.size",
                  },
                },
                "topMimeTypes": Object {
                  "terms": Object {
                    "field": "file.attributes.mime_type",
                    "size": 20,
                  },
                },
              },
              "filter": Object {
                "term": Object {
                  "file.attributes.Meta.owner": "observability",
                },
              },
            },
            "securitySolution": Object {
              "aggs": Object {
                "averageSize": Object {
                  "avg": Object {
                    "field": "file.attributes.size",
                  },
                },
                "topMimeTypes": Object {
                  "terms": Object {
                    "field": "file.attributes.mime_type",
                    "size": 20,
                  },
                },
              },
              "filter": Object {
                "term": Object {
                  "file.attributes.Meta.owner": "securitySolution",
                },
              },
            },
            "topMimeTypes": Object {
              "terms": Object {
                "field": "file.attributes.mime_type",
                "size": 20,
              },
            },
          },
          "filter": Object {
            "arguments": Array [
              Object {
                "isQuoted": false,
                "type": "literal",
                "value": "file.attributes.Meta.caseIds",
              },
              Object {
                "type": "wildcard",
                "value": "@kuery-wildcard@",
              },
            ],
            "function": "is",
            "type": "function",
          },
          "namespaces": Array [
            "*",
          ],
          "page": 0,
          "perPage": 0,
          "type": "file",
        }
      `);
    });
  });
});
