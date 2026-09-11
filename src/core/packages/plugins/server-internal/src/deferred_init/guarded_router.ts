/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MaybePromise } from '@kbn/utility-types';
import type {
  IKibanaResponse,
  IRouter,
  KibanaResponseFactory,
  RequestHandler,
  RequestHandlerContextBase,
  RouteMethod,
  RouteRegistrar,
  VersionedRoute,
  VersionedRouteConfig,
  VersionedRouteRegistrar,
  VersionedRouter,
} from '@kbn/core-http-server';
import type { InitState } from '@kbn/core-plugins-server';
import type { DeferredInitUnavailableBody } from '@kbn/core-deferred-init-common';
import type { DeferredInitEngine } from './deferred_init_engine';

const GATED_METHODS: ReadonlySet<string> = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** The 503 response returned while a plugin's deferred init is not yet `available`. */
const initializingResponse = (
  response: KibanaResponseFactory,
  pluginId: string,
  status: InitState
): IKibanaResponse => {
  // Both 503 trigger paths (here and the central handler for an escaped
  // DeferredInitializationError) send this same `{ pluginId, status }` body so clients read one
  // stable shape. Not the default error envelope. The UI's real status channel is the un-gated
  // core state endpoint.
  const body: DeferredInitUnavailableBody = { pluginId, status };
  return response.custom({
    statusCode: 503,
    headers: { 'retry-after': '1' },
    bypassErrorFormat: true,
    body,
  });
};

/**
 * Wrap a plugin's router so that, while the plugin's deferred init is not `available`, every
 * route returns `503` + `Retry-After` with body `{ status }`, and the first such request kicks
 * the deferred work. Once init succeeds, routes delegate to the original handler unchanged.
 *
 * Gating is automatic and plugin-wide: the plugin author registers routes normally. Only the
 * route-registration methods are intercepted; everything else (routerPath, getRoutes, etc.)
 * passes through to the underlying router via the Proxy.
 *
 * @internal
 */
export function createGuardedRouter<Context extends RequestHandlerContextBase>(
  router: IRouter<Context>,
  engine: DeferredInitEngine,
  pluginId: string
): IRouter<Context> {
  const gate = <P, Q, B, Method extends RouteMethod>(
    handler: RequestHandler<P, Q, B, Context, Method>
  ): RequestHandler<P, Q, B, Context, Method> => {
    // The gate runs inside the route handler, i.e. after Hapi has already run authentication and
    // authorization for the route. A gated 503 is therefore only ever returned to a request that
    // already passed auth — this is not an auth bypass.
    return (context, request, response) => {
      const status = engine.ensureInitialized(pluginId);
      if (status !== 'available') {
        return initializingResponse(response, pluginId, status);
      }
      return handler(context, request, response);
    };
  };

  const wrapRegistrar =
    (register: RouteRegistrar<RouteMethod, Context>): RouteRegistrar<RouteMethod, Context> =>
    (route, handler) =>
      register(route, gate(handler));

  const guardedVersioned = createGuardedVersionedRouter(router.versioned, engine, pluginId);

  return new Proxy(router, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && GATED_METHODS.has(prop)) {
        return wrapRegistrar(
          Reflect.get(target, prop, receiver) as RouteRegistrar<RouteMethod, Context>
        );
      }
      if (prop === 'versioned') {
        return guardedVersioned;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Versioned-route variant of {@link createGuardedRouter}'s gating. */
function createGuardedVersionedRouter<Context extends RequestHandlerContextBase>(
  versioned: VersionedRouter<Context>,
  engine: DeferredInitEngine,
  pluginId: string
): VersionedRouter<Context> {
  const wrapVersionedRoute = <Method extends RouteMethod>(
    route: VersionedRoute<Method, Context>
  ): VersionedRoute<Method, Context> => ({
    addVersion: (options, handler) =>
      wrapVersionedRoute(
        route.addVersion(options, (context, request, response): MaybePromise<IKibanaResponse> => {
          const status = engine.ensureInitialized(pluginId);
          if (status !== 'available') {
            return initializingResponse(response, pluginId, status);
          }
          return handler(context, request, response);
        })
      ),
  });

  return new Proxy(versioned, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && GATED_METHODS.has(prop)) {
        const register = Reflect.get(target, prop, receiver) as VersionedRouteRegistrar<
          RouteMethod,
          Context
        >;
        return (config: VersionedRouteConfig<RouteMethod>) => wrapVersionedRoute(register(config));
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
