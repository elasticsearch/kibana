/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';

import { RISK_SCORE_PREVIEW_URL } from '../../../../../common/constants';
import { RiskWeightTypes } from '../../../../../common/entity_analytics/risk_engine';
import {
  serverMock,
  requestContextMock,
  requestMock,
} from '../../../detection_engine/routes/__mocks__';
import { getRiskInputsIndex } from '../get_risk_inputs_index';
import { calculateScoresWithESQLV2 } from './calculate_scores_v2';
import { getConfiguration } from '../../risk_engine/utils/saved_object_configuration';
import { riskScorePreviewRoute } from './preview';
import type {
  MockClients,
  SecuritySolutionRequestHandlerContextMock,
} from '../../../detection_engine/routes/__mocks__/request_context';

jest.mock('./calculate_scores_v2');
jest.mock('../get_risk_inputs_index');
jest.mock('../../risk_engine/utils/saved_object_configuration');

describe('POST risk_engine/preview route', () => {
  let server: ReturnType<typeof serverMock.create>;
  let clients: MockClients;
  let context: SecuritySolutionRequestHandlerContextMock;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    ({ clients, context } = requestContextMock.createTools());
    (getRiskInputsIndex as jest.Mock).mockImplementationOnce(
      async ({ dataViewId }: { dataViewId: string }) => ({
        index: dataViewId,
        runtimeMappings: {},
      })
    );
    (getConfiguration as jest.Mock).mockResolvedValue({
      alertSampleSizePerShard: 123,
    });
    (calculateScoresWithESQLV2 as jest.Mock).mockResolvedValue({
      after_keys: {},
      scores: { host: [], user: [], service: [] },
    });

    clients.appClient.getAlertsIndex.mockReturnValue('default-alerts-index');

    riskScorePreviewRoute(server.router, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const buildRequest = (body: object = {}) =>
    requestMock.create({
      method: 'get',
      path: RISK_SCORE_PREVIEW_URL,
      body: {
        data_view_id: 'default-dataview-id',
        ...body,
      },
    });

  describe('parameters', () => {
    describe('index / dataview', () => {
      it('requires a parameter for the dataview', async () => {
        const request = buildRequest({ data_view_id: undefined });
        const result = await server.validate(request);

        expect(result.badRequest).toHaveBeenCalledWith(
          'data_view_id: Invalid input: expected string, received undefined'
        );
      });

      it('respects the provided dataview', async () => {
        const request = buildRequest({ data_view_id: 'custom-dataview-id' });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ index: 'custom-dataview-id' })
        );
      });

      it('uses an unknown dataview as index pattern', async () => {
        const request = buildRequest({ data_view_id: 'unknown-dataview' });
        (getRiskInputsIndex as jest.Mock).mockResolvedValue({
          index: 'unknown-dataview',
          runtimeMappings: {},
        });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ index: 'unknown-dataview', runtimeMappings: {} })
        );
      });
    });

    describe('date range', () => {
      it('defaults to the last 15 days of data', async () => {
        const request = buildRequest();
        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ range: { start: 'now-15d', end: 'now' } })
        );
      });

      it('respects the provided range if provided', async () => {
        const request = buildRequest({ range: { start: 'now-30d', end: 'now-20d' } });
        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ range: { start: 'now-30d', end: 'now-20d' } })
        );
      });

      it('rejects an invalid date range', async () => {
        const request = buildRequest({
          range: { end: 'now' },
        });

        const result = await server.validate(request);
        expect(result.badRequest).toHaveBeenCalledWith(
          expect.stringContaining('range.start: Invalid input: expected string, received undefined')
        );
      });
    });

    describe('data filter', () => {
      it('respects the provided filter if provided', async () => {
        const request = buildRequest({
          filter: {
            bool: {
              filter: [
                {
                  ids: {
                    values: '1',
                  },
                },
              ],
            },
          },
        });
        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: {
              bool: {
                filter: [
                  {
                    ids: {
                      values: '1',
                    },
                  },
                ],
              },
            },
          })
        );
      });
    });

    describe('weights', () => {
      it('uses the specified weights when provided', async () => {
        const request = buildRequest({
          weights: [
            {
              type: RiskWeightTypes.global,
              host: 0.1,
              user: 0.2,
            },
          ],
        });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({
            weights: [
              {
                type: RiskWeightTypes.global,
                host: 0.1,
                user: 0.2,
              },
            ],
          })
        );
      });

      it('rejects weight values outside the 0-1 range', async () => {
        const request = buildRequest({
          weights: [
            {
              type: RiskWeightTypes.global,
              host: 1.1,
            },
          ],
        });

        const result = await server.validate(request);
        expect(result.badRequest).toHaveBeenCalledWith(
          expect.stringContaining('host: Too big: expected number to be <=1')
        );
      });

      it('rejects unknown weight types', async () => {
        const request = buildRequest({
          weights: [
            {
              type: 'something new',
              host: 0.1,
              user: 0.2,
            },
          ],
        });

        const result = await server.validate(request);
        expect(result.badRequest).toHaveBeenCalledWith(
          expect.stringContaining('type: Invalid input: expected "global_identifier"')
        );
      });
    });

    describe('pagination', () => {
      it('respects the provided after_key', async () => {
        const afterKey = { 'host.name': 'hi mom' };
        const request = buildRequest({ after_keys: { host: afterKey } });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ afterKeys: { host: afterKey } })
        );
      });

      it('remove invalid after_key property', async () => {
        const request = buildRequest({
          after_keys: {
            bad: 'key',
          },
        });

        const result = await server.validate(request);

        expect(result.ok).toHaveBeenCalledWith(expect.objectContaining({ after_keys: {} }));
      });
    });

    describe('exclude_alert_statuses', () => {
      it('respects the provided exclude_alert_statuses', async () => {
        const request = buildRequest({
          exclude_alert_statuses: ['open'],
        });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ excludeAlertStatuses: ['open'] })
        );
      });
    });

    describe('exclude_alert_tags', () => {
      it('respects the provided exclude_alert_tags', async () => {
        const request = buildRequest({
          exclude_alert_tags: ['tag1'],
        });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ excludeAlertTags: ['tag1'] })
        );
      });
    });

    describe('filters', () => {
      it('respects the provided filters', async () => {
        const filters = [
          { entity_types: ['host'], filter: 'agent.type: filebeat' },
          { entity_types: ['user'], filter: 'user.name: ubuntu' },
        ];
        const request = buildRequest({ filters });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ filters })
        );
      });

      it('handles empty filters array', async () => {
        const request = buildRequest({ filters: [] });

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ filters: [] })
        );
      });

      it('handles undefined filters', async () => {
        const request = buildRequest();

        const response = await server.inject(request, requestContextMock.convertContext(context));

        expect(response.status).toEqual(200);
        expect(calculateScoresWithESQLV2).toHaveBeenCalledWith(
          expect.objectContaining({ filters: [] })
        );
      });
    });
  });
});
