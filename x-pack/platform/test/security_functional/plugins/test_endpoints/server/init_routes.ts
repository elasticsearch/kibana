/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type DiagnosticResult, errors } from '@elastic/elasticsearch';

import { schema } from '@kbn/config-schema';
import type {
  CoreSetup,
  CoreStart,
  ElasticsearchClient,
  KibanaRequest,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { FakeRawRequest, Headers } from '@kbn/core-http-server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { ROUTE_TAG_AUTH_FLOW } from '@kbn/security-plugin/server';
import { restApiKeySchema } from '@kbn/security-plugin-types-server';
import {
  type BulkUpdateTaskResult,
  type ConcreteTaskInstance,
  getUiamApiKeySecret,
  type TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';

import type { PluginStartDependencies } from '.';

export const SESSION_INDEX_CLEANUP_TASK_NAME = 'session_cleanup';

export function initRoutes(
  initializerContext: PluginInitializerContext,
  core: CoreSetup<PluginStartDependencies>
) {
  const logger = initializerContext.logger.get();
  // Capture once — reading esClient.openPointInTime on disable would recapture the mock.
  let unpatchedOpenPointInTime: ElasticsearchClient['openPointInTime'] | undefined;

  const authenticationAppOptions = { simulateUnauthorized: false };
  core.http.resources.register(
    {
      path: '/authentication/app',
      validate: false,
      security: { authz: { enabled: false, reason: '' } },
    },
    async (context, request, response) => {
      if (authenticationAppOptions.simulateUnauthorized) {
        return response.unauthorized();
      }
      return response.renderCoreApp();
    }
  );

  const router = core.http.createRouter();

  const PREAUTH_HOLD_HEADER = 'x-elastic-preauth-hold';
  const PREAUTH_HOLD_ID_MAX_LENGTH = 64;
  const PREAUTH_HOLD_TIMEOUT_MS = 10_000;
  const PREAUTH_HOLD_PATH_PREFIX = '/authentication/preauth_holds';

  interface PreauthHoldSocketSnapshot {
    authorized: boolean | null;
    peerCertificateNull: boolean;
  }

  interface PreauthHoldState {
    parked: boolean;
    continuedAfterHold: boolean;
    authCompleted: boolean;
    // Sticky: set once the client cancels the request (HTTP/2 RST_STREAM). Unlike the socket
    // snapshot this is not re-read per poll, so it survives the stream going away.
    aborted: boolean;
    snapshotSocket: () => PreauthHoldSocketSnapshot;
    release: () => void;
  }

  const preauthHolds = new Map<string, PreauthHoldState>();

  const readHoldId = (value: string | string[] | undefined): string | undefined => {
    if (value === undefined) {
      return undefined;
    }
    const holdId = Array.isArray(value) ? value[0] : value;
    if (!holdId || holdId.length > PREAUTH_HOLD_ID_MAX_LENGTH) {
      return undefined;
    }
    return holdId;
  };

  const snapshotSocket = (request: KibanaRequest): PreauthHoldSocketSnapshot => ({
    authorized: request.socket.authorized ?? null,
    peerCertificateNull: request.socket.getPeerCertificate(true) === null,
  });

  // Park inside PKIAuthenticationProvider.authenticate, not onPreAuth.
  // Hapi's request cycle bails when `_isReplied` is set (see @hapi/hapi Request._lifecycle).
  // RST_STREAM during onPreAuth emits `aborted`, Hapi replies immediately, and Auth never runs —
  // so PKI never sees the destroyed-stream socket and the Scout test false-greens.
  // Wrapping the already-loaded provider keeps us inside the in-flight Auth cycle function after
  // session lookup, which is the window that invalidates the shared ES token (kibana#258232).
  const findPkiAuthenticationProvider = () => {
    for (const [moduleId, cached] of Object.entries(require.cache)) {
      const normalizedId = moduleId.replaceAll('\\', '/');
      if (normalizedId.includes('.test.')) {
        continue;
      }
      if (
        !normalizedId.endsWith('/authentication/providers/pki.ts') &&
        !normalizedId.endsWith('/authentication/providers/pki.js')
      ) {
        continue;
      }
      const providerClass = (
        cached?.exports as
          | {
              PKIAuthenticationProvider?: {
                prototype: {
                  authenticate: (request: KibanaRequest, session?: unknown) => Promise<unknown>;
                };
              };
            }
          | undefined
      )?.PKIAuthenticationProvider;
      if (typeof providerClass?.prototype.authenticate === 'function') {
        return providerClass;
      }
    }
    const pkiModules = Object.keys(require.cache)
      .filter((moduleId) => moduleId.includes('pki'))
      .join(', ');
    throw new Error(
      `security-test-endpoints could not locate PKIAuthenticationProvider to install the HTTP/2 preauth hold. pki modules in require.cache: ${
        pkiModules || '(none)'
      }`
    );
  };

  let pkiAuthenticateHoldInstalled = false;
  const installPkiAuthenticateHold = () => {
    if (pkiAuthenticateHoldInstalled) {
      return;
    }

    const pkiProviderClass = findPkiAuthenticationProvider();
    const originalPkiAuthenticate = pkiProviderClass.prototype.authenticate;
    pkiProviderClass.prototype.authenticate = async function wrappedPkiAuthenticate(
      this: unknown,
      request: KibanaRequest,
      session?: unknown
    ) {
      const holdId = readHoldId(request.headers[PREAUTH_HOLD_HEADER]);
      if (!holdId) {
        return originalPkiAuthenticate.call(this, request, session);
      }

      preauthHolds.get(holdId)?.release();

      const deferred: { resolve: () => void } = { resolve: () => undefined };
      const released = new Promise<void>((resolve) => {
        deferred.resolve = resolve;
      });

      const hold: PreauthHoldState = {
        parked: true,
        continuedAfterHold: false,
        authCompleted: false,
        aborted: false,
        snapshotSocket: () => snapshotSocket(request),
        release: () => deferred.resolve(),
      };
      preauthHolds.set(holdId, hold);

      // Subscribe before parking: `getEvents` only builds the observable, and the underlying
      // 'close' listener attaches on first subscribe. Under HTTP/2 this is how RST_STREAM
      // becomes observable server-side — the session socket itself is unaffected by a single
      // stream being destroyed, so it can no longer be used to detect the cancellation.
      const abortSubscription = request.events.aborted$.subscribe(() => {
        hold.aborted = true;
      });

      let timeoutId: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          released,
          new Promise<void>((resolve) => {
            timeoutId = setTimeout(resolve, PREAUTH_HOLD_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }

      hold.continuedAfterHold = true;
      try {
        return await originalPkiAuthenticate.call(this, request, session);
      } finally {
        hold.authCompleted = true;
        hold.parked = false;
        abortSubscription.unsubscribe();
        // Keep the completed hold around long enough for the test to observe `authCompleted`,
        // then evict so the map does not retain the request (and its socket) indefinitely.
        setTimeout(() => {
          if (preauthHolds.get(holdId) === hold) {
            preauthHolds.delete(holdId);
          }
        }, PREAUTH_HOLD_TIMEOUT_MS).unref();
      }
    };

    pkiAuthenticateHoldInstalled = true;
    logger.info('Installed PKI authenticate preauth hold for HTTP/2 stream-cancel tests.');
  };

  try {
    installPkiAuthenticateHold();
  } catch (err) {
    logger.warn(
      `PKI preauth hold was not installed during setup; will retry at start. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  void core
    .getStartServices()
    .then(() => installPkiAuthenticateHold())
    .catch((err) => {
      logger.error(
        `PKI preauth hold could not be installed at start; the preauth hold test routes will not function. ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    });

  const unauthenticatedTestRouteSecurity = {
    authc: {
      enabled: false as const,
      reason:
        'This route is part of a security functional test plugin and does not require authentication.',
    },
    authz: {
      enabled: false as const,
      reason: 'This route is opted out from authorization',
    },
  };

  const holdIdParams = {
    params: schema.object({
      id: schema.string({ minLength: 1, maxLength: PREAUTH_HOLD_ID_MAX_LENGTH }),
    }),
  };

  router.get(
    {
      path: `${PREAUTH_HOLD_PATH_PREFIX}/{id}`,
      security: unauthenticatedTestRouteSecurity,
      validate: holdIdParams,
    },
    (_context, request, response) => {
      const hold = preauthHolds.get(request.params.id);
      const socket = hold?.snapshotSocket();
      return response.ok({
        body: {
          parked: hold?.parked ?? false,
          continuedAfterHold: hold?.continuedAfterHold ?? false,
          authCompleted: hold?.authCompleted ?? false,
          aborted: hold?.aborted ?? false,
          authorized: socket?.authorized ?? null,
          peerCertificateNull: socket?.peerCertificateNull ?? false,
        },
      });
    }
  );

  router.post(
    {
      path: `${PREAUTH_HOLD_PATH_PREFIX}/{id}/release`,
      security: unauthenticatedTestRouteSecurity,
      validate: holdIdParams,
      options: { xsrfRequired: false },
    },
    (_context, request, response) => {
      const hold = preauthHolds.get(request.params.id);
      if (!hold) {
        return response.notFound();
      }
      hold.release();
      return response.ok();
    }
  );

  for (const isAuthFlow of [true, false]) {
    router.get(
      {
        path: `/authentication/app/${isAuthFlow ? 'auth_flow' : 'not_auth_flow'}`,
        security: {
          ...(!isAuthFlow
            ? {
                authc: {
                  enabled: false as const,
                  reason:
                    'This route is part of a security functional test plugin and does not require authentication.',
                },
              }
            : {}),
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          query: schema.object({
            statusCode: schema.maybe(schema.number()),
            message: schema.maybe(schema.string()),
          }),
        },
        ...(isAuthFlow ? { options: { tags: [ROUTE_TAG_AUTH_FLOW] } } : {}),
      },
      (context, request, response) => {
        if (request.query.statusCode) {
          return response.customError({
            statusCode: request.query.statusCode,
            body: request.query.message ?? `${request.query.statusCode} response`,
          });
        }

        return response.ok({ body: isAuthFlow ? 'Auth flow complete' : 'Not auth flow complete' });
      }
    );
  }

  router.post(
    {
      path: '/authentication/app/setup',
      security: {
        authc: {
          enabled: false,
          reason:
            'This route is part of a security functional test plugin and does not require authentication.',
        },
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: { body: schema.object({ simulateUnauthorized: schema.boolean() }) },
      options: { xsrfRequired: false },
    },
    (context, request, response) => {
      authenticationAppOptions.simulateUnauthorized = request.body.simulateUnauthorized;
      return response.ok();
    }
  );

  router.post(
    {
      path: '/authentication/slow/me',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          duration: schema.duration(),
          client: schema.oneOf([
            schema.literal('request-context'),
            schema.literal('start-contract'),
            schema.literal('custom'),
          ]),
        }),
      },
      options: { xsrfRequired: false },
    },
    async (context, request, response) => {
      const slowLog = logger.get('slow/me');
      slowLog.info(`Received request ${JSON.stringify(request.body)}.`);

      let scopedClient;
      if (request.body.client === 'start-contract') {
        scopedClient = (await core.getStartServices())[0].elasticsearch.client.asScoped(request);
      } else if (request.body.client === 'request-context') {
        scopedClient = (await context.core).elasticsearch.client;
      } else {
        scopedClient = (await core.getStartServices())[0].elasticsearch
          .createClient('custom')
          .asScoped(request);
      }

      await scopedClient.asCurrentUser.security.authenticate();
      slowLog.info(
        `Performed initial authentication request, waiting (${request.body.duration.asSeconds()}s)...`
      );

      // 2. Wait specified amount of time.
      await new Promise((resolve) => setTimeout(resolve, request.body.duration.asMilliseconds()));
      slowLog.info(`Waiting is done, performing final authentication request.`);

      // 3. Make authentication request once again and return result.
      try {
        const body = await scopedClient.asCurrentUser.security.authenticate();
        slowLog.info(
          `Successfully performed final authentication request: ${JSON.stringify(body)}`
        );
        return response.ok({ body });
      } catch (err) {
        slowLog.error(
          `Failed to perform final authentication request: ${
            err instanceof errors.ResponseError ? JSON.stringify(err.body) : err.message
          }`
        );

        throw err;
      }
    }
  );

  router.get(
    {
      path: '/authentication/fast/me',
      security: {
        authz: {
          enabled: false,
          reason: `This route delegates authorization to Core's security service; there must be an authenticated user for this route to return information`,
        },
        authc: {
          enabled: 'minimal',
          reason: `This route is optimized for performant retrieval of the current user's information`,
        },
      },
      validate: false,
      options: {
        access: 'public',
        excludeFromOAS: true,
      },
    },
    async (context, request, response) => {
      const { security: coreSecurity, elasticsearch } = await context.core;
      return response.ok({
        body: {
          principal: coreSecurity.authc.getCurrentUser()!,
          hasManage: await elasticsearch.client.asCurrentUser.security.hasPrivileges({
            cluster: ['manage'],
          }),
        },
      });
    }
  );

  router.post(
    {
      path: '/api_keys/_grant',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: { body: restApiKeySchema },
    },
    async (context, request, response) => {
      const [, { security }] = await core.getStartServices();
      const apiKey = await security.authc.apiKeys.grantAsInternalUser(request, request.body);
      if (!apiKey) {
        throw new Error(
          `Couldn't generate API key with the following parameters: ${JSON.stringify(request.body)}`
        );
      }

      return response.ok({ body: apiKey });
    }
  );

  async function waitUntilTaskIsIdle(taskManager: TaskManagerStartContract) {
    logger.info(`Waiting until session cleanup task is in idle.`);

    const RETRY_SCALE_DURATION = 1000;
    let retriesElapsed = 0;
    let taskInstance: ConcreteTaskInstance;
    while (retriesElapsed < 15 /** max around ~100s **/) {
      await new Promise((resolve) => setTimeout(resolve, retriesElapsed * RETRY_SCALE_DURATION));

      try {
        taskInstance = await taskManager.get(SESSION_INDEX_CLEANUP_TASK_NAME);
        if (taskInstance.status === 'idle') {
          logger.info(`Session cleanup task is in idle state: ${JSON.stringify(taskInstance)}.`);
          return;
        }
      } catch (err) {
        logger.error(`Failed to fetch task: ${err?.message || err}.`);
        throw err;
      }

      if (++retriesElapsed < 15) {
        logger.warn(
          `Session cleanup task is NOT in idle state (waiting for ${
            retriesElapsed * RETRY_SCALE_DURATION
          }ms before retrying): ${JSON.stringify(taskInstance)}.`
        );
      } else {
        logger.error(
          `Failed to wait until session cleanup tasks enters an idle state: ${JSON.stringify(
            taskInstance
          )}.`
        );
      }
    }
  }

  async function refreshTaskManagerIndex(
    enabled: boolean,
    coreStart: CoreStart,
    taskManager: TaskManagerStartContract
  ) {
    // Refresh task manager index before trying to modify a task document.
    // Might not be needed once https://github.com/elastic/kibana/pull/148985 is merged.
    try {
      logger.info(
        `Refreshing task manager index (enabled: ${enabled}), current task: ${JSON.stringify(
          await taskManager.get(SESSION_INDEX_CLEANUP_TASK_NAME)
        )}...`
      );

      const refreshResult = await coreStart.elasticsearch.client.asInternalUser.indices.refresh({
        index: '.kibana_task_manager',
        expand_wildcards: 'all',
      });

      logger.info(
        `Successfully refreshed task manager index (enabled: ${enabled}), refresh result: ${JSON.stringify(
          refreshResult
        )}, current task: ${JSON.stringify(
          await taskManager.get(SESSION_INDEX_CLEANUP_TASK_NAME)
        )}.`
      );
    } catch (err) {
      logger.error(
        `Failed to refresh task manager index (enabled: ${enabled}): ${err?.message || err}.`
      );
    }
  }

  router.post(
    {
      path: '/session/_run_cleanup',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      const [, { taskManager }] = await core.getStartServices();
      await taskManager.runSoon(SESSION_INDEX_CLEANUP_TASK_NAME);
      return response.ok();
    }
  );

  router.post(
    {
      path: '/session/toggle_cleanup_task',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: { body: schema.object({ enabled: schema.boolean() }) },
    },
    async (context, request, response) => {
      const [coreStart, { taskManager }] = await core.getStartServices();
      logger.info(`Toggle session cleanup task (enabled: ${request.body.enabled}).`);

      await refreshTaskManagerIndex(request.body.enabled, coreStart, taskManager);

      let bulkEnableDisableResult: BulkUpdateTaskResult;
      try {
        if (request.body.enabled) {
          logger.info(
            `Going to enable the following task: ${JSON.stringify(
              await taskManager.get(SESSION_INDEX_CLEANUP_TASK_NAME)
            )}.`
          );
          bulkEnableDisableResult = await taskManager.bulkEnable(
            [SESSION_INDEX_CLEANUP_TASK_NAME],
            true /** runSoon **/
          );
        } else {
          bulkEnableDisableResult = await taskManager.bulkDisable([
            SESSION_INDEX_CLEANUP_TASK_NAME,
          ]);
        }

        await refreshTaskManagerIndex(request.body.enabled, coreStart, taskManager);

        // Make sure that the task enters idle state before acknowledging that task was disabled.
        if (!request.body.enabled) {
          await waitUntilTaskIsIdle(taskManager);
        }
      } catch (err) {
        logger.error(
          `Failed to toggle session cleanup task (enabled: ${request.body.enabled}): ${
            err?.message || err
          }.`
        );
        throw err;
      }

      logger.info(
        `Successfully toggled session cleanup task (enabled: ${
          request.body.enabled
        }, enable/disable response: ${JSON.stringify(bulkEnableDisableResult)}).`
      );

      return response.ok();
    }
  );

  router.post(
    {
      path: '/session/_refresh_session_index',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      const [coreStart] = await core.getStartServices();
      await coreStart.elasticsearch.client.asInternalUser.indices.refresh({
        index: '.kibana_security_session*',
        expand_wildcards: 'all',
        ignore_unavailable: true,
      } as any);
      return response.ok();
    }
  );

  router.post(
    {
      path: '/session/_remove_created_at',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: {
        body: schema.object({
          ids: schema.arrayOf(schema.string({ maxLength: 1024 }), { maxSize: 100 }),
        }),
      },
    },
    async (context, request, response) => {
      const { ids } = request.body;
      const [coreStart] = await core.getStartServices();
      await coreStart.elasticsearch.client.asInternalUser.updateByQuery({
        index: '.kibana_security_session*',
        script: 'ctx._source.remove("createdAt")',
        query: { ids: { values: ids } },
        refresh: true,
      } as any);
      return response.ok();
    }
  );

  router.post(
    {
      path: '/simulate_point_in_time_failure',
      security: {
        authc: {
          enabled: false,
          reason:
            'This route is part of a security functional test plugin and does not require authentication.',
        },
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: { body: schema.object({ simulateOpenPointInTimeFailure: schema.boolean() }) },
      options: { xsrfRequired: false },
    },
    async (context, request, response) => {
      const esClient = (await context.core).elasticsearch.client.asInternalUser;
      const originalOpenPointInTime = unpatchedOpenPointInTime ?? esClient.openPointInTime;
      unpatchedOpenPointInTime = originalOpenPointInTime;

      if (request.body.simulateOpenPointInTimeFailure) {
        // @ts-expect-error
        esClient.openPointInTime = async function (params, options) {
          const { index } = params;
          if (index.includes('kibana_security_session')) {
            // Throw a ResponseError to match the real ES client behaviour: the client never
            // returns a plain 503 response object; it always throws for non-ignored status codes.
            // `cleanUp` in session_index.ts catches ResponseError with statusCode 503 and
            // message matching 'no_shard_available_action_exception' to increment the counter.
            throw new errors.ResponseError({
              statusCode: 503,
              body: {
                error: {
                  root_cause: [
                    {
                      type: 'no_shard_available_action_exception',
                      reason: 'no shard available for [open]',
                    },
                  ],
                  type: 'no_shard_available_action_exception',
                  reason: 'no shard available for [open]',
                },
                status: 503,
              },
              warnings: null,
              headers: {},
            } as DiagnosticResult);
          }
          return originalOpenPointInTime.call(this, params, options);
        };
      } else {
        esClient.openPointInTime = originalOpenPointInTime;
      }

      return response.ok();
    }
  );

  router.get(
    {
      path: '/cleanup_task_status',
      security: {
        authc: {
          enabled: false,
          reason:
            'This route is part of a security functional test plugin and does not require authentication.',
        },
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      const [, { taskManager }] = await core.getStartServices();
      const res = await taskManager.get(SESSION_INDEX_CLEANUP_TASK_NAME);
      const { attempts, state, status } = res;
      return response.ok({ body: { attempts, state, status } });
    }
  );

  router.get(
    {
      path: '/internal/test_endpoints/self_client/fake_request',
      security: {
        authz: {
          enabled: false,
          reason: 'Security test endpoint verifies API key authentication.',
        },
      },
      validate: false,
      options: { access: 'internal' },
    },
    async (context, _request, response) => {
      const { elasticsearch, security } = await context.core;
      const { has_all_requested: hasManage } =
        await elasticsearch.client.asCurrentUser.security.hasPrivileges({ cluster: ['manage'] });

      return response.ok({
        body: {
          username: security.authc.getCurrentUser()?.username,
          hasManage,
        },
      });
    }
  );

  router.post(
    {
      path: '/test_endpoints/self_client/fake_request',
      security: {
        authc: {
          enabled: false,
          reason: 'Security test endpoint constructs its own fake request credentials.',
        },
        authz: { enabled: false, reason: 'Security test endpoint verifies target authorization.' },
      },
      validate: { body: schema.object({ apiKey: schema.maybe(schema.string()) }) },
    },
    async (_context, request, response) => {
      const [coreStart] = await core.getStartServices();
      const fakeRequest = kibanaRequestFactory({
        headers: request.body.apiKey ? { authorization: `ApiKey ${request.body.apiKey}` } : {},
      });

      try {
        const body = await coreStart.http.selfClient
          .asScoped(fakeRequest)
          .fetch<{ username?: string; hasManage: boolean }>(
            '/internal/test_endpoints/self_client/fake_request',
            { access: 'internal' }
          );
        return response.ok({ body });
      } catch (error) {
        if (error instanceof Error && 'response' in error) {
          const { response: targetResponse } = error as Error & { response?: Response };
          if (targetResponse) {
            return response.custom({
              statusCode: targetResponse.status,
              body: targetResponse.statusText,
            });
          }
        }
        throw error;
      }
    }
  );

  router.post(
    {
      path: '/test_endpoints/api_keys/_grant',
      validate: false,
      security: { authz: { enabled: false, reason: 'Mock IDP plugin for testing' } },
    },
    async (_, request, response) => {
      const [{ security }] = await core.getStartServices();

      const result = await security.authc.apiKeys.grantAsInternalUser(request, {
        name: 'mock-idp-api-key',
        kibana_role_descriptors: {},
      });

      return result
        ? response.ok({ body: result })
        : response.badRequest({ body: { message: 'Failed to grant API key' } });
    }
  );

  router.post(
    {
      path: '/test_endpoints/api_keys/_invalidate',
      validate: {
        body: schema.object({ ids: schema.arrayOf(schema.string(), { minSize: 1 }) }),
      },
      security: { authz: { enabled: false, reason: 'Mock IDP plugin for testing' } },
    },
    async (_, request, response) => {
      const [{ security }] = await core.getStartServices();

      const result = await security.authc.apiKeys.invalidateAsInternalUser({
        ids: request.body.ids,
      });

      return result
        ? response.ok({ body: result })
        : response.badRequest({ body: { message: 'Failed to invalidate API key(s)' } });
    }
  );

  router.post(
    {
      path: '/test_endpoints/uiam/secondary_auth',
      validate: {
        body: schema.object({ apiKey: schema.maybe(schema.string()) }),
      },
      security: {
        authc: {
          enabled: 'optional',
          reason:
            'UIAM test endpoints may use explicit API key credentials instead of session auth',
        },
        authz: { enabled: false, reason: 'Mock IDP plugin for testing' },
      },
    },
    async (_, request, response) => {
      const [{ elasticsearch }] = await core.getStartServices();

      const scopedClient = elasticsearch.client.asScoped(
        request.body.apiKey
          ? { headers: { authorization: `ApiKey ${request.body.apiKey}` } }
          : request
      );

      return response.ok({
        body: (await scopedClient.asSecondaryAuthUser.transport.request({
          method: 'GET',
          path: `/_metering/stats`,
        })) as Record<string, unknown>,
      });
    }
  );

  router.post(
    {
      path: '/test_endpoints/uiam/scoped_client/_call',
      validate: {
        body: schema.object({ apiKey: schema.maybe(schema.string()) }),
      },
      security: {
        authc: {
          enabled: 'optional',
          reason:
            'UIAM test endpoints may use explicit API key credentials instead of session auth',
        },
        authz: { enabled: false, reason: 'Mock IDP plugin for testing' },
      },
    },
    async (context, request, response) => {
      try {
        const [{ elasticsearch }] = await core.getStartServices();

        const scopedClient = elasticsearch.client.asScoped(
          request.body.apiKey
            ? { headers: { authorization: `ApiKey ${request.body.apiKey}` } }
            : request
        );

        return response.ok({ body: await scopedClient.asCurrentUser.security.authenticate() });
      } catch (err) {
        logger.error(`Failed to authenticate to ES with UIAM API Key: ${err}`, err);
        return response.customError({
          statusCode: 500,
          body: { message: err.message },
        });
      }
    }
  );

  // UIAM API Key Grant Route
  router.post(
    {
      path: '/test_endpoints/uiam/api_keys/_grant',
      validate: {
        body: schema.object({
          name: schema.string(),
          expiration: schema.maybe(schema.string()),
          // Omit both to grant with the incoming request itself, which is how the callers that grant
          // on behalf of an end user do it, and the only way the request carries an authenticated
          // user.
          authcScheme: schema.maybe(schema.string()),
          credential: schema.maybe(schema.string()),
        }),
      },
      security: {
        authc: {
          enabled: 'optional',
          reason:
            'UIAM test endpoints may use explicit API key credentials instead of session auth',
        },
        authz: { enabled: false, reason: 'Test endpoint for UIAM API key operations' },
      },
    },
    async (context, request, response) => {
      try {
        const { name, expiration, authcScheme, credential } = request.body;
        const [{ security }] = await core.getStartServices();

        if (!security.authc.apiKeys.uiam) {
          return response.badRequest({
            body: { message: 'UIAM API keys service is not available' },
          });
        }

        let requestToUse = request;
        if (credential) {
          // Create a new request with the provided authentication header
          const requestHeaders: Headers = {
            ...request.headers,
            authorization: `${authcScheme} ${credential}`,
          };
          const fakeRawRequest: FakeRawRequest = {
            headers: requestHeaders,
            path: request.url.pathname,
          };
          requestToUse = kibanaRequestFactory(fakeRawRequest);
        }

        const result = await security.authc.apiKeys.uiam.grant(requestToUse, {
          name,
          expiration,
        });

        if (!result) {
          return response.badRequest({
            body: { message: 'Failed to grant UIAM API key' },
          });
        }

        return response.ok({ body: result });
      } catch (err) {
        logger.error(`Failed to grant UIAM API key: ${err}`, err);
        return response.customError({
          statusCode: 500,
          body: { message: err.message },
        });
      }
    }
  );

  // UIAM API Key Invalidate Route
  router.post(
    {
      path: '/test_endpoints/uiam/api_keys/_invalidate',
      validate: {
        body: schema.object({
          id: schema.string(),
          authcScheme: schema.string({ defaultValue: 'ApiKey' }),
          credential: schema.maybe(schema.string()),
          taskId: schema.maybe(schema.string({ minLength: 1, maxLength: 1024 })),
        }),
      },
      security: {
        authc: {
          enabled: 'optional',
          reason:
            'UIAM test endpoints may use explicit API key credentials instead of session auth',
        },
        authz: { enabled: false, reason: 'Test endpoint for UIAM API key operations' },
      },
    },
    async (context, request, response) => {
      try {
        const { id, authcScheme, credential, taskId } = request.body;
        const [{ security }, { taskManager }] = await core.getStartServices();

        if (!security.authc.apiKeys.uiam) {
          return response.badRequest({
            body: { message: 'UIAM API keys service is not available' },
          });
        }

        let credentialToUse = credential;
        if (taskId) {
          const task = await taskManager.get(taskId);
          if (task.userScope?.uiamApiKeyId !== id || !task.uiamApiKey) {
            return response.badRequest({
              body: { message: 'Task does not contain the requested UIAM API key' },
            });
          }
          credentialToUse = getUiamApiKeySecret(task.uiamApiKey);
        }

        let requestToUse = request;
        if (credentialToUse) {
          const requestHeaders: Headers = {
            ...request.headers,
            authorization: `${authcScheme} ${credentialToUse}`,
          };
          const fakeRawRequest: FakeRawRequest = {
            headers: requestHeaders,
            path: request.url.pathname,
          };
          requestToUse = kibanaRequestFactory(fakeRawRequest);
        }

        const result = await security.authc.apiKeys.uiam.invalidate(requestToUse, { id });

        if (!result) {
          return response.badRequest({
            body: { message: 'Failed to invalidate UIAM API key' },
          });
        }

        return response.ok({ body: result });
      } catch (err) {
        logger.error(`Failed to invalidate UIAM API key: ${err}`, err);
        return response.customError({
          statusCode: 500,
          body: { message: err.message },
        });
      }
    }
  );

  // UIAM API Key Convert Route
  router.post(
    {
      path: '/test_endpoints/uiam/api_keys/_convert',
      validate: {
        body: schema.object({
          keys: schema.arrayOf(schema.string(), { minSize: 1 }),
        }),
      },
      security: {
        authc: {
          enabled: 'optional',
          reason:
            'UIAM test endpoints may use explicit API key credentials instead of session auth',
        },
        authz: { enabled: false, reason: 'Test endpoint for UIAM API key operations' },
      },
    },
    async (context, request, response) => {
      try {
        const { keys } = request.body;
        const [{ security }] = await core.getStartServices();

        if (!security.authc.apiKeys.uiam) {
          return response.badRequest({
            body: { message: 'UIAM API keys service is not available' },
          });
        }

        const result = await security.authc.apiKeys.uiam.convert(keys);

        if (!result) {
          return response.badRequest({
            body: { message: 'Failed to convert API keys' },
          });
        }

        return response.ok({ body: result });
      } catch (err) {
        logger.error(`Failed to convert UIAM API keys: ${err}`, err);
        return response.customError({
          statusCode: 500,
          body: { message: err.message },
        });
      }
    }
  );
}
