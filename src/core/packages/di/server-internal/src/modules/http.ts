/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandler, RouteRegistrar } from '@kbn/core-http-server';
import { CoreSetup, Request, Response, Route, Router } from '@kbn/core-di-server';
import type { RequestHandlerContext } from '@kbn/core-http-request-handler-context-server';
import { cacheInScope } from '@kbn/core-di-internal';
import { type KibanaContainerModuleLoadOptions, Scope } from '@kbn/core-di';

export function loadHttp({ bind, onSetup }: KibanaContainerModuleLoadOptions): void {
  onSetup(Route, Router, ({ inject }, route, router) => {
    const register = router[route.method] as RouteRegistrar<
      typeof route.method,
      RequestHandlerContext
    >;
    let handler: RequestHandler = inject(Scope, async (scope, _context, request, response) => {
      scope.expose(Request).toConstantValue(request);
      scope.expose(Response).toConstantValue(response);

      try {
        return await (await scope.getAsync(route, { autobind: true })).handle();
      } finally {
        scope.dispose();
      }
    });

    if (route.handleLegacyErrors) {
      handler = router.handleLegacyErrors(handler);
    }

    /*
     * Materialize class-based route definitions into a plain config object.
     * Static getters (e.g. `options` with `access: 'public'`) are not enumerable
     * own properties, so passing the class through to the router would drop them
     * during `prepareRouteConfigValidation`'s object spread and omit the route
     * from public OAS generation.
     */
    register(
      {
        path: route.path,
        validate: route.validate,
        security: route.security,
        options: route.options,
      },
      handler
    );
  });

  bind(Router)
    .toResolvedValue((httpSetup) => httpSetup.createRouter(), [CoreSetup('http')])
    .inRequestScope()
    .onActivation(cacheInScope(Router));
}
