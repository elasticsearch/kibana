/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import type { CoreStart, KibanaRequest } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { escapeQuotes } from '@kbn/es-query';
import type { ParsedTechnicalFields } from '@kbn/rule-registry-plugin/common';
import { isOsqueryResponseActionAuthorized } from './check_response_action_authz';
import { packSavedObjectType, savedQuerySavedObjectType } from '../../common/types';

const SAVED_QUERY_ID = 'test-saved-query-id';
const SAVED_QUERY_SO_ID = 'so-uuid-1';
const PACK_ID = 'test-pack-id';
const STORED_QUERY = 'select 1 from uptime;';
const STORED_PACK_QUERY = 'select * from processes;';
const UBUNTU_ALERT = {
  host: { os: { name: 'Ubuntu' } },
} as unknown as ParsedTechnicalFields & { _index: string };

const attributesIdFilter = (id: string) =>
  `${savedQuerySavedObjectType}.attributes.id: "${escapeQuotes(id)}"`;

describe('isOsqueryResponseActionAuthorized', () => {
  let request: KibanaRequest;

  const createMockCoreStart = (
    capabilities: Record<string, boolean>,
    savedObjects: Record<
      string,
      {
        id?: string;
        query?: string;
        queries?: Array<{ query: string; ecs_mapping?: Record<string, unknown> }>;
        ecs_mapping?: Array<{ key: string; value: Record<string, unknown> }>;
      }
    > = {}
  ): CoreStart => {
    const get = jest.fn(async (type: string, id: string) => {
      const found = savedObjects[id];

      if (!found) {
        throw SavedObjectsErrorHelpers.createGenericNotFoundError(type, id);
      }

      return { id, type, attributes: found, references: [] };
    });

    const find = jest.fn(async ({ filter }: { filter?: string }) => {
      const matches = Object.entries(savedObjects).filter(([, attributes]) => {
        const publicId = attributes.id;

        return publicId !== undefined && filter === attributesIdFilter(publicId);
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

    return {
      capabilities: {
        resolveCapabilities: jest.fn().mockResolvedValue({ osquery: capabilities }),
      },
      savedObjects: {
        getScopedClient: jest.fn().mockReturnValue({ get, find, resolve }),
      },
    } as unknown as CoreStart;
  };

  const withSavedQuery = (capabilities: Record<string, boolean>) =>
    createMockCoreStart(capabilities, {
      [SAVED_QUERY_ID]: { query: STORED_QUERY },
      [PACK_ID]: { queries: [{ query: STORED_PACK_QUERY }] },
    });

  beforeEach(() => {
    request = httpServerMock.createKibanaRequest();
  });

  describe('writeLiveQueries', () => {
    it('should authorize an arbitrary query', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: true, runSavedQueries: false });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, { query: 'select 1;' })
      ).resolves.toBe(true);
    });

    it('should authorize regardless of the saved_query_id supplied', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: true, runSavedQueries: false });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: 'does-not-exist',
          query: 'select 1;',
        })
      ).resolves.toBe(true);
    });

    it('should authorize an arbitrary queries array', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: true, runSavedQueries: false });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          queries: [{ query: 'select 1;' }, { query: 'select 2;' }],
        })
      ).resolves.toBe(true);
    });
  });

  describe('no privileges', () => {
    it('should reject a direct query', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: false });

      await expect(isOsqueryResponseActionAuthorized(coreStart, request, {})).resolves.toBe(false);
    });

    it('should reject even with a resolvable saved_query_id', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: false });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, { saved_query_id: SAVED_QUERY_ID })
      ).resolves.toBe(false);
    });
  });

  describe('runSavedQueries only', () => {
    it('should reject when no reference is supplied', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(isOsqueryResponseActionAuthorized(coreStart, request, {})).resolves.toBe(false);
    });

    it('should authorize a resolvable saved_query_id with no caller-supplied query', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, { saved_query_id: SAVED_QUERY_ID })
      ).resolves.toBe(true);
    });

    it('should reject when more than one saved query has the same attributes.id', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        {
          'so-a': { id: SAVED_QUERY_ID, query: STORED_QUERY },
          'so-b': { id: SAVED_QUERY_ID, query: STORED_QUERY },
        }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, { saved_query_id: SAVED_QUERY_ID })
      ).resolves.toBe(false);
    });

    it('should authorize a saved_query_id that matches attributes.id rather than the SO id', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        { [SAVED_QUERY_SO_ID]: { id: SAVED_QUERY_ID, query: STORED_QUERY } }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, { saved_query_id: SAVED_QUERY_ID })
      ).resolves.toBe(true);

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

    it('should authorize a resolvable pack_id', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, { pack_id: PACK_ID })
      ).resolves.toBe(true);
    });

    it('should reject a saved_query_id that does not resolve', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: 'does-not-exist',
          query: 'select 42 as custom;',
        })
      ).resolves.toBe(false);
    });

    it('should reject a whitespace-only saved_query_id', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: ' ',
          query: 'select 42 as custom;',
        })
      ).resolves.toBe(false);
    });

    it('should reject a pack_id that does not resolve', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, { pack_id: 'does-not-exist' })
      ).resolves.toBe(false);
    });

    it('should authorize a query matching the stored saved query', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          query: STORED_QUERY,
        })
      ).resolves.toBe(true);
    });

    it('should reject a query that does not match the stored saved query', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          query: 'select 42 as custom;',
        })
      ).resolves.toBe(false);
    });

    it('should reject a queries array with a resolvable saved_query_id', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          queries: [{ query: 'select 42 as custom;' }],
        })
      ).resolves.toBe(false);
    });

    it('should reject a queries array without a pack_id', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          queries: [{ query: 'select 42 as custom;' }],
        })
      ).resolves.toBe(false);
    });

    it('should authorize a resolvable pack_id even when queries[] is also supplied', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          pack_id: PACK_ID,
          queries: [{ query: STORED_PACK_QUERY }],
        })
      ).resolves.toBe(true);
    });

    it('should reject a pack_id when the copied queries[] do not match the pack', async () => {
      // Dispatch rebuilds the query set from the pack, so an unvouched-for copy cannot change
      // what SQL runs — but it is persisted on the rule and read to decide whether to dispatch
      // per alert with substitution. Requiring a match keeps that decision unsteerable.
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          pack_id: PACK_ID,
          queries: [{ query: 'select 42 as custom;' }],
        })
      ).resolves.toBe(false);
    });

    it('should reject a mismatched ecs_mapping on a resolvable saved query', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        {
          [SAVED_QUERY_ID]: {
            query: STORED_QUERY,
            ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
          },
        }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          ecs_mapping: { 'process.name': { field: 'name' } },
        })
      ).resolves.toBe(false);
    });

    it('should authorize an ecs_mapping that matches the stored saved query', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        {
          [SAVED_QUERY_ID]: {
            query: STORED_QUERY,
            ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
          },
        }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          ecs_mapping: { 'host.name': { field: 'name' } },
        })
      ).resolves.toBe(true);
    });

    it('should authorize an empty ecs_mapping against a saved query that has none', async () => {
      // `toEcsMappingRecord` collapses `{}` to undefined on both sides, so an explicit empty
      // mapping is equivalent to omitting the field when the saved query has none either.
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          query: STORED_QUERY,
          ecs_mapping: {},
        })
      ).resolves.toBe(true);
    });

    it('should authorize an empty ecs_mapping for a saved query that has one', async () => {
      // An absent or empty mapping asserts nothing, so it cannot deny. Sending `{}` is still not
      // a way to strip the stored mapping: dispatch derives it from the saved object whenever the
      // stored SQL is what runs (see `create_queries.test.ts`).
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        {
          [SAVED_QUERY_ID]: {
            query: STORED_QUERY,
            ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
          },
        }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          query: STORED_QUERY,
          ecs_mapping: {},
        })
      ).resolves.toBe(true);
    });

    it('should authorize an ecs_mapping that matches one of the pack queries', async () => {
      // Packs hold `ecs_mapping` per query, so a top-level mapping is matched against those.
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        {
          [PACK_ID]: {
            queries: [
              { query: 'select 1;' },
              { query: STORED_PACK_QUERY, ecs_mapping: { 'host.name': { field: 'name' } } },
            ],
          },
        }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          pack_id: PACK_ID,
          query: STORED_PACK_QUERY,
          ecs_mapping: { 'host.name': { field: 'name' } },
        })
      ).resolves.toBe(true);
    });

    it('should reject an ecs_mapping that matches no pack query', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        {
          [PACK_ID]: {
            queries: [
              { query: STORED_PACK_QUERY, ecs_mapping: { 'host.name': { field: 'name' } } },
            ],
          },
        }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          pack_id: PACK_ID,
          query: STORED_PACK_QUERY,
          ecs_mapping: { 'process.name': { field: 'name' } },
        })
      ).resolves.toBe(false);
    });

    it('should authorize an empty ecs_mapping against a pack whose queries have none', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          pack_id: PACK_ID,
          query: STORED_PACK_QUERY,
          ecs_mapping: {},
        })
      ).resolves.toBe(true);
    });

    it('should authorize an empty ecs_mapping for a pack whose query has one', async () => {
      // As above: empty asserts nothing. Pack dispatch always rebuilds per-query mappings from
      // the pack saved object, so the caller's empty mapping never reaches the agent.

      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        {
          [PACK_ID]: {
            queries: [
              { query: STORED_PACK_QUERY, ecs_mapping: { 'host.name': { field: 'name' } } },
            ],
          },
        }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          pack_id: PACK_ID,
          query: STORED_PACK_QUERY,
          ecs_mapping: {},
        })
      ).resolves.toBe(true);
    });

    it('should authorize a client-substituted query when it matches server-side substitution', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        { [SAVED_QUERY_ID]: { query: "select * from os_version where name='{{host.os.name}}';" } }
      );

      await expect(
        isOsqueryResponseActionAuthorized(
          coreStart,
          request,
          {
            saved_query_id: SAVED_QUERY_ID,
            query: "select * from os_version where name='Ubuntu';",
          },
          undefined,
          UBUNTU_ALERT
        )
      ).resolves.toBe(true);
    });

    it('should reject a client-substituted query without alert context', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        { [SAVED_QUERY_ID]: { query: "select * from os_version where name='{{host.os.name}}';" } }
      );

      await expect(
        isOsqueryResponseActionAuthorized(coreStart, request, {
          saved_query_id: SAVED_QUERY_ID,
          query: "select * from os_version where name='Ubuntu';",
        })
      ).resolves.toBe(false);
    });

    it('should reject a parameter substitution that does not match server-side substitution', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        { [SAVED_QUERY_ID]: { query: "select * from os_version where name='{{host.os.name}}';" } }
      );

      await expect(
        isOsqueryResponseActionAuthorized(
          coreStart,
          request,
          {
            saved_query_id: SAVED_QUERY_ID,
            query: "select * from os_version where name='' UNION SELECT name FROM users --';",
          },
          undefined,
          UBUNTU_ALERT
        )
      ).resolves.toBe(false);
    });

    it('should reject SQL appended around a parameterised stored query', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        { [SAVED_QUERY_ID]: { query: "select * from os_version where name='{{host.os.name}}';" } }
      );

      await expect(
        isOsqueryResponseActionAuthorized(
          coreStart,
          request,
          {
            saved_query_id: SAVED_QUERY_ID,
            query: "select * from os_version where name='Ubuntu'; select 42 as custom;",
          },
          undefined,
          UBUNTU_ALERT
        )
      ).resolves.toBe(false);
    });

    it('should reject a supplied query when the stored query is only a placeholder', async () => {
      const coreStart = createMockCoreStart(
        { writeLiveQueries: false, runSavedQueries: true },
        { [SAVED_QUERY_ID]: { query: '{{host.os.name}}' } }
      );

      await expect(
        isOsqueryResponseActionAuthorized(
          coreStart,
          request,
          {
            saved_query_id: SAVED_QUERY_ID,
            query: 'select 42 as custom;',
          },
          undefined,
          UBUNTU_ALERT
        )
      ).resolves.toBe(false);
    });
  });

  describe('resolution', () => {
    it('should resolve capabilities with the correct request and path', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: true, runSavedQueries: false });

      await isOsqueryResponseActionAuthorized(coreStart, request, {});

      expect(coreStart.capabilities.resolveCapabilities).toHaveBeenCalledWith(request, {
        capabilityPath: 'osquery.*',
      });
    });

    it('should not read saved objects when writeLiveQueries short-circuits', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: true, runSavedQueries: false });

      await isOsqueryResponseActionAuthorized(coreStart, request, {
        saved_query_id: SAVED_QUERY_ID,
      });

      expect(coreStart.savedObjects.getScopedClient).not.toHaveBeenCalled();
    });

    it('should look the reference up as the expected saved object type', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await isOsqueryResponseActionAuthorized(coreStart, request, {
        saved_query_id: SAVED_QUERY_ID,
      });

      const soClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0].value;
      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({ type: savedQuerySavedObjectType })
      );
      expect(soClient.resolve).toHaveBeenCalledWith(savedQuerySavedObjectType, SAVED_QUERY_ID);
    });

    it('should look a pack reference up as the pack saved object type', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await isOsqueryResponseActionAuthorized(coreStart, request, { pack_id: PACK_ID });

      const soClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0].value;
      expect(soClient.get).toHaveBeenCalledWith(packSavedObjectType, PACK_ID);
    });

    it('should resolve the same reference only once per request', async () => {
      const coreStart = withSavedQuery({ writeLiveQueries: false, runSavedQueries: true });

      await isOsqueryResponseActionAuthorized(coreStart, request, {
        saved_query_id: SAVED_QUERY_ID,
      });
      await isOsqueryResponseActionAuthorized(coreStart, request, {
        saved_query_id: SAVED_QUERY_ID,
      });

      const soClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0].value;
      expect(soClient.find).toHaveBeenCalledTimes(1);
      expect(soClient.resolve).toHaveBeenCalledTimes(1);
    });
  });
});
