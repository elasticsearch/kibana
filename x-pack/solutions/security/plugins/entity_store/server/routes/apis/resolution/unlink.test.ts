/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { KibanaResponseFactory } from '@kbn/core-http-server';
import {
  EntitiesNotFoundError,
  MixedEntityTypesError,
  ResolutionUpdateError,
} from '../../../domain/errors';
import type { EntityStoreRequestHandlerContext } from '../../../types';
import type { ResolutionClient } from '../../../domain/resolution';
import type { TelemetryReporter } from '../../../telemetry/events';
import {
  ENTITY_STORE_RESOLUTION_ERROR_EVENT,
  ENTITY_STORE_RESOLUTION_UNLINK_EVENT,
} from '../../../telemetry/events';
import { handleResolutionUnlink } from './unlink';

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
  } as unknown as KibanaResponseFactory;
}

describe('handleResolutionUnlink', () => {
  let analytics: TelemetryReporter;
  let mockUnlinkEntities: jest.Mock;

  beforeEach(() => {
    analytics = createMockAnalytics();
    mockUnlinkEntities = jest.fn();
  });

  it('reports unlink telemetry on success', async () => {
    mockUnlinkEntities.mockResolvedValue({
      unlinked: ['alias-1'],
      skipped: ['entity-1'],
      entity_type: 'user',
    });

    const ctx = createMockContext({ unlinkEntities: mockUnlinkEntities }, analytics);
    const req = { body: { entity_ids: ['alias-1', 'entity-1'] } } as never;
    const res = createMockResponse();

    await handleResolutionUnlink(ctx, req, res);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_UNLINK_EVENT, {
      entityType: 'user',
      entitiesUnlinked: 1,
      entitiesSkipped: 1,
      namespace: NAMESPACE,
    });
    expect(res.ok).toHaveBeenCalled();
  });

  it('reports error telemetry for EntitiesNotFoundError', async () => {
    mockUnlinkEntities.mockRejectedValue(new EntitiesNotFoundError(['missing']));

    const ctx = createMockContext({ unlinkEntities: mockUnlinkEntities }, analytics);
    const req = { body: { entity_ids: ['missing'] } } as never;
    const res = createMockResponse();

    const response = await handleResolutionUnlink(ctx, req, res);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_ERROR_EVENT, {
      errorType: 'entities_not_found',
      operation: 'unlink',
      namespace: NAMESPACE,
    });
    expect(response.status).toBe(400);
  });

  it('reports error telemetry for MixedEntityTypesError', async () => {
    mockUnlinkEntities.mockRejectedValue(new MixedEntityTypesError(['user', 'host']));

    const ctx = createMockContext({ unlinkEntities: mockUnlinkEntities }, analytics);
    const req = { body: { entity_ids: ['alias-user', 'alias-host'] } } as never;
    const res = createMockResponse();

    const response = await handleResolutionUnlink(ctx, req, res);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_ERROR_EVENT, {
      errorType: 'mixed_entity_types',
      operation: 'unlink',
      namespace: NAMESPACE,
    });
    expect(response.status).toBe(400);
  });

  it('reports resolution_update error telemetry before re-throwing', async () => {
    mockUnlinkEntities.mockRejectedValue(new ResolutionUpdateError('unlinking', []));

    const ctx = createMockContext({ unlinkEntities: mockUnlinkEntities }, analytics);
    const req = { body: { entity_ids: ['alias-1'] } } as never;
    const res = createMockResponse();

    await expect(handleResolutionUnlink(ctx, req, res)).rejects.toThrow(ResolutionUpdateError);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_ERROR_EVENT, {
      errorType: 'resolution_update',
      operation: 'unlink',
      namespace: NAMESPACE,
    });
  });

  it('does not report error telemetry for unknown errors', async () => {
    mockUnlinkEntities.mockRejectedValue(new Error('unexpected'));

    const ctx = createMockContext({ unlinkEntities: mockUnlinkEntities }, analytics);
    const req = { body: { entity_ids: ['alias-1'] } } as never;
    const res = createMockResponse();

    await expect(handleResolutionUnlink(ctx, req, res)).rejects.toThrow('unexpected');

    expect(analytics.reportEvent).not.toHaveBeenCalled();
  });
});
