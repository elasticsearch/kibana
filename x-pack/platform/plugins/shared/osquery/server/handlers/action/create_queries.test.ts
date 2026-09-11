/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createDynamicQueries } from './create_queries';
import type { ParsedTechnicalFields } from '@kbn/rule-registry-plugin/common';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { PARAMETER_NOT_FOUND, SAVED_QUERY_NOT_FOUND } from '../../../common/translations/errors';
import type { SavedObjectsClient } from '@kbn/core/server';
import { savedQuerySavedObjectType } from '../../../common/types';

jest.mock('../../routes/saved_query/utils', () => ({
  isSavedQueryPrebuilt: jest.fn().mockResolvedValue(false),
}));

describe('create queries', () => {
  const spaceId = 'default';
  const mockSavedObjectsClient = {} as unknown as SavedObjectsClient;
  const defualtQueryParams = {
    interval: 3600,
    platform: 'linux',
    version: '1.0.0',
    ecs_mapping: {},
    removed: false,
    snapshot: true,
  };
  const TEST_AGENT = 'test-agent';

  const emptyFindResult = { saved_objects: [], total: 0 };

  const soClientWithGet = (get: jest.Mock): SavedObjectsClient => {
    const resolve = jest.fn(async (type: string, id: string) => ({
      saved_object: await get(type, id),
      outcome: 'exactMatch' as const,
    }));

    return {
      find: jest.fn().mockResolvedValue(emptyFindResult),
      get,
      resolve,
    } as unknown as SavedObjectsClient;
  };

  const mockedQueriesParams = {
    queries: [
      {
        query: 'SELECT * FROM processes where pid={{process.pid}};',
        id: 'process_with_params',
        ...defualtQueryParams,
      },
      {
        query: 'SELECT * FROM processes where pid={{process.not-existing}};',
        id: 'process_wrong_params',
        ...defualtQueryParams,
      },
      {
        query: 'SELECT * FROM processes;',
        id: 'process_no_params',
        ...defualtQueryParams,
      },
    ],
    agent_ids: ['929be3ee-13ee-4219-bcc2-5aa1593e8193'],
    alert_ids: ['72ae3004b99b747e26c81ae7e4bd978677ec5973234674fef6e4993fa54c9acc'],
  };
  const mockedSingleQueryParams = {
    query: 'SELECT * FROM processes where pid={{process.pid}};',
    interval: 3600,
    id: 'process_with_params',
    platform: 'linux',
  };

  // Info: getting queries by index (eg. [1], [0]) because can't compare whole query object due to unique action_id generated.
  describe('dynamic', () => {
    const pid = 123;
    it('alertData, multi queries, should replace queries and show errors', async () => {
      const queries = await createDynamicQueries({
        params: mockedQueriesParams,
        agents: [TEST_AGENT],
        alertData: {
          process: {
            pid,
          },
        } as unknown as ParsedTechnicalFields & { _index: string },
        osqueryContext: {} as OsqueryAppContext,
        spaceId,
        spaceScopedClient: mockSavedObjectsClient,
      });
      expect(queries[0].query).toBe(`SELECT * FROM processes where pid=${pid};`);
      expect(queries[0].error).toBe(undefined);
      expect(queries[1].query).toBe('SELECT * FROM processes where pid={{process.not-existing}};');
      expect(queries[1].error).toBe(PARAMETER_NOT_FOUND);
      expect(queries[2].query).toBe('SELECT * FROM processes;');
      expect(queries[2].error).toBe(undefined);
    });

    it('alertData, single query, existing param should return changed query', async () => {
      const queries = await createDynamicQueries({
        params: mockedSingleQueryParams,
        agents: [TEST_AGENT],
        alertData: {
          process: { pid },
        } as unknown as ParsedTechnicalFields & { _index: string },
        osqueryContext: {} as OsqueryAppContext,
        spaceId,
        spaceScopedClient: mockSavedObjectsClient,
      });
      expect(queries[0].query).toBe(`SELECT * FROM processes where pid=${pid};`);
      expect(queries[0].error).toBe(undefined);
    });
    it('alertData, single query, not existing param should return error', async () => {
      const queries = await createDynamicQueries({
        params: mockedSingleQueryParams,
        agents: [TEST_AGENT],
        alertData: {
          process: {},
        } as unknown as ParsedTechnicalFields & { _index: string },
        osqueryContext: {} as OsqueryAppContext,
        spaceId,
        spaceScopedClient: mockSavedObjectsClient,
      });
      expect(queries[0].query).toBe('SELECT * FROM processes where pid={{process.pid}};');
      expect(queries[0].error).toBe(PARAMETER_NOT_FOUND);
    });
    it('no alert data, multi query, return unchanged queries no error', async () => {
      const queries = await createDynamicQueries({
        params: mockedQueriesParams,
        agents: [TEST_AGENT],
        osqueryContext: {} as OsqueryAppContext,
        spaceId,
        spaceScopedClient: mockSavedObjectsClient,
      });
      expect(queries[0].query).toBe('SELECT * FROM processes where pid={{process.pid}};');
      expect(queries[0].agents).toContain(TEST_AGENT);
      expect(queries[0].error).toBe(undefined);
      expect(queries[2].query).toBe('SELECT * FROM processes;');
      expect(queries[2].agents).toContain(TEST_AGENT);
      expect(queries[2].error).toBe(undefined);
    });

    it('no alert data, single query, return unchanged query and no error', async () => {
      const queries = await createDynamicQueries({
        params: mockedSingleQueryParams,
        agents: [TEST_AGENT],
        osqueryContext: {} as OsqueryAppContext,
        spaceId,
        spaceScopedClient: mockSavedObjectsClient,
      });
      expect(queries[0].query).toBe('SELECT * FROM processes where pid={{process.pid}};');
      expect(queries[0].agents).toContain(TEST_AGENT);
      expect(queries[0].error).toBe(undefined);
    });

    it('derives query and ecs_mapping from the saved query when the caller omitted them', async () => {
      const get = jest.fn().mockResolvedValue({
        attributes: {
          query: 'select 1;',
          ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
        },
      });

      const queries = await createDynamicQueries({
        params: { saved_query_id: 'sq-1', agent_ids: [TEST_AGENT] },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
      });

      expect(get).toHaveBeenCalledWith(savedQuerySavedObjectType, 'sq-1');
      expect(queries[0].query).toBe('select 1;');
      expect(queries[0].ecs_mapping).toEqual({ 'host.name': { field: 'name' } });
    });

    it('dispatches the stored ecs_mapping when the caller sent an empty one', async () => {
      // The rule-action form defaults `ecs_mapping` to `{}`, so an empty caller mapping must not
      // shadow the saved query's own — otherwise a stored mapping never reaches the agent from a
      // rule. This is also what stops `{}` being a way to strip the stored mapping, now that
      // authz treats an empty mapping as asserting nothing.
      const get = jest.fn().mockResolvedValue({
        attributes: {
          query: 'select 1;',
          ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
        },
      });

      const queries = await createDynamicQueries({
        params: { saved_query_id: 'sq-1', ecs_mapping: {}, agent_ids: [TEST_AGENT] },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
        useStoredQuery: true,
      });

      expect(queries[0].ecs_mapping).toEqual({ 'host.name': { field: 'name' } });
    });

    it('prefers the stored ecs_mapping over a caller mapping when stored SQL is dispatched', async () => {
      // A mapping describes how that query's columns map to ECS, so stored SQL paired with an
      // unrelated caller mapping would yield mis-shaped results.
      const get = jest.fn().mockResolvedValue({
        attributes: {
          query: 'select 1;',
          ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
        },
      });

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          ecs_mapping: { 'process.name': { field: 'name' } },
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
        useStoredQuery: true,
      });

      expect(queries[0].ecs_mapping).toEqual({ 'host.name': { field: 'name' } });
    });

    it('keeps the caller ecs_mapping for ad-hoc dispatch', async () => {
      // `writeLiveQueries` running its own SQL is entitled to its own mapping.
      const get = jest.fn().mockResolvedValue({
        attributes: {
          query: 'select 1;',
          ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
        },
      });

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          query: 'select 42 as custom;',
          ecs_mapping: { 'process.name': { field: 'name' } },
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
      });

      expect(queries[0].query).toBe('select 42 as custom;');
      expect(queries[0].ecs_mapping).toEqual({ 'process.name': { field: 'name' } });
    });

    it('dispatches stored SQL when useStoredQuery is set, even if the caller supplied a query', async () => {
      const get = jest.fn().mockResolvedValue({
        attributes: { query: 'select 1;' },
      });

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          query: 'select 42 as custom;',
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
        useStoredQuery: true,
      });

      expect(queries[0].query).toBe('select 1;');
    });

    it('flags a parameterized stored query dispatched without alert context', async () => {
      const get = jest.fn().mockResolvedValue({
        attributes: { query: 'SELECT * FROM processes where pid={{process.pid}};' },
      });

      // Rule-run decides fan-out from the rule's persisted params, but dispatches the current
      // stored SQL. A saved query that gained parameters therefore arrives with no alertData.
      const queries = await createDynamicQueries({
        params: { saved_query_id: 'sq-1', agent_ids: [TEST_AGENT] },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
        useStoredQuery: true,
      });

      // Flagged rather than dispatched: create_action_handler drops errored queries from
      // fleetActions, so the agent never receives a literal `{{...}}` template.
      expect(queries[0].error).toBe(PARAMETER_NOT_FOUND);
    });

    it('keeps caller SQL when useStoredQuery is not set', async () => {
      const get = jest.fn().mockResolvedValue({
        attributes: { query: 'select 1;' },
      });

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          query: 'select 42 as custom;',
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
      });

      expect(queries[0].query).toBe('select 42 as custom;');
    });

    it('trims the saved query id before lookup', async () => {
      const get = jest.fn().mockResolvedValue({
        attributes: { query: 'select 1;' },
      });

      await createDynamicQueries({
        params: { saved_query_id: '  sq-1  ', agent_ids: [TEST_AGENT] },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
      });

      expect(get).toHaveBeenCalledWith(savedQuerySavedObjectType, 'sq-1');
    });

    it('propagates non-404 saved object errors', async () => {
      const get = jest.fn().mockRejectedValue(new Error('elasticsearch unavailable'));

      await expect(
        createDynamicQueries({
          params: { saved_query_id: 'sq-1', agent_ids: [TEST_AGENT] },
          agents: [TEST_AGENT],
          osqueryContext: {
            service: { getPackageService: jest.fn().mockReturnValue(undefined) },
          } as unknown as OsqueryAppContext,
          spaceId,
          spaceScopedClient: soClientWithGet(get),
        })
      ).rejects.toThrow('elasticsearch unavailable');
    });

    it('falls back when the saved query 404s', async () => {
      const get = jest
        .fn()
        .mockRejectedValue(
          SavedObjectsErrorHelpers.createGenericNotFoundError(savedQuerySavedObjectType, 'sq-1')
        );

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          query: 'select 1;',
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
      });

      expect(queries[0].query).toBe('select 1;');
    });

    it('fails closed when useStoredQuery is set and the saved query 404s', async () => {
      const get = jest
        .fn()
        .mockRejectedValue(
          SavedObjectsErrorHelpers.createGenericNotFoundError(savedQuerySavedObjectType, 'sq-1')
        );

      await expect(
        createDynamicQueries({
          params: {
            saved_query_id: 'sq-1',
            query: 'select 42 as custom;',
            agent_ids: [TEST_AGENT],
          },
          agents: [TEST_AGENT],
          osqueryContext: {
            service: { getPackageService: jest.fn().mockReturnValue(undefined) },
          } as unknown as OsqueryAppContext,
          spaceId,
          spaceScopedClient: soClientWithGet(get),
          useStoredQuery: true,
        })
      ).rejects.toThrow('could not be resolved');
    });

    it('resolves a saved query by attributes.id when it differs from the SO id', async () => {
      const find = jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: 'so-uuid-1',
            attributes: {
              id: 'sq-1',
              query: 'select 1;',
              ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
            },
          },
        ],
        total: 1,
      });
      const get = jest.fn();

      const queries = await createDynamicQueries({
        params: { saved_query_id: 'sq-1', agent_ids: [TEST_AGENT] },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: { find, get } as unknown as SavedObjectsClient,
      });

      expect(get).not.toHaveBeenCalled();
      expect(queries[0].query).toBe('select 1;');
      expect(queries[0].ecs_mapping).toEqual({ 'host.name': { field: 'name' } });
    });

    it('records an error on the action instead of throwing when reportErrorsOnAction is set', async () => {
      // Rule runs have no caller to receive a status code — `osqueryResponseAction` swallows a
      // throw and the run still reports success. The failure has to land on the action document.
      const get = jest
        .fn()
        .mockRejectedValue(
          SavedObjectsErrorHelpers.createGenericNotFoundError(savedQuerySavedObjectType, 'sq-1')
        );

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          query: 'select 42 as custom;',
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
        useStoredQuery: true,
        reportErrorsOnAction: true,
      });

      expect(queries).toHaveLength(1);
      expect(queries[0].error).toBe(SAVED_QUERY_NOT_FOUND);
      // The caller's own SQL must not be dispatched as a fallback.
      expect(queries[0].query).toBeUndefined();
    });

    it('ignores caller queries[] when useStoredQuery is set with a saved_query_id', async () => {
      const get = jest.fn().mockResolvedValue({
        id: 'sq-1',
        attributes: { query: 'select 1;' },
      });

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          queries: [
            {
              query: 'select 42 as custom;',
              id: 'x',
              ...defualtQueryParams,
            },
          ],
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
          logFactory: { get: jest.fn().mockReturnValue({ warn: jest.fn() }) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: soClientWithGet(get),
        useStoredQuery: true,
      });

      expect(queries).toHaveLength(1);
      expect(queries[0].query).toBe('select 1;');
    });

    it('uses the authz-resolved saved query and does not look it up again', async () => {
      const get = jest.fn();
      const client = soClientWithGet(get);

      const queries = await createDynamicQueries({
        params: {
          saved_query_id: 'sq-1',
          query: 'select 42 as custom;',
          agent_ids: [TEST_AGENT],
        },
        agents: [TEST_AGENT],
        osqueryContext: {
          service: { getPackageService: jest.fn().mockReturnValue(undefined) },
        } as unknown as OsqueryAppContext,
        spaceId,
        spaceScopedClient: client,
        useStoredQuery: true,
        storedQuery: { savedObjectId: 'so-uuid-1', query: 'select 1;' },
      });

      expect(get).not.toHaveBeenCalled();
      expect(client.find).not.toHaveBeenCalled();
      expect(queries[0].query).toBe('select 1;');
    });
  });
});
