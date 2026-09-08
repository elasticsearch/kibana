/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { loggingSystemMock, elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { EntityRiskScoreRecord } from '../../../../common/api/entity_analytics/common';
import { EntityRiskLevelsEnum } from '../../../../common/api/entity_analytics/common';
import { RiskEngineDataWriter } from './risk_engine_data_writer';

const createRiskScoreMock = (
  overrides: Partial<EntityRiskScoreRecord> = {}
): EntityRiskScoreRecord => ({
  '@timestamp': '2023-02-15T00:15:19.231Z',
  id_field: 'host.name',
  id_value: 'hostname',
  calculated_level: EntityRiskLevelsEnum.High,
  calculated_score: 149,
  calculated_score_norm: 85.332,
  category_1_score: 85,
  category_1_count: 12,
  category_2_count: 0,
  category_2_score: 0,
  criticality_level: 'high_impact',
  criticality_modifier: 2,
  notes: [],
  inputs: [],
  ...overrides,
});

describe('RiskEngineDataWriter', () => {
  describe('#bulk', () => {
    let writer: RiskEngineDataWriter;
    let esClientMock: ElasticsearchClient;
    let loggerMock: Logger;

    beforeEach(() => {
      esClientMock = elasticsearchServiceMock.createScopedClusterClient().asCurrentUser;
      loggerMock = loggingSystemMock.createLogger();
      writer = new RiskEngineDataWriter({
        esClient: esClientMock,
        logger: loggerMock,
        index: 'risk-score.risk-score-default',
        namespace: 'default',
      });
    });

    it('converts a list of host risk scores to an appropriate list of operations', async () => {
      await writer.bulk({
        host: [createRiskScoreMock(), createRiskScoreMock()],
      });

      const [{ operations }] = (esClientMock.bulk as jest.Mock).mock.lastCall;

      expect(operations).toMatchInlineSnapshot(`
        Array [
          Object {
            "create": Object {
              "_index": "risk-score.risk-score-default",
            },
          },
          Object {
            "@timestamp": "2023-02-15T00:15:19.231Z",
            "host": Object {
              "name": "hostname",
              "risk": Object {
                "calculated_level": "High",
                "calculated_score": 149,
                "calculated_score_norm": 85.332,
                "category_1_count": 12,
                "category_1_score": 85,
                "category_2_count": 0,
                "category_2_score": 0,
                "criticality_level": "high_impact",
                "criticality_modifier": 2,
                "id_field": "host.name",
                "id_value": "hostname",
                "inputs": Array [],
                "notes": Array [],
              },
            },
          },
          Object {
            "create": Object {
              "_index": "risk-score.risk-score-default",
            },
          },
          Object {
            "@timestamp": "2023-02-15T00:15:19.231Z",
            "host": Object {
              "name": "hostname",
              "risk": Object {
                "calculated_level": "High",
                "calculated_score": 149,
                "calculated_score_norm": 85.332,
                "category_1_count": 12,
                "category_1_score": 85,
                "category_2_count": 0,
                "category_2_score": 0,
                "criticality_level": "high_impact",
                "criticality_modifier": 2,
                "id_field": "host.name",
                "id_value": "hostname",
                "inputs": Array [],
                "notes": Array [],
              },
            },
          },
        ]
      `);
    });

    it('converts a list of user risk scores to an appropriate list of operations', async () => {
      await writer.bulk({
        user: [
          createRiskScoreMock({
            id_field: 'user.name',
            id_value: 'username_1',
          }),
          createRiskScoreMock({
            id_field: 'user.name',
            id_value: 'username_2',
          }),
        ],
      });

      const [{ operations }] = (esClientMock.bulk as jest.Mock).mock.lastCall;

      expect(operations).toMatchInlineSnapshot(`
        Array [
          Object {
            "create": Object {
              "_index": "risk-score.risk-score-default",
            },
          },
          Object {
            "@timestamp": "2023-02-15T00:15:19.231Z",
            "user": Object {
              "name": "username_1",
              "risk": Object {
                "calculated_level": "High",
                "calculated_score": 149,
                "calculated_score_norm": 85.332,
                "category_1_count": 12,
                "category_1_score": 85,
                "category_2_count": 0,
                "category_2_score": 0,
                "criticality_level": "high_impact",
                "criticality_modifier": 2,
                "id_field": "user.name",
                "id_value": "username_1",
                "inputs": Array [],
                "notes": Array [],
              },
            },
          },
          Object {
            "create": Object {
              "_index": "risk-score.risk-score-default",
            },
          },
          Object {
            "@timestamp": "2023-02-15T00:15:19.231Z",
            "user": Object {
              "name": "username_2",
              "risk": Object {
                "calculated_level": "High",
                "calculated_score": 149,
                "calculated_score_norm": 85.332,
                "category_1_count": 12,
                "category_1_score": 85,
                "category_2_count": 0,
                "category_2_score": 0,
                "criticality_level": "high_impact",
                "criticality_modifier": 2,
                "id_field": "user.name",
                "id_value": "username_2",
                "inputs": Array [],
                "notes": Array [],
              },
            },
          },
        ]
      `);
    });

    it('converts a list of mixed risk scores to an appropriate list of operations', async () => {
      await writer.bulk({
        host: [
          createRiskScoreMock({
            id_field: 'host.name',
            id_value: 'hostname_1',
          }),
        ],
        user: [
          createRiskScoreMock({
            id_field: 'user.name',
            id_value: 'username_1',
          }),
          createRiskScoreMock({
            id_field: 'user.name',
            id_value: 'username_2',
          }),
        ],
      });

      const [{ operations }] = (esClientMock.bulk as jest.Mock).mock.lastCall;

      expect(operations).toMatchInlineSnapshot(`
        Array [
          Object {
            "create": Object {
              "_index": "risk-score.risk-score-default",
            },
          },
          Object {
            "@timestamp": "2023-02-15T00:15:19.231Z",
            "host": Object {
              "name": "hostname_1",
              "risk": Object {
                "calculated_level": "High",
                "calculated_score": 149,
                "calculated_score_norm": 85.332,
                "category_1_count": 12,
                "category_1_score": 85,
                "category_2_count": 0,
                "category_2_score": 0,
                "criticality_level": "high_impact",
                "criticality_modifier": 2,
                "id_field": "host.name",
                "id_value": "hostname_1",
                "inputs": Array [],
                "notes": Array [],
              },
            },
          },
          Object {
            "create": Object {
              "_index": "risk-score.risk-score-default",
            },
          },
          Object {
            "@timestamp": "2023-02-15T00:15:19.231Z",
            "user": Object {
              "name": "username_1",
              "risk": Object {
                "calculated_level": "High",
                "calculated_score": 149,
                "calculated_score_norm": 85.332,
                "category_1_count": 12,
                "category_1_score": 85,
                "category_2_count": 0,
                "category_2_score": 0,
                "criticality_level": "high_impact",
                "criticality_modifier": 2,
                "id_field": "user.name",
                "id_value": "username_1",
                "inputs": Array [],
                "notes": Array [],
              },
            },
          },
          Object {
            "create": Object {
              "_index": "risk-score.risk-score-default",
            },
          },
          Object {
            "@timestamp": "2023-02-15T00:15:19.231Z",
            "user": Object {
              "name": "username_2",
              "risk": Object {
                "calculated_level": "High",
                "calculated_score": 149,
                "calculated_score_norm": 85.332,
                "category_1_count": 12,
                "category_1_score": 85,
                "category_2_count": 0,
                "category_2_score": 0,
                "criticality_level": "high_impact",
                "criticality_modifier": 2,
                "id_field": "user.name",
                "id_value": "username_2",
                "inputs": Array [],
                "notes": Array [],
              },
            },
          },
        ]
      `);
    });

    it('returns an error if something went wrong', async () => {
      (esClientMock.bulk as jest.Mock).mockRejectedValue(new Error('something went wrong'));

      const { errors } = await writer.bulk({
        host: [createRiskScoreMock()],
      });

      expect(errors).toEqual(['something went wrong']);
    });

    it('returns the time it took to write the risk scores', async () => {
      (esClientMock.bulk as jest.Mock).mockResolvedValue({
        took: 123,
        items: [],
      });

      const { took } = await writer.bulk({
        host: [createRiskScoreMock()],
      });

      expect(took).toEqual(123);
    });

    it('returns the number of docs written', async () => {
      (esClientMock.bulk as jest.Mock).mockResolvedValue({
        items: [{ create: { status: 201 } }, { create: { status: 200 } }],
      });

      const { docs_written: docsWritten } = await writer.bulk({
        host: [createRiskScoreMock()],
      });

      expect(docsWritten).toEqual(2);
    });

    describe('when some documents failed to be written', () => {
      beforeEach(() => {
        (esClientMock.bulk as jest.Mock).mockResolvedValue({
          errors: true,
          items: [
            { create: { status: 201 } },
            { create: { status: 500, error: { reason: 'something went wrong' } } },
          ],
        });
      });

      it('returns the number of docs written', async () => {
        const { docs_written: docsWritten } = await writer.bulk({
          host: [createRiskScoreMock()],
        });

        expect(docsWritten).toEqual(1);
      });

      it('returns the errors', async () => {
        const { errors } = await writer.bulk({
          host: [createRiskScoreMock()],
        });

        expect(errors).toEqual(['something went wrong']);
      });
    });

    describe('when there are no risk scores to write', () => {
      it('returns an appropriate response', async () => {
        const response = await writer.bulk({});
        expect(response).toEqual({ errors: [], docs_written: 0, took: 0 });
      });
    });
  });
});
