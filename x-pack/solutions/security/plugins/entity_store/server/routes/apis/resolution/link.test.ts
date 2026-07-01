/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { KibanaResponseFactory } from '@kbn/core-http-server';
import {
  ChainResolutionError,
  EntitiesNotFoundError,
  EntityHasAliasesError,
  MixedEntityTypesError,
  ResolutionSearchTruncatedError,
  ResolutionUpdateError,
  SelfLinkError,
} from '../../../domain/errors';
import type { EntityStoreRequestHandlerContext } from '../../../types';
import type { ResolutionClient } from '../../../domain/resolution';
import type { TelemetryReporter } from '../../../telemetry/events';
import {
  ENTITY_STORE_RESOLUTION_ERROR_EVENT,
  ENTITY_STORE_RESOLUTION_LINK_EVENT,
} from '../../../telemetry/events';
import { handleResolutionLink } from './link';

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

describe('handleResolutionLink', () => {
  let analytics: TelemetryReporter;
  let mockLinkEntities: jest.Mock;

  beforeEach(() => {
    analytics = createMockAnalytics();
    mockLinkEntities = jest.fn();
  });

  it('reports link telemetry on success', async () => {
    mockLinkEntities.mockResolvedValue({
      linked: ['entity-1', 'entity-2'],
      skipped: ['entity-3'],
      target_id: 'target-1',
      entity_type: 'user',
    });

    const ctx = createMockContext({ linkEntities: mockLinkEntities }, analytics);
    const req = {
      body: { target_id: 'target-1', entity_ids: ['entity-1', 'entity-2', 'entity-3'] },
    } as never;
    const res = createMockResponse();

    await handleResolutionLink(ctx, req, res);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_LINK_EVENT, {
      entityType: 'user',
      entitiesLinked: 2,
      entitiesSkipped: 1,
      namespace: NAMESPACE,
    });
    expect(res.ok).toHaveBeenCalled();
  });

  it.each([
    [new SelfLinkError('target-1'), 'self_link', 400],
    [new MixedEntityTypesError(['user', 'host']), 'mixed_entity_types', 400],
    [new ChainResolutionError('entity-1', 'other'), 'chain_resolution', 400],
    [new EntityHasAliasesError('entity-1', ['alias-1']), 'entity_has_aliases', 400],
    [
      new ResolutionSearchTruncatedError('findEntitiesWithAliases', 1, 100),
      'resolution_search_truncated',
      400,
    ],
    [new EntitiesNotFoundError(['missing']), 'entities_not_found', 400],
  ])('reports error telemetry for %s', async (error, errorType, statusCode) => {
    mockLinkEntities.mockRejectedValue(error);

    const ctx = createMockContext({ linkEntities: mockLinkEntities }, analytics);
    const req = {
      body: { target_id: 'target-1', entity_ids: ['entity-1'] },
    } as never;
    const res = createMockResponse();

    const response = await handleResolutionLink(ctx, req, res);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_ERROR_EVENT, {
      errorType,
      operation: 'link',
      namespace: NAMESPACE,
    });
    expect(response.status).toBe(statusCode);
  });

  it('reports resolution_update error telemetry before re-throwing', async () => {
    const error = new ResolutionUpdateError('linking', []);
    mockLinkEntities.mockRejectedValue(error);

    const ctx = createMockContext({ linkEntities: mockLinkEntities }, analytics);
    const req = {
      body: { target_id: 'target-1', entity_ids: ['entity-1'] },
    } as never;
    const res = createMockResponse();

    await expect(handleResolutionLink(ctx, req, res)).rejects.toThrow(ResolutionUpdateError);

    expect(analytics.reportEvent).toHaveBeenCalledWith(ENTITY_STORE_RESOLUTION_ERROR_EVENT, {
      errorType: 'resolution_update',
      operation: 'link',
      namespace: NAMESPACE,
    });
  });

  it('does not report error telemetry for unknown errors', async () => {
    mockLinkEntities.mockRejectedValue(new Error('unexpected'));

    const ctx = createMockContext({ linkEntities: mockLinkEntities }, analytics);
    const req = {
      body: { target_id: 'target-1', entity_ids: ['entity-1'] },
    } as never;
    const res = createMockResponse();

    await expect(handleResolutionLink(ctx, req, res)).rejects.toThrow('unexpected');

    expect(analytics.reportEvent).not.toHaveBeenCalled();
  });
});
