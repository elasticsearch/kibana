/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable, Subscription } from 'rxjs';
import { combineLatest, firstValueFrom, of, mergeMap } from 'rxjs';
import { map } from 'rxjs';
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

import { pick, Semaphore } from '@kbn/std';
import {
  generateOpenApiDocument,
  type GenerateOpenApiDocumentOptionsFilters,
} from '@kbn/router-to-openapispec';
import type { Logger } from '@kbn/logging';
import type { Env } from '@kbn/config';
import type { CoreContext, CoreService } from '@kbn/core-base-server-internal';
import type { PluginOpaqueId } from '@kbn/core-base-common';
import type { InternalExecutionContextSetup } from '@kbn/core-execution-context-server-internal';
import type { InternalUserActivityServiceSetup } from '@kbn/core-user-activity-server-internal';
import type {
  RequestHandlerContextBase,
  IContextContainer,
  IContextProvider,
  IRouter,
} from '@kbn/core-http-server';
import type {
  InternalContextSetup,
  InternalContextPreboot,
} from '@kbn/core-http-context-server-internal';
import type { DocLinksServicePreboot } from '@kbn/core-doc-links-server';
import type { RouterOptions } from '@kbn/core-http-router-server-internal';
import { Router } from '@kbn/core-http-router-server-internal';

import type { CspConfigType } from './csp';
import { cspConfig } from './csp';
import type { PermissionsPolicyConfigType } from './permissions_policy';
import { permissionsPolicyConfig } from './permissions_policy';
import type { HttpConfigType } from './http_config';
import { HttpConfig, config as httpConfig } from './http_config';
import { HttpServer } from './http_server';
import { HttpsRedirectServer } from './https_redirect_server';
import type {
  InternalHttpServicePreboot,
  InternalHttpServiceSetup,
  InternalHttpServiceStart,
  GenerateOasArgs,
} from './types';
import { registerCoreHandlers } from './register_lifecycle_handlers';
import type { ExternalUrlConfigType } from './external_url';
import { externalUrlConfig, ExternalUrlConfig } from './external_url';

export interface PrebootDeps {
  context: InternalContextPreboot;
  docLinks: DocLinksServicePreboot;
}

export interface SetupDeps {
  context: InternalContextSetup;
  executionContext: InternalExecutionContextSetup;
  userActivity: InternalUserActivityServiceSetup;
}

/** @internal */
export class HttpService
  implements CoreService<InternalHttpServiceSetup, InternalHttpServiceStart>
{
  private static readonly generateOasSemaphore = new Semaphore(1);
  private readonly prebootServer: HttpServer;
  private isPrebootServerStopped = false;
  private readonly httpServer: HttpServer;
  private readonly httpsRedirectServer: HttpsRedirectServer;
  private readonly config$: Observable<HttpConfig>;
  private configSubscription?: Subscription;

  private readonly log: Logger;
  private readonly env: Env;
  private internalPreboot?: InternalHttpServicePreboot;
  private internalSetup?: InternalHttpServiceSetup;
  private requestHandlerContext?: IContextContainer;

  constructor(private readonly coreContext: CoreContext) {
    const { logger, configService, env } = coreContext;

    this.env = env;
    this.log = logger.get('http');
    this.config$ = combineLatest([
      configService.atPath<HttpConfigType>(httpConfig.path, { ignoreUnchanged: false }),
      configService.atPath<CspConfigType>(cspConfig.path),
      configService.atPath<ExternalUrlConfigType>(externalUrlConfig.path),
      configService.atPath<PermissionsPolicyConfigType>(permissionsPolicyConfig.path),
    ]).pipe(
      map(
        ([http, csp, externalUrl, permissionsPolicy]) =>
          new HttpConfig(http, csp, externalUrl, permissionsPolicy)
      )
    );
    const shutdownTimeout$ = this.config$.pipe(map(({ shutdownTimeout }) => shutdownTimeout));
    this.prebootServer = new HttpServer(coreContext, 'Preboot', shutdownTimeout$);
    this.httpServer = new HttpServer(coreContext, 'Kibana', shutdownTimeout$);
    this.httpsRedirectServer = new HttpsRedirectServer(logger.get('http', 'redirect', 'server'));
  }

  public async preboot(deps: PrebootDeps): Promise<InternalHttpServicePreboot> {
    this.log.debug('setting up preboot server');

    const config = await firstValueFrom(this.config$);

    const prebootSetup = await this.prebootServer.setup({
      config$: this.config$,
    });
    prebootSetup.server.route({
      path: '/{p*}',
      method: '*',
      handler: (req, responseToolkit) => {
        this.log.debug(
          `Kibana server is not ready yet ${req.method}:${req.url.href}. For troubleshooting guidance, see ${deps.docLinks.links.server.troubleshootServerNotReady}`
        );

        // If server is not ready yet, because plugins or core can perform
        // long running tasks (build assets, saved objects migrations etc.)
        // we should let client know that and ask to retry after 30 seconds.
        return responseToolkit
          .response('Kibana server is not ready yet')
          .code(503)
          .header('Retry-After', '30');
      },
    });

    registerCoreHandlers(prebootSetup, config, this.env, this.log, prebootSetup.auth);

    if (this.shouldListen(config)) {
      this.log.debug('starting preboot server');
      await this.prebootServer.start();
    }

    const prebootServerRequestHandlerContext = deps.context.createContextContainer();
    this.internalPreboot = {
      externalUrl: new ExternalUrlConfig(config.externalUrl),
      csp: prebootSetup.csp,
      prototypeHardening: prebootSetup.prototypeHardening,
      staticAssets: prebootSetup.staticAssets,
      basePath: prebootSetup.basePath,
      registerStaticDir: prebootSetup.registerStaticDir.bind(prebootSetup),
      auth: prebootSetup.auth,
      server: prebootSetup.server,
      registerRouteHandlerContext: (pluginOpaqueId, contextName, provider) =>
        prebootServerRequestHandlerContext.registerContext(pluginOpaqueId, contextName, provider),
      registerRoutes: <
        DefaultRequestHandlerType extends RequestHandlerContextBase = RequestHandlerContextBase
      >(
        path: string,
        registerCallback: (router: IRouter<DefaultRequestHandlerType>) => void
      ) => {
        const router = new Router<DefaultRequestHandlerType>(
          path,
          this.log,
          prebootServerRequestHandlerContext.createHandler.bind(null, this.coreContext.coreId),
          {
            env: this.env,
            versionedRouterOptions: getVersionedRouterOptions(config),
          }
        );

        registerCallback(router);

        prebootSetup.registerRouterAfterListening(router);
      },
      getServerInfo: prebootSetup.getServerInfo,
    };

    return this.internalPreboot;
  }

  public async setup(deps: SetupDeps): Promise<InternalHttpServiceSetup> {
    this.requestHandlerContext = deps.context.createContextContainer();
    this.configSubscription = this.config$.subscribe(() => {
      if (this.httpServer.isListening()) {
        // If the server is already running we can't make any config changes
        // to it, so we warn and don't allow the config to pass through.
        this.log.warn(
          'Received new HTTP config after server was started. Config will **not** be applied.'
        );
      }
    });

    const config = await firstValueFrom(this.config$);

    const { registerRouter, ...serverContract } = await this.httpServer.setup({
      config$: this.config$,
      executionContext: deps.executionContext,
      userActivity: deps.userActivity,
    });

    registerCoreHandlers(serverContract, config, this.env, this.log, serverContract.auth);

    this.internalSetup = {
      ...serverContract,
      config,
      rateLimiter: config.rateLimiter,
      registerOnPostValidation: (cb) => {
        Router.on('onPostValidate', cb);
      },
      getRegisteredDeprecatedApis: () => serverContract.getDeprecatedRoutes(),
      externalUrl: new ExternalUrlConfig(config.externalUrl),
      createRouter: <Context extends RequestHandlerContextBase = RequestHandlerContextBase>(
        path: string,
        pluginId: PluginOpaqueId = this.coreContext.coreId
      ) => {
        const enhanceHandler = this.requestHandlerContext!.createHandler.bind(null, pluginId);
        const router = new Router<Context>(path, this.log, enhanceHandler, {
          env: this.env,
          versionedRouterOptions: getVersionedRouterOptions(config),
          pluginId,
        });
        registerRouter(router);
        return router;
      },

      registerRouteHandlerContext: <
        Context extends RequestHandlerContextBase,
        ContextName extends keyof Context
      >(
        pluginOpaqueId: PluginOpaqueId,
        contextName: ContextName,
        provider: IContextProvider<Context, ContextName>
      ) => this.requestHandlerContext!.registerContext(pluginOpaqueId, contextName, provider),
    };

    return this.internalSetup;
  }

  // this method exists because we need the start contract to create `CoreStart` used to start
  // the `plugin` and `legacy` services.
  public getStartContract(): InternalHttpServiceStart {
    return {
      ...pick(this.internalSetup!, ['auth', 'basePath', 'getServerInfo', 'staticAssets']),
      generateOas: (args: GenerateOasArgs) => this.generateOas(args),
      isListening: () => this.httpServer.isListening(),
      setRedactedSessionIdGetter: (getter) => {
        this.httpServer.setRedactedSessionIdGetter(getter);
      },
    };
  }

  public async start() {
    const config = await firstValueFrom(this.config$);
    if (this.shouldListen(config)) {
      this.log.debug('stopping preboot server');
      await this.prebootServer.stop();
      this.isPrebootServerStopped = true;

      // If a redirect port is specified, we start an HTTP server at this port and
      // redirect all requests to the SSL port.
      if (config.ssl.enabled && config.ssl.redirectHttpFromPort !== undefined) {
        await this.httpsRedirectServer.start(config);
      }

      if (config.oas.enabled) {
        this.log.info('Registering experimental OAS API');
        this.registerOasApi(config);
      }

      await this.httpServer.start();
    }

    return this.getStartContract();
  }

  private generateOas({ pluginId, baseUrl, filters }: GenerateOasArgs) {
    // Potentially quite expensive
    return firstValueFrom(
      of(1).pipe(
        HttpService.generateOasSemaphore.acquire(),
        mergeMap(async () => {
          return generateOpenApiDocument(this.httpServer.getRouters({ pluginId }), {
            baseUrl,
            title: 'Kibana HTTP APIs',
            version: '0.0.0', // TODO get a better version here
            filters,
            env: { serverless: this.env.packageInfo.buildFlavor === 'serverless' },
          });
        })
      )
    );
  }

  private registerOasApi(config: HttpConfig) {
    const basePath = this.internalSetup?.basePath;
    const server = this.internalSetup?.server;
    if (!basePath || !server) {
      throw new Error('Cannot register OAS API before server setup is complete');
    }

    const baseUrl =
      basePath.publicBaseUrl ?? `http://localhost:${config.port}${basePath.serverBasePath}`;

    const stringOrStringArraySchema = schema.oneOf([
      schema.string(),
      schema.arrayOf(schema.string(), { maxSize: 100 }),
    ]);
    const querySchema = schema.object({
      access: schema.oneOf([schema.literal('public'), schema.literal('internal')], {
        defaultValue: 'public' as const,
      }),
      version: schema.maybe(schema.string()),
      excludePathsMatching: schema.maybe(stringOrStringArraySchema),
      pathStartsWith: schema.maybe(stringOrStringArraySchema),
      pluginId: schema.maybe(schema.string()), // i.e. `@kbn/lens-plugin`
    });

    server.route({
      path: '/api/oas',
      method: 'GET',
      handler: async (req, h) => {
        let filters: GenerateOpenApiDocumentOptionsFilters;
        let query: TypeOf<typeof querySchema>;
        try {
          query = querySchema.validate(req.query);
          filters = {
            ...query,
            excludePathsMatching:
              typeof query.excludePathsMatching === 'string'
                ? [query.excludePathsMatching]
                : query.excludePathsMatching,
            pathStartsWith:
              typeof query.pathStartsWith === 'string'
                ? [query.pathStartsWith]
                : query.pathStartsWith,
          };
        } catch (e) {
          return h.response({ message: e.message }).code(400);
        }
        try {
          const result = await this.generateOas({
            baseUrl,
            filters,
            pluginId: query.pluginId,
          });
          return h.response(result);
        } catch (e) {
          return h.response({ message: e.message }).code(500);
        }
      },
      options: {
        auth: false,
        app: {
          access: 'public',
          security: {
            authz: {
              enabled: false,
              reason: 'Dev only route',
            },
          },
        },
        cache: {
          privacy: 'public',
          otherwise: 'must-revalidate',
        },
      },
    });
  }

  /**
   * Indicates if http server is configured to start listening on a configured port.
   * (if `server.autoListen` is not explicitly set to `false`.)
   *
   * @internal
   * */
  private shouldListen(config: HttpConfig) {
    return config.autoListen;
  }

  public async stop() {
    this.configSubscription?.unsubscribe();
    this.configSubscription = undefined;

    if (!this.isPrebootServerStopped) {
      this.isPrebootServerStopped = false;
      await this.prebootServer.stop();
    }

    await this.httpServer.stop();
    await this.httpsRedirectServer.stop();
  }
}

function getVersionedRouterOptions(config: HttpConfig): RouterOptions['versionedRouterOptions'] {
  return {
    defaultHandlerResolutionStrategy: config.versioned.versionResolution,
    useVersionResolutionStrategyForInternalPaths:
      config.versioned.useVersionResolutionStrategyForInternalPaths,
  };
}
