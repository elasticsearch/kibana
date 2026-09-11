/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext, SavedObject } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { SavedSearchType } from '@kbn/saved-search-plugin/common';
import type { DiscoverSessionAttributes } from '@kbn/saved-search-plugin/server';
import { discoverSessionApiData } from './transforms/transform_discover_session.fixtures';
import { transformDiscoverSessionIn } from './transforms';
import { upsertDiscoverSession } from './session_upsert';

const { attributes, references } = transformDiscoverSessionIn(discoverSessionApiData);

const createSavedObject = (
  id: string,
  overrides: Partial<SavedObject<DiscoverSessionAttributes>> = {}
): SavedObject<DiscoverSessionAttributes> => ({
  id,
  type: SavedSearchType,
  attributes,
  references,
  version: 'WzEsMV0=',
  ...overrides,
});

describe('upsertDiscoverSession', () => {
  const requestId = 'discover-session';
  let coreContext: ReturnType<typeof coreMock.createRequestHandlerContext>;
  let requestContext: RequestHandlerContext;

  beforeEach(() => {
    coreContext = coreMock.createRequestHandlerContext();
    requestContext = jest.mocked<RequestHandlerContext>({
      core: Promise.resolve(coreContext),
      loadPluginContract: jest.fn(),
      resolve: jest.fn().mockResolvedValue({ core: coreContext }),
    });
  });

  it('passes the requested ID and full-replacement options to the Saved Objects client', async () => {
    const updated = createSavedObject(requestId, {
      updated_at: '2026-07-15T12:00:00.000Z',
      version: 'WzIsMV0=',
    });

    coreContext.savedObjects.client.resolve.mockResolvedValue({
      outcome: 'exactMatch',
      saved_object: createSavedObject(requestId),
    });
    coreContext.savedObjects.client.get.mockResolvedValue(updated);
    coreContext.savedObjects.client.update.mockResolvedValue(updated);

    await upsertDiscoverSession(requestContext, requestId, discoverSessionApiData);

    expect(coreContext.savedObjects.client.update).toHaveBeenCalledWith(
      SavedSearchType,
      requestId,
      attributes,
      {
        upsert: attributes,
        references,
        mergeAttributes: false,
      }
    );
    expect(coreContext.savedObjects.client.resolve).toHaveBeenCalledWith(
      SavedSearchType,
      requestId
    );
    expect(coreContext.savedObjects.client.get).toHaveBeenCalledWith(SavedSearchType, requestId);
  });

  it('propagates non-not-found errors from the existence check', async () => {
    const error = new Error('Resolve failed');
    coreContext.savedObjects.client.resolve.mockRejectedValue(error);

    await expect(
      upsertDiscoverSession(requestContext, requestId, discoverSessionApiData)
    ).rejects.toBe(error);

    expect(coreContext.savedObjects.client.update).not.toHaveBeenCalled();
  });

  it('updates the target of a legacy URL alias', async () => {
    const aliasId = 'Legacy-Discover-Session';
    const resolvedId = 'resolved-discover-session';
    const updated = createSavedObject(resolvedId, {
      updated_at: '2026-07-15T12:00:00.000Z',
      version: 'WzIsMV0=',
    });

    coreContext.savedObjects.client.resolve.mockResolvedValue({
      outcome: 'aliasMatch',
      saved_object: createSavedObject(resolvedId),
      alias_target_id: resolvedId,
      alias_purpose: 'savedObjectConversion',
    });
    coreContext.savedObjects.client.update.mockResolvedValue(updated);
    coreContext.savedObjects.client.get.mockResolvedValue(updated);

    const result = await upsertDiscoverSession(requestContext, aliasId, discoverSessionApiData);

    expect(coreContext.savedObjects.client.update).toHaveBeenCalledWith(
      SavedSearchType,
      resolvedId,
      attributes,
      {
        upsert: attributes,
        references,
        mergeAttributes: false,
      }
    );
    expect(coreContext.savedObjects.client.get).toHaveBeenCalledWith(SavedSearchType, resolvedId);
    expect(result.body.id).toBe(resolvedId);
    expect(result.operation).toBe('update');
  });

  it('throws a conflict when the requested ID resolves ambiguously', async () => {
    coreContext.savedObjects.client.resolve.mockResolvedValue({
      outcome: 'conflict',
      saved_object: createSavedObject(requestId),
      alias_target_id: 'alias-target',
      alias_purpose: 'savedObjectConversion',
    });

    await expect(
      upsertDiscoverSession(requestContext, requestId, discoverSessionApiData)
    ).rejects.toMatchObject({
      output: {
        statusCode: 409,
      },
    });

    expect(coreContext.savedObjects.client.update).not.toHaveBeenCalled();
  });

  it('propagates conflicts from update without performing the final fetch', async () => {
    const error = SavedObjectsErrorHelpers.createConflictError(SavedSearchType, requestId);
    coreContext.savedObjects.client.resolve.mockResolvedValue({
      outcome: 'exactMatch',
      saved_object: createSavedObject(requestId),
    });
    coreContext.savedObjects.client.update.mockRejectedValue(error);

    await expect(
      upsertDiscoverSession(requestContext, requestId, discoverSessionApiData)
    ).rejects.toBe(error);

    expect(coreContext.savedObjects.client.get).not.toHaveBeenCalled();
  });
});
