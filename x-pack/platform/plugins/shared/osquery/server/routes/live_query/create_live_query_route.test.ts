/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { CoreStart, RequestHandler } from '@kbn/core/server';
import { escapeQuotes } from '@kbn/es-query';
import { API_VERSIONS } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { createLiveQueryRoute } from './create_live_query_route';
import { createActionHandler } from '../../handlers';
import { packSavedObjectType, savedQuerySavedObjectType } from '../../../common/types';

jest.mock('../../handlers', () => ({
  createActionHandler: jest.fn(),
}));

jest.mock('../../lib/get_user_info', () => ({
  getUserInfo: jest.fn().mockResolvedValue({ username: 'test-user' }),
}));

const mockedCreateActionHandler = createActionHandler as jest.MockedFunction<
  typeof createActionHandler
>;

const SAVED_QUERY_ID = 'real-saved-query';
const SAVED_QUERY_SO_ID = 'so-uuid-1';
const STORED_QUERY = 'select 1;';

const attributesIdFilter = (id: string) =>
  `${savedQuerySavedObjectType}.attributes.id: "${escapeQuotes(id)}"`;

describe('createLiveQueryRoute', () => {
  const createMockRouter = () => {
    const httpService = httpServiceMock.createSetupContract();

    return httpService.createRouter();
  };

  const createMockCoreStart = (
    savedObjects: Record<
      string,
      { id?: string; query?: string; queries?: Array<{ query: string }> }
    > = {},
    capabilities: { writeLiveQueries?: boolean; runSavedQueries?: boolean } = {}
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
        resolveCapabilities: jest.fn().mockResolvedValue({
          osquery: {
            writeLiveQueries: capabilities.writeLiveQueries ?? false,
            runSavedQueries: capabilities.runSavedQueries ?? true,
          },
        }),
      },
      savedObjects: {
        getScopedClient: jest.fn().mockReturnValue({ get, find, resolve }),
      },
    } as unknown as CoreStart;
  };

  const createOsqueryContext = ({
    coreStart,
    racGet,
  }: {
    coreStart: CoreStart;
    racGet?: jest.Mock;
  }): OsqueryAppContext =>
    ({
      getStartServices: jest.fn().mockResolvedValue([coreStart, { security: {} }]),
      service: {
        getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
        getRuleRegistryService: jest.fn().mockReturnValue({
          getRacClientWithRequest: jest.fn().mockResolvedValue({
            get: racGet ?? jest.fn(),
          }),
        }),
      },
      logFactory: { get: jest.fn().mockReturnValue({ debug: jest.fn() }) },
    } as unknown as OsqueryAppContext);

  const getRouteHandler = (mockRouter: ReturnType<typeof createMockRouter>): RequestHandler => {
    const route = mockRouter.versioned.getRoute('post', '/api/osquery/live_queries');
    const routeVersion = route.versions[API_VERSIONS.public.v1];
    if (!routeVersion) {
      throw new Error(`Handler for version [${API_VERSIONS.public.v1}] not found!`);
    }

    return routeVersion.handler;
  };

  const invokeRoute = async (
    body: Record<string, unknown>,
    {
      coreStart,
      racGet,
    }: {
      coreStart?: CoreStart;
      racGet?: jest.Mock;
    } = {}
  ) => {
    const start = coreStart ?? createMockCoreStart({ [SAVED_QUERY_ID]: { query: STORED_QUERY } });
    const mockRouter = createMockRouter();
    createLiveQueryRoute(mockRouter, createOsqueryContext({ coreStart: start, racGet }));

    const mockRequest = httpServerMock.createKibanaRequest({ body });
    const mockResponse = httpServerMock.createResponseFactory();

    await getRouteHandler(mockRouter)({} as never, mockRequest, mockResponse);

    return mockResponse;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateActionHandler.mockResolvedValue({
      response: { action_id: 'action-1' },
      fleetActionsCount: 1,
    } as Awaited<ReturnType<typeof createActionHandler>>);
  });

  it('returns 403 for a saved_query_id that does not resolve', async () => {
    const response = await invokeRoute({
      saved_query_id: 'does-not-exist',
      query: 'select 42 as custom;',
      agent_ids: ['agent-1'],
    });

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
  });

  it('returns 403 for a whitespace-only saved_query_id', async () => {
    const response = await invokeRoute({
      saved_query_id: ' ',
      query: 'SELECT * FROM os_version',
      agent_ids: ['agent-1'],
    });

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
  });

  it('returns 403 when a queries array is supplied with a saved query id', async () => {
    const response = await invokeRoute({
      saved_query_id: SAVED_QUERY_ID,
      queries: [{ id: 'x', query: 'select 42 as custom;' }],
      agent_ids: ['agent-1'],
    });

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
  });

  it('authorizes a pack_id when queries[] is also supplied', async () => {
    const packId = 'real-pack';
    const coreStart = createMockCoreStart({
      [packId]: { queries: [{ query: 'select * from processes;' }] },
    });

    await invokeRoute(
      {
        pack_id: packId,
        queries: [{ id: 'x', query: 'select * from processes;' }],
        agent_ids: ['agent-1'],
      },
      { coreStart }
    );

    expect(mockedCreateActionHandler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pack_id: packId }),
      expect.objectContaining({ useStoredQuery: true })
    );
  });

  it('returns 403 rather than 500 for a pack_id that does not resolve', async () => {
    const coreStart = createMockCoreStart();
    const response = await invokeRoute(
      { pack_id: 'does-not-exist', query: 'select 42 as custom;', agent_ids: ['agent-1'] },
      { coreStart }
    );

    expect(response.forbidden).toHaveBeenCalled();
    expect(response.customError).not.toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();

    const soClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0].value;
    expect(soClient.get).toHaveBeenCalledWith(packSavedObjectType, 'does-not-exist');
  });

  it('returns 403 when an alert is readable but has no investigation guide', async () => {
    const racGet = jest.fn().mockResolvedValue({
      _index: '.alerts-security.alerts-default',
      'kibana.alert.rule.uuid': 'rule-1',
    });

    const response = await invokeRoute(
      {
        query: 'select 42 as custom;',
        alert_ids: ['readable-alert-without-note'],
        agent_ids: ['agent-1'],
      },
      { racGet }
    );

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
    expect(racGet).toHaveBeenCalledWith({ id: 'readable-alert-without-note' });
  });

  it('returns 403 rather than 500 when the alert cannot be resolved', async () => {
    const racGet = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('Not Found'), { statusCode: 404 }));

    const response = await invokeRoute(
      {
        query: 'select 42 as custom;',
        alert_ids: ['missing-alert'],
        agent_ids: ['agent-1'],
      },
      { racGet }
    );

    expect(response.forbidden).toHaveBeenCalled();
    expect(response.customError).not.toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
  });

  it('looks the saved query up as the expected saved object type', async () => {
    const coreStart = createMockCoreStart({ [SAVED_QUERY_ID]: { query: STORED_QUERY } });

    await invokeRoute({ saved_query_id: SAVED_QUERY_ID, agent_ids: ['agent-1'] }, { coreStart });

    const soClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0].value;
    expect(soClient.find).toHaveBeenCalledWith(
      expect.objectContaining({ type: savedQuerySavedObjectType })
    );
    expect(soClient.resolve).toHaveBeenCalledWith(savedQuerySavedObjectType, SAVED_QUERY_ID);
    expect(mockedCreateActionHandler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ saved_query_id: SAVED_QUERY_ID }),
      expect.objectContaining({
        useStoredQuery: true,
        storedQuery: expect.objectContaining({ query: STORED_QUERY }),
      })
    );
  });

  it('resolves a saved_query_id that matches attributes.id rather than the SO id', async () => {
    const coreStart = createMockCoreStart({
      [SAVED_QUERY_SO_ID]: { id: SAVED_QUERY_ID, query: STORED_QUERY },
    });

    await invokeRoute({ saved_query_id: SAVED_QUERY_ID, agent_ids: ['agent-1'] }, { coreStart });

    const soClient = (coreStart.savedObjects.getScopedClient as jest.Mock).mock.results[0].value;
    expect(soClient.get).not.toHaveBeenCalled();
    expect(mockedCreateActionHandler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ saved_query_id: SAVED_QUERY_ID }),
      expect.objectContaining({ useStoredQuery: true })
    );
  });

  it('authorizes a substituted query using alert data fetched before authz', async () => {
    const coreStart = createMockCoreStart({
      [SAVED_QUERY_ID]: { query: "select * from os_version where name='{{host.os.name}}';" },
    });
    const racGet = jest.fn().mockResolvedValue({
      _index: '.alerts-security.alerts-default',
      host: { os: { name: 'Ubuntu' } },
    });

    await invokeRoute(
      {
        saved_query_id: SAVED_QUERY_ID,
        query: "select * from os_version where name='Ubuntu';",
        alert_ids: ['alert-1'],
        agent_ids: ['agent-1'],
      },
      { coreStart, racGet }
    );

    expect(racGet).toHaveBeenCalledWith({ id: 'alert-1' });
    expect(mockedCreateActionHandler).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ useStoredQuery: true })
    );
  });

  it('returns 403 when caller SQL does not match the stored saved query', async () => {
    const response = await invokeRoute({
      saved_query_id: SAVED_QUERY_ID,
      query: 'select 42 as custom;',
      agent_ids: ['agent-1'],
    });

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
  });

  it('still sets useStoredQuery when the caller posted matching SQL', async () => {
    await invokeRoute({
      saved_query_id: SAVED_QUERY_ID,
      query: STORED_QUERY,
      agent_ids: ['agent-1'],
    });

    expect(mockedCreateActionHandler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ query: STORED_QUERY, saved_query_id: SAVED_QUERY_ID }),
      expect.objectContaining({ useStoredQuery: true })
    );
  });

  it('returns 403 for an investigation-guide query when the caller lacks runSavedQueries', async () => {
    const coreStart = createMockCoreStart({}, { writeLiveQueries: false, runSavedQueries: false });
    const racGet = jest.fn().mockResolvedValue({
      _index: '.alerts-security.alerts-default',
      'kibana.alert.rule.note': '!{osquery{"query":"select 1;","ecs_mapping":{}}}',
    });

    const response = await invokeRoute(
      { query: 'select 1;', alert_ids: ['alert-with-guide'], agent_ids: ['agent-1'] },
      { coreStart, racGet }
    );

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
  });

  it('allows an investigation-guide query when the caller has runSavedQueries', async () => {
    const coreStart = createMockCoreStart({}, { writeLiveQueries: false, runSavedQueries: true });
    const racGet = jest.fn().mockResolvedValue({
      _index: '.alerts-security.alerts-default',
      'kibana.alert.rule.note': '!{osquery{"query":"select 1;","ecs_mapping":{}}}',
    });

    await invokeRoute(
      { query: 'select 1;', alert_ids: ['alert-with-guide'], agent_ids: ['agent-1'] },
      { coreStart, racGet }
    );

    expect(mockedCreateActionHandler).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ useStoredQuery: false })
    );
  });

  it('returns 403 when a guide-matching query smuggles a rogue queries[] alongside it', async () => {
    const coreStart = createMockCoreStart({}, { writeLiveQueries: false, runSavedQueries: true });
    const racGet = jest.fn().mockResolvedValue({
      _index: '.alerts-security.alerts-default',
      'kibana.alert.rule.note': '!{osquery{"query":"select 1;","ecs_mapping":{}}}',
    });

    const response = await invokeRoute(
      {
        // `query` matches the investigation guide, so recovery would otherwise pass...
        query: 'select 1;',
        // ...but createDynamicQueries prefers queries[], which the guide never vouched for.
        queries: [{ id: 'x', query: 'select * from shadow;' }],
        alert_ids: ['alert-with-guide'],
        agent_ids: ['agent-1'],
      },
      { coreStart, racGet }
    );

    expect(response.forbidden).toHaveBeenCalled();
    expect(mockedCreateActionHandler).not.toHaveBeenCalled();
  });
});
