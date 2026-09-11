/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AwaitedProperties } from '@kbn/utility-types';

/**
 * Base, abstract type for request handler contexts.
 * @public
 **/
export interface RequestHandlerContextBase {
  /**
   * Await all the specified context parts and return them.
   *
   * @example
   * ```ts
   * const resolved = await context.resolve(['core', 'pluginA']);
   * const esClient = resolved.core.elasticsearch.client;
   * const pluginAService = resolved.pluginA.someService;
   * ```
   */
  resolve: <T extends keyof Omit<this, 'resolve' | 'loadPluginContract'>>(
    parts: T[]
  ) => Promise<AwaitedProperties<Pick<this, T>>>;

  /**
   * Load a declared dependency's start contract, waiting for it to become safe to use: the
   * dependency's `start()` must have returned, and if it opted into deferred (lazy)
   * initialization, that initialization must have completed. The route handler is post-boot, so
   * this is the natural place to reach a lazy plugin.
   *
   * This is the request-handler equivalent of `core.plugins.loadPluginContract()`, scoped to the
   * plugin that registered the route: the dependency must be declared in that plugin's manifest
   * (as a required, optional, or `runtimePluginDependencies` entry), otherwise this rejects.
   *
   * Rejects with a `DeferredInitializationError` if the dependency's deferred initialization
   * ultimately fails; letting that escape the handler yields a `503`.
   *
   * @example
   * ```ts
   * router.get({ path, validate }, async (context, request, response) => {
   *   const fleet = await context.loadPluginContract<FleetStartContract>('fleet');
   *   return response.ok({ body: await fleet.getSomething() });
   * });
   * ```
   *
   * @experimental
   */
  loadPluginContract: <T>(dependencyName: string) => Promise<T>;
}
