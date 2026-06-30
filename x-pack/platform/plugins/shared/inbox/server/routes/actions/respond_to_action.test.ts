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
  INBOX_ACTION_RESPOND_URL_TEMPLATE,
  INTERNAL_API_ACCESS,
  buildRespondToActionUrl,
} from '@kbn/inbox-common';
import { registerRespondToActionRoute } from './respond_to_action';
import {
  createInvalidInboxActionSourceIdError,
  createInboxActionConflictError,
  InboxActionRegistry,
} from '../../services/inbox_action_registry';
import type { InboxActionProvider } from '../../services/inbox_action_provider';
import { INBOX_API_PRIVILEGE_RESPOND } from '../../../common';

const getSpaceId = () => 'default';

type Router = ReturnType<typeof httpServiceMock.createRouter>;

const fakeProvider = (sourceApp: string): jest.Mocked<InboxActionProvider> => ({
  sourceApp,
  list: jest.fn<ReturnType<InboxActionProvider['list']>, Parameters<InboxActionProvider['list']>>(
    async () => ({ actions: [], total: 0 })
  ),
  respond: jest.fn<
    ReturnType<InboxActionProvider['respond']>,
    Parameters<InboxActionProvider['respond']>
  >(async () => {}),
});

const invokeHandler = async (
  router: Router,
  sourceApp: string,
  sourceId: string,
  input: Record<string, unknown>,
  body: Record<string, unknown> = {}
) => {
  const route = router.versioned.getRoute('post', INBOX_ACTION_RESPOND_URL_TEMPLATE);
  const handler = route.versions[API_VERSIONS.internal.v1].handler;
  const request = httpServerMock.createKibanaRequest({
    method: 'post',
    path: buildRespondToActionUrl(sourceApp, sourceId),
    params: { source_app: sourceApp, source_id: sourceId },
    body: { input, ...body },
  });
  const response = httpServerMock.createResponseFactory();
  await handler({} as never, request, response);
  return response;
};

describe('POST /internal/inbox/actions/{source_app}/{source_id}/respond', () => {
  let router: Router;
  let logger: ReturnType<typeof loggerMock.create>;
  let registry: InboxActionRegistry;

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    logger = loggerMock.create();
    registry = new InboxActionRegistry(logger);
    registerRespondToActionRoute({ router, logger, registry, getSpaceId });
  });

  describe('route registration', () => {
    it('registers a single versioned internal POST route', () => {
      expect(router.versioned.post).toHaveBeenCalledTimes(1);
      const [config] = router.versioned.post.mock.calls[0];
      expect(config).toMatchObject({
        path: INBOX_ACTION_RESPOND_URL_TEMPLATE,
        access: INTERNAL_API_ACCESS,
        // The respond route is a mutation and must require the stricter
        // `inbox_respond` privilege — not the shared `inbox` privilege,
        // which would also be granted to read-only users.
        security: { authz: { requiredPrivileges: [INBOX_API_PRIVILEGE_RESPOND] } },
      });
    });
  });

  describe('dispatch', () => {
    it('forwards source_id and input to the matching provider', async () => {
      const workflows = fakeProvider('workflows');
      registry.register(workflows);

      const response = await invokeHandler(router, 'workflows', 'exec-123', {
        approved: true,
      });

      expect(workflows.respond).toHaveBeenCalledWith(
        'exec-123',
        { approved: true },
        expect.objectContaining({ spaceId: 'default' })
      );
      expect(response.ok).toHaveBeenCalledWith({ body: { ok: true } });
    });

    it('returns 404 when no provider is registered for source_app', async () => {
      const response = await invokeHandler(router, 'workflows', 'exec-123', {});

      expect(response.notFound).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            message: expect.stringContaining('No inbox action provider'),
          }),
        })
      );
    });

    it('forwards the resolver-provided space id into the registry context', async () => {
      // Previously hardcoded to `'default'`; a user in a non-default space
      // would dispatch to providers with the wrong space and (for
      // workflows) try to resume a non-existent execution.
      const captured: string[] = [];
      const capturingProvider: InboxActionProvider = {
        sourceApp: 'workflows',
        list: jest.fn(async () => ({ actions: [], total: 0 })),
        respond: jest.fn(async (_sourceId, _input, ctx) => {
          captured.push(ctx.spaceId);
        }),
      };
      const dedicatedRouter = httpServiceMock.createRouter();
      const dedicatedRegistry = new InboxActionRegistry(logger);
      dedicatedRegistry.register(capturingProvider);
      registerRespondToActionRoute({
        router: dedicatedRouter,
        logger,
        registry: dedicatedRegistry,
        getSpaceId: () => 'security-team',
      });
      const route = dedicatedRouter.versioned.getRoute('post', INBOX_ACTION_RESPOND_URL_TEMPLATE);
      const handler = route.versions[API_VERSIONS.internal.v1].handler;
      await handler(
        {} as never,
        httpServerMock.createKibanaRequest({
          method: 'post',
          path: buildRespondToActionUrl('workflows', 'exec-1'),
          params: { source_app: 'workflows', source_id: 'exec-1' },
          body: { input: {} },
        }),
        httpServerMock.createResponseFactory()
      );
      expect(captured).toEqual(['security-team']);
    });

    it('returns 500 when the provider throws unexpectedly', async () => {
      const workflows = fakeProvider('workflows');
      workflows.respond.mockRejectedValueOnce(new Error('downstream exploded'));
      registry.register(workflows);

      const response = await invokeHandler(router, 'workflows', 'exec-123', {
        approved: true,
      });

      expect(response.customError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
    });

    it('defaults the dispatched channel to "inbox" when the request body omits it', async () => {
      // Preserves pre-existing audit semantics for the in-product
      // Kibana inbox UI (which submits `{ input }` only). Non-UI clients
      // — MCP, Slack, agent builder — opt in to a more specific channel
      // tag by including `channel` in the body. See INBOX_CHANNELS.
      const captured: Array<string | undefined> = [];
      const capturingProvider: InboxActionProvider = {
        sourceApp: 'workflows',
        list: jest.fn(async () => ({ actions: [], total: 0 })),
        respond: jest.fn(async (_sourceId, _input, ctx) => {
          captured.push(ctx.channel);
        }),
      };
      const localRouter = httpServiceMock.createRouter();
      const localRegistry = new InboxActionRegistry(logger);
      localRegistry.register(capturingProvider);
      registerRespondToActionRoute({
        router: localRouter,
        logger,
        registry: localRegistry,
        getSpaceId,
      });

      await invokeHandler(localRouter, 'workflows', 'exec-1', { approved: true });

      expect(captured).toEqual(['inbox']);
    });

    it('forwards an explicit channel from the request body', async () => {
      // Channel is a free-form slug (validated by the request-body
      // Zod regex), so MCP apps and other API clients can self-tag
      // with their own identifier — exercised here by the public
      // reference MCP app slug so we cover the realistic non-default
      // case end-to-end (Kibana inbox UI uses the route default; this
      // is the path everything else takes).
      const captured: Array<string | undefined> = [];
      const capturingProvider: InboxActionProvider = {
        sourceApp: 'workflows',
        list: jest.fn(async () => ({ actions: [], total: 0 })),
        respond: jest.fn(async (_sourceId, _input, ctx) => {
          captured.push(ctx.channel);
        }),
      };
      const localRouter = httpServiceMock.createRouter();
      const localRegistry = new InboxActionRegistry(logger);
      localRegistry.register(capturingProvider);
      registerRespondToActionRoute({
        router: localRouter,
        logger,
        registry: localRegistry,
        getSpaceId,
      });

      await invokeHandler(
        localRouter,
        'workflows',
        'exec-1',
        { approved: true },
        { channel: 'example-mcp-app-security' }
      );

      expect(captured).toEqual(['example-mcp-app-security']);
    });

    it('rejects a channel that violates the slug shape (invalid characters)', async () => {
      // The respond schema gates `channel` on
      // `^[a-z0-9][a-z0-9_-]*$` — uppercase, spaces, dots etc. are
      // rejected at request validation. This guards against responders
      // smuggling display text or HTML into the audit feed.
      const workflows = fakeProvider('workflows');
      registry.register(workflows);

      const route = router.versioned.getRoute('post', INBOX_ACTION_RESPOND_URL_TEMPLATE);
      const validation = route.versions[API_VERSIONS.internal.v1].config.validate;
      const bodyValidator = (
        validation as { request: { body: { validate: (b: unknown) => unknown } } }
      ).request.body;

      expect(() => bodyValidator.validate({ input: {}, channel: 'NOT a slug.' })).toThrow();
    });

    it('returns 409 Conflict when the provider throws InboxActionConflictError', async () => {
      // Providers throw this when an action is no longer responseable
      // — for the workflows provider, that happens when the targeted
      // step has already been advanced or claimed. Surfacing as 409
      // (rather than 500) lets clients refresh their inbox without
      // tripping generic error handling.
      const workflows = fakeProvider('workflows');
      workflows.respond.mockRejectedValueOnce(
        createInboxActionConflictError('workflows', 'wf:run:step', 'step is no longer waiting')
      );
      registry.register(workflows);

      const response = await invokeHandler(router, 'workflows', 'wf:run:step', {
        approved: true,
      });

      expect(response.conflict).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            message: expect.stringContaining('step is no longer waiting'),
          }),
        })
      );
      expect(response.customError).not.toHaveBeenCalled();
    });

    it('returns 400 Bad Request when the provider rejects a malformed source_id', async () => {
      const workflows = fakeProvider('workflows');
      workflows.respond.mockRejectedValueOnce(
        createInvalidInboxActionSourceIdError(
          'workflows',
          'invalid',
          'workflowId:workflowRunId:stepExecutionId'
        )
      );
      registry.register(workflows);

      const response = await invokeHandler(router, 'workflows', 'invalid', {});

      expect(response.badRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            message: expect.stringContaining('invalid source_id'),
          }),
        })
      );
      expect(response.customError).not.toHaveBeenCalled();
    });
  });
});
