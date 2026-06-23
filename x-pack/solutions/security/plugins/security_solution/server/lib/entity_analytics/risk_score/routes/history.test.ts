/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { RISK_SCORE_HISTORY_URL } from '../../../../../common/entity_analytics/risk_score/constants';
import {
  serverMock,
  requestContextMock,
  requestMock,
} from '../../../detection_engine/routes/__mocks__';
import { riskScoreDataClientMock } from '../risk_score_data_client.mock';
import { riskScoreHistoryRoute } from './history';
import type { SecuritySolutionRequestHandlerContextMock } from '../../../detection_engine/routes/__mocks__/request_context';

describe('risk score history route', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: SecuritySolutionRequestHandlerContextMock;
  let logger: ReturnType<typeof loggerMock.create>;
  let mockRiskScoreDataClient: ReturnType<typeof riskScoreDataClientMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    ({ context } = requestContextMock.createTools());
    mockRiskScoreDataClient = riskScoreDataClientMock.create();
    context.securitySolution.getRiskScoreDataClient.mockReturnValue(mockRiskScoreDataClient);

    riskScoreHistoryRoute(server.router, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const buildRequest = (overrides: Record<string, unknown> = {}) => {
    const defaults = {
      entity_type: 'host',
      entity_id: 'test-entity-id',
    };

    return requestMock.create({
      method: 'get',
      path: RISK_SCORE_HISTORY_URL,
      query: { ...defaults, ...overrides },
    });
  };

  it('returns 200 with entries from the data client', async () => {
    const entries = [
      {
        '@timestamp': '2026-01-01T00:00:00.000Z',
        calculated_score_norm: 42,
        calculated_level: 'Low' as const,
      },
    ];
    mockRiskScoreDataClient.getRiskScoreHistory.mockResolvedValue(entries);

    const request = buildRequest();
    const response = await server.inject(request, requestContextMock.convertContext(context));

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({
      entity_id: 'test-entity-id',
      entity_type: 'host',
      entries,
    });
  });

  it('calls getRiskScoreHistory with correct params', async () => {
    const request = buildRequest({
      from: 'now-30d',
      to: 'now',
      score_type: 'base',
      page_size: 50,
    });

    await server.inject(request, requestContextMock.convertContext(context));

    expect(mockRiskScoreDataClient.getRiskScoreHistory).toHaveBeenCalledWith({
      entityType: 'host',
      entityId: 'test-entity-id',
      range: { gte: 'now-30d', lte: 'now' },
      scoreType: 'base',
      pageSize: 50,
    });
  });

  it('uses defaults when optional params are omitted', async () => {
    const request = buildRequest();

    await server.inject(request, requestContextMock.convertContext(context));

    expect(mockRiskScoreDataClient.getRiskScoreHistory).toHaveBeenCalledWith({
      entityType: 'host',
      entityId: 'test-entity-id',
      range: { gte: 'now-90d', lte: 'now' },
      scoreType: undefined,
      pageSize: 100,
    });
  });

  it('returns 200 with empty entries when no data exists', async () => {
    mockRiskScoreDataClient.getRiskScoreHistory.mockResolvedValue([]);

    const request = buildRequest();
    const response = await server.inject(request, requestContextMock.convertContext(context));

    expect(response.status).toEqual(200);
    expect(response.body.entries).toEqual([]);
  });

  it('returns 500 when data client throws', async () => {
    mockRiskScoreDataClient.getRiskScoreHistory.mockRejectedValue(new Error('ES failure'));

    const request = buildRequest();
    const response = await server.inject(request, requestContextMock.convertContext(context));

    expect(response.status).toEqual(500);
    expect(response.body).toEqual(expect.objectContaining({ message: 'ES failure' }));
  });

  describe('validation', () => {
    it('requires entity_type', async () => {
      const request = buildRequest({ entity_type: undefined });
      const result = await server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });

    it('requires entity_id', async () => {
      const request = buildRequest({ entity_id: undefined });
      const result = await server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });

    it('rejects invalid entity_type', async () => {
      const request = buildRequest({ entity_type: 'invalid' });
      const result = await server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });

    it('rejects page_size above 1000', async () => {
      const request = buildRequest({ page_size: 1001 });
      const result = await server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });

    it('rejects page_size below 1', async () => {
      const request = buildRequest({ page_size: 0 });
      const result = await server.validate(request);

      expect(result.badRequest).toHaveBeenCalled();
    });
  });
});
