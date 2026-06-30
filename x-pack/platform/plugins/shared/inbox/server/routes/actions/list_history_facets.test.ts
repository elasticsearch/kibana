/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock, httpServerMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import {
  API_VERSIONS,
  INBOX_ACTIONS_HISTORY_FACETS_URL,
  INTERNAL_API_ACCESS,
  ListInboxActionsHistoryFacetsRequestQuery,
  ListInboxActionsHistoryFacetsResponse,
  type ListInboxActionsHistoryFacetsRequestQueryInput,
} from '@kbn/inbox-common';
import { registerListInboxActionsHistoryFacetsRoute } from './list_history_facets';
import { InboxActionRegistry } from '../../services/inbox_action_registry';
import type {
  InboxActionProvider,
  InboxActionProviderFacetsResult,
} from '../../services/inbox_action_provider';
import { INBOX_API_PRIVILEGE_READ } from '../../../common';

const getSpaceId = () => 'default';

type Router = ReturnType<typeof httpServiceMock.createRouter>;

const fakeProviderWithFacets = (
  sourceApp: string,
  facets: InboxActionProviderFacetsResult
): InboxActionProvider => ({
  sourceApp,
  list: jest.fn(async () => ({ actions: [], total: 0 })),
  listProcessed: jest.fn(async () => ({ actions: [], total: 0 })),
  listProcessedFacets: jest.fn(async () => facets),
  respond: jest.fn(async () => {}),
});

const getHandler = (router: Router) => {
  const route = router.versioned.getRoute('get', INBOX_ACTIONS_HISTORY_FACETS_URL);
  const version = route.versions[API_VERSIONS.internal.v1];
  if (!version) {
    throw new Error(
      `No version '${API_VERSIONS.internal.v1}' registered for ${INBOX_ACTIONS_HISTORY_FACETS_URL}`
    );
  }
  return version.handler;
};

const invokeHandler = async (
  router: Router,
  query: ListInboxActionsHistoryFacetsRequestQueryInput = {}
) => {
  const handler = getHandler(router);
  const parsedQuery = ListInboxActionsHistoryFacetsRequestQuery.parse(query);
  const request = httpServerMock.createKibanaRequest({
    method: 'get',
    path: INBOX_ACTIONS_HISTORY_FACETS_URL,
    query: parsedQuery,
  });
  const response = httpServerMock.createResponseFactory();
  await handler({} as never, request, response);
  return response;
};

const getOkBody = (response: ReturnType<typeof httpServerMock.createResponseFactory>) => {
  const [[{ body }]] = response.ok.mock.calls as unknown as [
    [{ body: ListInboxActionsHistoryFacetsResponse }]
  ];
  return body;
};

describe('GET /internal/inbox/actions/history/facets', () => {
  let router: Router;
  let logger: ReturnType<typeof loggerMock.create>;
  let registry: InboxActionRegistry;

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    logger = loggerMock.create();
    registry = new InboxActionRegistry(logger);
    registerListInboxActionsHistoryFacetsRoute({ router, logger, registry, getSpaceId });
  });

  describe('route registration', () => {
    it('registers a single versioned internal route at INBOX_ACTIONS_HISTORY_FACETS_URL', () => {
      expect(router.versioned.get).toHaveBeenCalledTimes(1);
      const [config] = router.versioned.get.mock.calls[0];
      expect(config).toMatchObject({
        path: INBOX_ACTIONS_HISTORY_FACETS_URL,
        access: INTERNAL_API_ACCESS,
        // Same read-only gate as the history listing it feeds.
        security: { authz: { requiredPrivileges: [INBOX_API_PRIVILEGE_READ] } },
      });
    });

    it('registers the handler under the v1 internal API version', () => {
      expect(() => getHandler(router)).not.toThrow();
    });
  });

  describe('with no providers registered', () => {
    it('returns empty bucket arrays for both dimensions', async () => {
      const body = getOkBody(await invokeHandler(router));
      expect(body).toEqual({ channel: [], respondedBy: [] });
    });
  });

  describe('with a provider that supports facets', () => {
    beforeEach(() => {
      registry.register(
        fakeProviderWithFacets('workflows', {
          channel: [
            { value: 'inbox', count: 5 },
            { value: 'slack', count: 2 },
          ],
          respondedBy: [{ value: 'alice', count: 7 }],
        })
      );
    });

    it('returns buckets shaped per ListInboxActionsHistoryFacetsResponse', async () => {
      const body = getOkBody(await invokeHandler(router));
      expect(() => ListInboxActionsHistoryFacetsResponse.parse(body)).not.toThrow();
      expect(body).toEqual({
        channel: [
          { value: 'inbox', count: 5 },
          { value: 'slack', count: 2 },
        ],
        respondedBy: [{ value: 'alice', count: 7 }],
      });
    });

    it('forwards source_app to the registry fan-out', async () => {
      const spy = jest.spyOn(registry, 'listFacets');
      await invokeHandler(router, { source_app: 'workflows' });
      expect(spy).toHaveBeenCalledWith(
        { sourceApp: 'workflows' },
        expect.objectContaining({ spaceId: 'default' })
      );
    });
  });

  describe('with a provider that does not implement listProcessedFacets', () => {
    it('returns empty buckets without failing the request', async () => {
      const legacy: InboxActionProvider = {
        sourceApp: 'legacy',
        list: jest.fn(async () => ({ actions: [], total: 0 })),
        respond: jest.fn(async () => {}),
      };
      registry.register(legacy);

      const body = getOkBody(await invokeHandler(router));
      expect(body).toEqual({ channel: [], respondedBy: [] });
    });
  });

  describe('error handling', () => {
    it('returns a 500 when the registry throws unexpectedly', async () => {
      const registryThatThrows = new InboxActionRegistry(logger);
      jest.spyOn(registryThatThrows, 'listFacets').mockRejectedValueOnce(new Error('boom'));

      const dedicatedRouter = httpServiceMock.createRouter();
      registerListInboxActionsHistoryFacetsRoute({
        router: dedicatedRouter,
        logger,
        registry: registryThatThrows,
        getSpaceId,
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: INBOX_ACTIONS_HISTORY_FACETS_URL,
        query: ListInboxActionsHistoryFacetsRequestQuery.parse({}),
      });
      const response = httpServerMock.createResponseFactory();
      const handler = dedicatedRouter.versioned.getRoute('get', INBOX_ACTIONS_HISTORY_FACETS_URL)
        .versions[API_VERSIONS.internal.v1].handler;
      await handler({} as never, request, response);

      expect(response.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
    });
  });
});
