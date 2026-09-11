/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EventEmitter } from 'node:events';
import type { Request, ResponseToolkit } from '@hapi/hapi';
import type { Span } from 'elastic-apm-node';
import apm from 'elastic-apm-node';
import type { Logger } from '@kbn/logging';
import type { UnauthorizedError as EsNotAuthorizedError } from '@kbn/es-errors';
import { isUnauthorizedError as isElasticsearchUnauthorizedError } from '@kbn/es-errors';
import { isDeferredInitializationError } from '@kbn/core-deferred-init-common';
import type { DeferredInitUnavailableBody } from '@kbn/core-deferred-init-common';
import type {
  KibanaRequest,
  ErrorHttpResponseOptions,
  RouteConfig,
  RouteMethod,
  RequestHandlerContextBase,
  RouterRoute,
  IRouter,
  RequestHandler,
  VersionedRouter,
  RouteRegistrar,
  PostValidationMetadata,
  IKibanaResponse,
} from '@kbn/core-http-server';
import type { RouteSecurityGetter } from '@kbn/core-http-server';
import type { Env } from '@kbn/config';
import { withActiveSpan } from '@kbn/tracing-utils';
import { CoreVersionedRouter } from './versioned_router';
import type { CoreKibanaRequest } from './request';
import { getProtocolFromRequest } from './request';
import { kibanaResponseFactory } from './response';
import { HapiResponseAdapter } from './response_adapter';
import { wrapErrors } from './error_wrapper';
import { formatErrorMeta } from './util';
import { stripIllegalHttp2Headers } from './strip_illegal_http2_headers';
import type { InternalRouteConfig } from './route';
import { buildRoute } from './route';

export type ContextEnhancer<
  P,
  Q,
  B,
  Method extends RouteMethod,
  Context extends RequestHandlerContextBase
> = (handler: RequestHandler<P, Q, B, Context, Method>) => RequestHandlerEnhanced<P, Q, B, Method>;

/** @internal */
export type InternalRouteHandler = (request: Request) => Promise<IKibanaResponse>;

/**
 * We have at least two implementations of InternalRouterRoutes:
 * (1) Router route
 * (2) Versioned router route {@link CoreVersionedRoute}
 *
 * The former registers internal handlers when users call `route.put(...)` while
 * the latter registers an internal handler for `router.versioned.put(...)`.
 *
 * This enables us to expose internal details to each of these types routes so
 * that implementation has freedom to change what it needs to in each case, like:
 *
 * validation: versioned routes only know what validation to run after inspecting
 * special version values, whereas "regular" routes only ever have one validation
 * that is predetermined to always run.
 * @internal
 */
export type InternalRouterRoute = Omit<RouterRoute, 'handler'> & {
  handler: InternalRouteHandler;
};

/** @internal */
export interface RouterOptions {
  env: Env;

  /** Plugin for which this router was registered */
  pluginId?: symbol;

  versionedRouterOptions?: {
    /** {@inheritdoc VersionedRouterArgs['defaultHandlerResolutionStrategy'] }*/
    defaultHandlerResolutionStrategy?: 'newest' | 'oldest' | 'none';

    /** {@inheritdoc VersionedRouterArgs['useVersionResolutionStrategyForInternalPaths'] }*/
    useVersionResolutionStrategyForInternalPaths?: string[];
  };
}

/** @internal */
export type VersionedRouteConfig<P, Q, B, M extends RouteMethod> = Omit<
  RouteConfig<P, Q, B, M>,
  'security'
> & {
  security?: RouteSecurityGetter;
};

/** @internal */
type RouterEvents =
  /** Called after route validation, regardless of success or failure */
  'onPostValidate';

/**
 * @internal
 */
export class Router<Context extends RequestHandlerContextBase = RequestHandlerContextBase>
  implements IRouter<Context>
{
  /**
   * Used for global request events at the router level, similar to what we get from Hapi's request lifecycle events.
   *
   * See {@link RouterEvents}.
   */
  private static events = new EventEmitter();
  public routes: Array<Readonly<RouterRoute>> = [];
  public pluginId?: symbol;
  public get: RouteRegistrar<'get', Context>;
  public post: RouteRegistrar<'post', Context>;
  public delete: RouteRegistrar<'delete', Context>;
  public put: RouteRegistrar<'put', Context>;
  public patch: RouteRegistrar<'patch', Context>;

  constructor(
    public readonly routerPath: string,
    private readonly log: Logger,
    public readonly enhanceWithContext: ContextEnhancer<any, any, any, any, any>,
    private readonly options: RouterOptions
  ) {
    this.pluginId = options.pluginId;
    const buildMethod =
      <Method extends RouteMethod>(method: Method) =>
      <P, Q, B>(
        route: InternalRouteConfig<P, Q, B, Method>,
        handler: RequestHandler<P, Q, B, Context, Method>
      ) => {
        this.registerRoute(
          buildRoute({
            handler: this.enhanceWithContext(handler),
            log: this.log,
            method,
            route,
            router: this,
            isDev: this.options.env.mode.dev,
          })
        );
      };

    this.get = buildMethod('get');
    this.post = buildMethod('post');
    this.delete = buildMethod('delete');
    this.put = buildMethod('put');
    this.patch = buildMethod('patch');
  }

  public static on(event: RouterEvents, cb: (req: CoreKibanaRequest, ...args: any[]) => void) {
    Router.events.on(event, cb);
  }

  public static off(event: RouterEvents, cb: (req: CoreKibanaRequest, ...args: any[]) => void) {
    Router.events.off(event, cb);
  }

  public getRoutes({ excludeVersionedRoutes }: { excludeVersionedRoutes?: boolean } = {}) {
    if (excludeVersionedRoutes) {
      return this.routes.filter((route) => !route.isVersioned);
    }
    return [...this.routes];
  }

  public handleLegacyErrors = wrapErrors;

  public emitPostValidate = (
    request: KibanaRequest,
    postValidateConext: PostValidationMetadata = {
      isInternalApiRequest: true,
      isPublicAccess: false,
    }
  ) => {
    const postValidate: RouterEvents = 'onPostValidate';
    Router.events.emit(postValidate, request, postValidateConext);
  };

  /** @internal */
  public registerRoute(route: InternalRouterRoute) {
    this.routes.push({
      ...route,
      handler: async (request, responseToolkit) => {
        return withActiveSpan('route handler', () =>
          this.handle({ request, responseToolkit, handler: route.handler })
        );
      },
    });
  }

  private async handle({
    request,
    responseToolkit,
    handler,
  }: {
    request: Request;
    responseToolkit: ResponseToolkit;
    handler: InternalRouteHandler;
  }) {
    const hapiResponseAdapter = new HapiResponseAdapter(responseToolkit);
    let apmSpan: Span | null | undefined;
    try {
      apmSpan = apm.startSpan('route handler');
      const kibanaResponse = await handler(request);
      apmSpan?.end();
      if (getProtocolFromRequest(request) === 'http2' && kibanaResponse.options.headers) {
        kibanaResponse.options.headers = stripIllegalHttp2Headers({
          headers: kibanaResponse.options.headers,
          isDev: this.options.env.mode.dev,
          logger: this.log,
          requestContext: `${request.route.method} ${request.route.path}`,
        });
      }
      return hapiResponseAdapter.handle(kibanaResponse);
    } catch (error) {
      // capture error
      apm.captureError(error);
      apmSpan?.end();

      // forward 401 errors from ES client
      if (isElasticsearchUnauthorizedError(error)) {
        this.log.error('401 Unauthorized', formatErrorMeta(401, { request, error }));
        return hapiResponseAdapter.handle(
          kibanaResponseFactory.unauthorized(convertEsUnauthorized(error))
        );
      }

      // a lazy plugin's wrapped start() contract function was called before its deferred init
      // succeeded; mirror the guarded router's own 503 (same `{ pluginId, status }` body) so this
      // trigger path behaves the same way. `error.status` carries the plugin's real state at throw
      // time; fall back to `failed`, since that is the only state waitUntilAvailable rejects on.
      if (isDeferredInitializationError(error)) {
        this.log.debug(
          `503 deferred-init for "${error.pluginId}"`,
          formatErrorMeta(503, { request, error })
        );
        const body: DeferredInitUnavailableBody = {
          pluginId: error.pluginId,
          status: error.status ?? 'failed',
        };
        return hapiResponseAdapter.handle(
          kibanaResponseFactory.custom({
            statusCode: 503,
            headers: { 'retry-after': '1' },
            bypassErrorFormat: true,
            body,
          })
        );
      }

      // return a generic 500 to avoid error info / stack trace surfacing
      this.log.error('500 Server Error', formatErrorMeta(500, { request, error }));
      return hapiResponseAdapter.toInternalError();
    }
  }

  private versionedRouter: undefined | VersionedRouter<Context> = undefined;

  public get versioned(): VersionedRouter<Context> {
    if (this.versionedRouter === undefined) {
      this.versionedRouter = CoreVersionedRouter.from({
        router: this,
        env: this.options.env,
        log: this.log,
        ...this.options.versionedRouterOptions,
      });
    }
    return this.versionedRouter;
  }
}

const convertEsUnauthorized = (e: EsNotAuthorizedError): ErrorHttpResponseOptions => {
  const getAuthenticateHeaderValue = () => {
    const header = Object.entries(e.headers || {}).find(
      ([key]) => key.toLowerCase() === 'www-authenticate'
    );
    return header ? (header[1] as string) : 'Basic realm="Authorization Required"';
  };
  return {
    body: e.message,
    headers: {
      'www-authenticate': getAuthenticateHeaderValue(),
    },
  };
};

type WithoutHeadArgument<T> = T extends (first: any, ...rest: infer Params) => infer Return
  ? (...rest: Params) => Return
  : never;

export type RequestHandlerEnhanced<P, Q, B, Method extends RouteMethod> = WithoutHeadArgument<
  RequestHandler<P, Q, B, RequestHandlerContextBase, Method>
>;
