/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { KibanaResponseFactory } from '@kbn/core-http-server';
import { EntitiesNotFoundError, ResolutionSearchTruncatedError } from '../../../domain/errors';
import type { EntityStoreRequestHandlerContext } from '../../../types';
import type { ResolutionClient } from '../../../domain/resolution';
import type { TelemetryReporter } from '../../../telemetry/events';
import {
  ENTITY_STORE_RESOLUTION_ERROR_EVENT,
  ENTITY_STORE_RESOLUTION_GROUP_VIEW_EVENT,
} from '../../../telemetry/events';
import { handleResolutionGroup } from './group';

const NAMESPACE = 'default';

function createMockAnalytics(): TelemetryReporter {
  return { reportEvent: jest.fn() };
}

function createMockContext(
  resolutionClient: Partial<ResolutionClient>,
  analytics: TelemetryReporter = createMockAnalytics()
): EntityStoreRequestHandlerContext {
  return {
    entityStore: Promise.resolve({
      logger: loggerMock.create(),
      resolutionClient: resolutionClient as ResolutionClient,
      analytics,
      namespace: NAMESPACE,
    }),
  } as unknown as EntityStoreRequestHandlerContext;
}

function createMockResponse() {
  return {
    ok: jest.fn(({ body }) => ({ status: 200, payload: body })),
    customError: jest.fn(({ statusCode, body }) => ({ status: statusCode, payload: body })),
    badRequest: jest.fn(({ body }) => ({ status: 400, payload: body })),
    notFound: jest.fn(({ body }) => ({ status: 404, payload: body })),
  } as unknown as KibanaResponseFactory;
}

describe('handleResolutionGroup', () => {
  let analytics: TelemetryReporter;
  let mockGetResolutionGroup: jest.Mock;

  beforeEach(() => {
    analytics = createMockAnalytics();
    mockGetResolutionGroup = jest.fn();
  });

  it('reports group view telemetry on success', async () => {
    mockGetResolutionGroup.mockResolvedValue({
      target: { 'entity.id': 'target-1' },
      aliases: [{ 'entity.id': 'alias-1' }],
      group_size: 2,
      entity_type: 'user',
    });

    const ctx = createMockContext({ getResolutionGroup: mockGetResolutionGroup }, analytics);
    const req = { query: { entity_id: 'target-1' } } as never;
    const res = createMockResponse();

    await handleResolutionGroup(ctx, req, res);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_GROUP_VIEW_EVENT, {
      entityType: 'user',
      groupSize: 2,
      namespace: NAMESPACE,
    });
    expect(res.ok).toHaveBeenCalled();
  });

  it.each([
    [new EntitiesNotFoundError(['missing']), 'entities_not_found', 404],
    [
      new ResolutionSearchTruncatedError('getResolutionGroup', 1, 100),
      'resolution_search_truncated',
      400,
    ],
  ])('reports error telemetry for %s', async (error, errorType, statusCode) => {
    mockGetResolutionGroup.mockRejectedValue(error);

    const ctx = createMockContext({ getResolutionGroup: mockGetResolutionGroup }, analytics);
    const req = { query: { entity_id: 'missing' } } as never;
    const res = createMockResponse();

    const response = await handleResolutionGroup(ctx, req, res);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_ERROR_EVENT, {
      errorType,
      operation: 'group',
      namespace: NAMESPACE,
    });
    expect(response.status).toBe(statusCode);
  });

  it('does not report error telemetry for unknown errors', async () => {
    mockGetResolutionGroup.mockRejectedValue(new Error('unexpected'));

    const ctx = createMockContext({ getResolutionGroup: mockGetResolutionGroup }, analytics);
    const req = { query: { entity_id: 'target-1' } } as never;
    const res = createMockResponse();

    await expect(handleResolutionGroup(ctx, req, res)).rejects.toThrow('unexpected');

    expect(analytics.reportEvent).not.toHaveBeenCalled();
  });
});
