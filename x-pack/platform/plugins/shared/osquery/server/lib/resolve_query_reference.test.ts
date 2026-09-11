/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { escapeQuotes } from '@kbn/es-query';
import { lookupSavedQuery, resolveQueryReference } from './resolve_query_reference';
import { packSavedObjectType, savedQuerySavedObjectType } from '../../common/types';

const SAVED_QUERY_ID = 'saved-query-1';
const SAVED_QUERY_SO_ID = 'so-uuid-1';
const PACK_ID = 'pack-1';

const attributesIdFilter = (id: string) =>
  `${savedQuerySavedObjectType}.attributes.id: "${escapeQuotes(id)}"`;

describe('resolveQueryReference', () => {
  const createMockCoreStart = (
    objectsBySpace: Record<string, Record<string, object>>
  ): CoreStart => {
    const getScopedClient = jest.fn((request: { headers: unknown }) => {
      const spaceId = (request as unknown as { spaceId?: string }).spaceId ?? 'default';
      const objects = objectsBySpace[spaceId] ?? {};

      const get = jest.fn(async (type: string, id: string) => {
        const found = objects[id];

        if (!found) {
          throw SavedObjectsErrorHelpers.createGenericNotFoundError(type, id);
        }

        return { id, type, attributes: found, references: [] };
      });

      const find = jest.fn(async ({ filter }: { filter?: string }) => {
        const matches = Object.entries(objects).filter(([, attributes]) => {
          const publicId = (attributes as { id?: string }).id;

          return filter === attributesIdFilter(publicId ?? '');
        });

        return {
          saved_objects: matches.map(([id, attributes]) => ({
            id,
            type: savedQuerySavedObjectType,
            attributes,
            references: [],
          })),
          total: matches.length,
        };
      });

      const resolve = jest.fn(async (type: string, id: string) => ({
        saved_object: await get(type, id),
        outcome: 'exactMatch' as const,
      }));

      return { get, find, resolve };
    });

    return { savedObjects: { getScopedClient } } as unknown as CoreStart;
  };

  it('should resolve a saved query in the active space by SO id', async () => {
    const coreStart = createMockCoreStart({
      default: { [SAVED_QUERY_ID]: { query: 'select 1;' } },
    });

    await expect(
      resolveQueryReference(coreStart, 'default', { saved_query_id: SAVED_QUERY_ID })
    ).resolves.toEqual({ savedObjectId: SAVED_QUERY_ID, query: 'select 1;' });
  });

  it('should resolve a saved query by attributes.id when it differs from the SO id', async () => {
    const coreStart = createMockCoreStart({
      default: { [SAVED_QUERY_SO_ID]: { id: SAVED_QUERY_ID, query: 'select 1;' } },
    });

    await expect(
      resolveQueryReference(coreStart, 'default', { saved_query_id: SAVED_QUERY_ID })
    ).resolves.toEqual({ savedObjectId: SAVED_QUERY_SO_ID, query: 'select 1;' });

    const soClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0].value;
    expect(soClient.find).toHaveBeenCalledWith(
      expect.objectContaining({
        type: savedQuerySavedObjectType,
        filter: attributesIdFilter(SAVED_QUERY_ID),
        perPage: 2,
      })
    );
    expect(soClient.get).not.toHaveBeenCalled();
  });

  it('should fail closed when more than one saved query has the same attributes.id', async () => {
    const coreStart = createMockCoreStart({
      default: {
        'so-a': { id: SAVED_QUERY_ID, query: 'select 1;' },
        'so-b': { id: SAVED_QUERY_ID, query: 'select 2;' },
      },
    });

    await expect(
      resolveQueryReference(coreStart, 'default', { saved_query_id: SAVED_QUERY_ID })
    ).resolves.toBeUndefined();
  });

  it('should include stored ecs_mapping in record form', async () => {
    const coreStart = createMockCoreStart({
      default: {
        [SAVED_QUERY_ID]: {
          query: 'select 1;',
          ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
        },
      },
    });

    await expect(
      resolveQueryReference(coreStart, 'default', { saved_query_id: SAVED_QUERY_ID })
    ).resolves.toEqual({
      savedObjectId: SAVED_QUERY_ID,
      query: 'select 1;',
      ecs_mapping: { 'host.name': { field: 'name' } },
    });
  });

  it('should resolve a pack to its stored queries', async () => {
    const coreStart = createMockCoreStart({
      default: {
        [PACK_ID]: { queries: [{ query: 'select 1;' }, { query: 'select 2;' }] },
      },
    });

    await expect(
      resolveQueryReference(coreStart, 'default', { pack_id: PACK_ID })
    ).resolves.toEqual({
      savedObjectId: PACK_ID,
      isPack: true,
      queries: ['select 1;', 'select 2;'],
      queryEcsMappings: [undefined, undefined],
    });
  });

  it('should return undefined for a reference that does not exist', async () => {
    const coreStart = createMockCoreStart({ default: {} });

    await expect(
      resolveQueryReference(coreStart, 'default', { saved_query_id: 'missing' })
    ).resolves.toBeUndefined();
  });

  it('should return undefined when no reference is supplied', async () => {
    const coreStart = createMockCoreStart({ default: {} });

    await expect(resolveQueryReference(coreStart, 'default', {})).resolves.toBeUndefined();
    expect(coreStart.savedObjects.getScopedClient).not.toHaveBeenCalled();
  });

  it.each([' ', '', '   '])(
    'should treat a blank saved_query_id (%p) as no reference',
    async (savedQueryId) => {
      const coreStart = createMockCoreStart({ default: {} });

      await expect(
        resolveQueryReference(coreStart, 'default', { saved_query_id: savedQueryId })
      ).resolves.toBeUndefined();
      expect(coreStart.savedObjects.getScopedClient).not.toHaveBeenCalled();
    }
  );

  it('should not resolve a reference that only exists in another space', async () => {
    const coreStart = createMockCoreStart({
      other: { [SAVED_QUERY_ID]: { query: 'select 1;' } },
    });

    await expect(
      resolveQueryReference(coreStart, 'default', { saved_query_id: SAVED_QUERY_ID })
    ).resolves.toBeUndefined();
  });

  it('should resolve the same reference when scoped to the space that owns it', async () => {
    const coreStart = createMockCoreStart({
      other: { [SAVED_QUERY_ID]: { query: 'select 1;' } },
    });

    await expect(
      resolveQueryReference(coreStart, 'other', { saved_query_id: SAVED_QUERY_ID })
    ).resolves.toEqual({ savedObjectId: SAVED_QUERY_ID, query: 'select 1;' });
  });

  it('should prefer pack_id when both references are supplied', async () => {
    const coreStart = createMockCoreStart({
      default: {
        [SAVED_QUERY_ID]: { query: 'select 1;' },
        [PACK_ID]: { queries: [{ query: 'select 2;' }] },
      },
    });

    await expect(
      resolveQueryReference(coreStart, 'default', {
        saved_query_id: SAVED_QUERY_ID,
        pack_id: PACK_ID,
      })
    ).resolves.toEqual({
      savedObjectId: PACK_ID,
      isPack: true,
      queries: ['select 2;'],
      queryEcsMappings: [undefined],
    });
  });

  it('should look references up as their expected saved object types', async () => {
    const coreStart = createMockCoreStart({
      default: { [SAVED_QUERY_ID]: { query: 'select 1;' }, [PACK_ID]: { queries: [] } },
    });

    await resolveQueryReference(coreStart, 'default', { saved_query_id: SAVED_QUERY_ID });
    const savedQueryClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0]
      .value;
    expect(savedQueryClient.find).toHaveBeenCalledWith(
      expect.objectContaining({ type: savedQuerySavedObjectType })
    );
    expect(savedQueryClient.resolve).toHaveBeenCalledWith(
      savedQuerySavedObjectType,
      SAVED_QUERY_ID
    );

    await resolveQueryReference(coreStart, 'default', { pack_id: PACK_ID });
    const packClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[1].value;
    expect(packClient.get).toHaveBeenCalledWith(packSavedObjectType, PACK_ID);
  });

  it('should propagate non-404 saved object errors', async () => {
    const coreStart = {
      savedObjects: {
        getScopedClient: jest.fn().mockReturnValue({
          find: jest.fn().mockResolvedValue({ saved_objects: [], total: 0 }),
          resolve: jest.fn().mockRejectedValue(new Error('elasticsearch unavailable')),
        }),
      },
    } as unknown as CoreStart;

    await expect(
      resolveQueryReference(coreStart, 'default', { saved_query_id: SAVED_QUERY_ID })
    ).rejects.toThrow('elasticsearch unavailable');
  });
});

describe('lookupSavedQuery', () => {
  it('should not call the SO client for a blank id', async () => {
    const soClient = {
      find: jest.fn(),
      resolve: jest.fn(),
    };

    await expect(lookupSavedQuery(soClient, '  ')).resolves.toBeUndefined();
    expect(soClient.find).not.toHaveBeenCalled();
    expect(soClient.resolve).not.toHaveBeenCalled();
  });

  it('should use a legacy-alias match when find has no attributes.id hit', async () => {
    const soClient = {
      find: jest.fn().mockResolvedValue({ saved_objects: [], total: 0 }),
      resolve: jest.fn().mockResolvedValue({
        saved_object: { id: 'current-so-id', attributes: { query: 'select 1;' } },
        outcome: 'aliasMatch',
        alias_target_id: 'current-so-id',
      }),
    };

    await expect(lookupSavedQuery(soClient, 'legacy-id')).resolves.toEqual({
      savedObjectId: 'current-so-id',
      query: 'select 1;',
    });
  });

  it('should fail closed when resolve reports an alias conflict', async () => {
    const soClient = {
      find: jest.fn().mockResolvedValue({ saved_objects: [], total: 0 }),
      resolve: jest.fn().mockResolvedValue({
        saved_object: { id: 'legacy-id', attributes: { query: 'select 1;' } },
        outcome: 'conflict',
      }),
    };

    await expect(lookupSavedQuery(soClient, 'legacy-id')).resolves.toBeUndefined();
  });

  it('should fail closed when resolve returns an error result', async () => {
    const soClient = {
      find: jest.fn().mockResolvedValue({ saved_objects: [], total: 0 }),
      resolve: jest.fn().mockResolvedValue({
        saved_object: {
          id: 'legacy-id',
          type: savedQuerySavedObjectType,
          error: { statusCode: 404, error: 'Not Found', message: 'Saved object not found' },
        },
        outcome: 'exactMatch',
      }),
    };

    await expect(lookupSavedQuery(soClient, 'legacy-id')).resolves.toBeUndefined();
  });
});
