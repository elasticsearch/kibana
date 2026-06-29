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
  INBOX_ACTIONS_HISTORY_URL,
  INTERNAL_API_ACCESS,
  ListInboxActionsHistoryRequestQuery,
  ListInboxActionsHistoryResponse,
  type InboxAction,
  type ListInboxActionsHistoryRequestQueryInput,
} from '@kbn/inbox-common';
import { registerListInboxActionsHistoryRoute } from './list_history';
import { InboxActionRegistry } from '../../services/inbox_action_registry';
import type { InboxActionProvider } from '../../services/inbox_action_provider';
import { createStubInboxAction } from '../../../common/test_helpers/create_stub_inbox_action';
import { INBOX_API_PRIVILEGE_READ } from '../../../common';

const getSpaceId = () => 'default';

type Router = ReturnType<typeof httpServiceMock.createRouter>;

const fakeProviderWithHistory = (
  sourceApp: string,
  history: InboxAction[]
): jest.Mocked<InboxActionProvider> => ({
  sourceApp,
  list: jest.fn<ReturnType<InboxActionProvider['list']>, Parameters<InboxActionProvider['list']>>(
    async () => ({ actions: [], total: 0 })
  ),
  listProcessed: jest.fn<
    ReturnType<NonNullable<InboxActionProvider['listProcessed']>>,
    Parameters<NonNullable<InboxActionProvider['listProcessed']>>
  >(async () => ({ actions: history, total: history.length })),
  respond: jest.fn<
    ReturnType<InboxActionProvider['respond']>,
    Parameters<InboxActionProvider['respond']>
  >(async () => {}),
});

const getHandler = (router: Router) => {
  const route = router.versioned.getRoute('get', INBOX_ACTIONS_HISTORY_URL);
  const version = route.versions[API_VERSIONS.internal.v1];
  if (!version) {
    throw new Error(
      `No version '${API_VERSIONS.internal.v1}' registered for ${INBOX_ACTIONS_HISTORY_URL}`
    );
  }
  return version.handler;
};

const invokeHandler = async (
  router: Router,
  query: ListInboxActionsHistoryRequestQueryInput = {}
) => {
  const handler = getHandler(router);
  const parsedQuery = ListInboxActionsHistoryRequestQuery.parse(query);
  const request = httpServerMock.createKibanaRequest({
    method: 'get',
    path: INBOX_ACTIONS_HISTORY_URL,
    query: parsedQuery,
  });
  const response = httpServerMock.createResponseFactory();
  await handler({} as never, request, response);
  return response;
};

const getOkBody = (response: ReturnType<typeof httpServerMock.createResponseFactory>) => {
  const [[{ body }]] = response.ok.mock.calls as unknown as [
    [{ body: ListInboxActionsHistoryResponse }]
  ];
  return body;
};

describe('GET /internal/inbox/actions/history', () => {
  let router: Router;
  let logger: ReturnType<typeof loggerMock.create>;
  let registry: InboxActionRegistry;

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    logger = loggerMock.create();
    registry = new InboxActionRegistry(logger);
    registerListInboxActionsHistoryRoute({ router, logger, registry, getSpaceId });
  });

  describe('route registration', () => {
    it('registers a single versioned internal route at INBOX_ACTIONS_HISTORY_URL', () => {
      expect(router.versioned.get).toHaveBeenCalledTimes(1);
      const [config] = router.versioned.get.mock.calls[0];
      expect(config).toMatchObject({
        path: INBOX_ACTIONS_HISTORY_URL,
        access: INTERNAL_API_ACCESS,
        // Read-only privilege so processed-action audit data follows the
        // same authorization gate as the pending listing.
        security: { authz: { requiredPrivileges: [INBOX_API_PRIVILEGE_READ] } },
      });
    });

    it('registers the handler under the v1 internal API version', () => {
      expect(() => getHandler(router)).not.toThrow();
    });
  });

  describe('with no providers registered', () => {
    it('returns an empty list and zero total', async () => {
      const body = getOkBody(await invokeHandler(router));
      expect(body).toEqual({ actions: [], total: 0 });
    });
  });

  describe('with a provider that supports history', () => {
    const historyA = createStubInboxAction({
      id: 'a',
      source_app: 'workflows',
      status: 'approved',
      created_at: '2026-04-24T09:00:00.000Z',
      responded_at: '2026-04-24T12:00:00.000Z',
      response_input: { approved: true },
    });
    const historyB = createStubInboxAction({
      id: 'b',
      source_app: 'workflows',
      status: 'approved',
      created_at: '2026-04-24T08:00:00.000Z',
      responded_at: '2026-04-24T10:00:00.000Z',
    });

    beforeEach(() => {
      registry.register(fakeProviderWithHistory('workflows', [historyA, historyB]));
    });

    it('returns history rows shaped per ListInboxActionsHistoryResponse', async () => {
      const body = getOkBody(await invokeHandler(router));
      expect(() => ListInboxActionsHistoryResponse.parse(body)).not.toThrow();
      expect(body.total).toBe(2);
    });

    it('orders rows by responded_at desc (audit-log feel)', async () => {
      const body = getOkBody(await invokeHandler(router));
      expect(body.actions.map((action) => action.id)).toEqual(['a', 'b']);
    });

    it('forwards source_app to the registry', async () => {
      const body = getOkBody(await invokeHandler(router, { source_app: 'workflows' }));
      expect(body.actions.every((action) => action.source_app === 'workflows')).toBe(true);
    });
  });

  describe('with a provider that does not implement listProcessed', () => {
    it('returns an empty result without invoking history fan-out', async () => {
      const legacy: InboxActionProvider = {
        sourceApp: 'legacy',
        list: jest.fn(async () => ({ actions: [], total: 0 })),
        respond: jest.fn(async () => {}),
      };
      registry.register(legacy);

      const body = getOkBody(await invokeHandler(router));
      expect(body).toEqual({ actions: [], total: 0 });
    });
  });

  describe('error handling', () => {
    it('returns a 500 when the registry throws unexpectedly', async () => {
      const registryThatThrows = new InboxActionRegistry(logger);
      jest.spyOn(registryThatThrows, 'listHistory').mockRejectedValueOnce(new Error('boom'));

      const dedicatedRouter = httpServiceMock.createRouter();
      registerListInboxActionsHistoryRoute({
        router: dedicatedRouter,
        logger,
        registry: registryThatThrows,
        getSpaceId,
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: INBOX_ACTIONS_HISTORY_URL,
        query: ListInboxActionsHistoryRequestQuery.parse({}),
      });
      const response = httpServerMock.createResponseFactory();
      const handler = dedicatedRouter.versioned.getRoute('get', INBOX_ACTIONS_HISTORY_URL).versions[
        API_VERSIONS.internal.v1
      ].handler;
      await handler({} as never, request, response);

      expect(response.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
    });
  });
});
