/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { PluginName } from '@kbn/core-base-common';
import type { DeferredInitState } from '@kbn/core-deferred-init-common';

/**
 * Lazy-initialization helpers. Every plugin gets these; the observation methods accept the
 * calling plugin's own id or any lazy plugin declared in its manifest (required, optional, or
 * `runtimePluginDependencies`), and none of them ever trigger a lazy plugin.
 *
 * The one exception is {@link LazyInitPlugins.trigger}, which is explicit and self-only.
 *
 * @public
 * @experimental
 */
export interface LazyInitPlugins {
  /**
   * Explicitly run this plugin's own `lazyInitialize()` and deferred `start()` if they have not
   * run on this instance yet, and wait for them. Resolves once the plugin is available; rejects
   * with a `DeferredInitializationError` if the attempt fails, or with a plain error if the
   * calling plugin did not opt into lazy initialization.
   *
   * This is the only way a plugin can cause its own deferred phases to run. Everything else on
   * this contract, and `core.getStartServices()`, only waits. Reserve it for events that should
   * genuinely initialize the plugin, such as its integration being installed.
   *
   * @remarks
   * Do NOT `await` this from your own `setup()`: nothing can trigger a lazy plugin during boot,
   * so it would deadlock until the boot-time watchdog fires.
   */
  trigger: () => Promise<void>;

  /**
   * Synchronous, non-triggering read of a lazy plugin's state on this instance. Use it in
   * setup-registered callbacks that other plugins invoke on their own traffic (task runners,
   * capabilities switchers, usage collectors, rule executors): they can neither wait nor
   * trigger, so they check this and no-op or fail fast when it is not `available`.
   *
   * @example
   * ```ts
   * createTaskRunner: () => ({
   *   run: async () => {
   *     if (core.plugins.lazyInit.getStatus('myPlugin') !== 'available') {
   *       return; // Task Manager reschedules on the normal interval.
   *     }
   *     const [, , self] = await core.getStartServices();
   *     await self.doWork();
   *   },
   * })
   * ```
   */
  getStatus: (pluginName: PluginName) => DeferredInitState;

  /**
   * Non-triggering observable of a lazy plugin's state on this instance. Replays the current
   * state to new subscribers.
   */
  status$: (pluginName: PluginName) => Observable<DeferredInitState>;

  /**
   * Run `callback` once the named lazy plugin has started on this instance, with its start
   * contract. Never triggers it. Fires immediately if it has already started, and at most once
   * per instance. A throwing callback is logged and does not affect the lazy plugin.
   *
   * For the calling plugin's own start, `core.getStartServices().then(...)` is the same hook; this
   * exists so a dependent can react to a lazy dependency becoming available without forcing it.
   *
   * @example
   * ```ts
   * setup(core) {
   *   core.plugins.lazyInit.onLazyStartService<FleetStartContract>('fleet', (fleet) => {
   *     fleet.registerExternalCallback('packagePolicyCreate', myCallback);
   *   });
   * }
   * ```
   */
  onLazyStartService: <T>(pluginName: PluginName, callback: (contract: T) => void) => void;
}

/**
 * Setup contract of Core's `plugins` service.
 *
 * @public
 */
export interface PluginsServiceSetup {
  /**
   * Returns a promise that will resolve with the requested plugin setup contracts once all plugins have been set up.
   *
   * If called when plugins are already setup, the returned promise will resolve instantly.
   *
   * The API can only be used to resolve required dependencies, optional dependencies, or dependencies explicitly
   * defined as `runtimePluginDependencies` in the calling plugin's manifest, otherwise the API will throw at call time.
   *
   * **Important:** This API should only be used when trying to address cyclic dependency issues that can't easily
   * be solved otherwise. This is meant to be a temporary workaround only supposed to be used until a better solution
   * is made available.
   * Therefore, by using this API, you implicitly agree to:
   * - consider it as technical debt and open an issue to track the tech debt resolution
   * - accept that this is only a temporary solution, and will comply to switching to the long term solution when asked by the Core team
   *
   * @remark The execution order is not guaranteed to be consistent. Only guarantee is that the returned promise will be
   *         resolved once all plugins are started, and before Core's `start` lifecycle is resumed.
   *
   * @example
   * ```ts
   * setup(core) {
   *   core.plugins.onSetup<{pluginA: SetupContractA, pluginB: SetupContractA}>('pluginA', 'pluginB')
   *       .then(({ pluginA, pluginB }) => {
   *         if(pluginA.found && pluginB.found) {
   *           // do something with pluginA.contract and pluginB.contract
   *         }
   *       });
   * }
   *
   * @experimental
   * ```
   */
  onSetup: PluginContractResolver;
  /**
   * Returns a promise that will resolve with the requested plugin start contracts once all plugins have been started.
   *
   * If called when plugins are already started, the returned promise will resolve instantly.
   *
   * The API can only be used to resolve required dependencies, optional dependencies, or dependencies explicitly
   * defined as `runtimePluginDependencies` in the calling plugin's manifest, otherwise the API will throw at call time.
   *
   * **Important:** This API should only be used when trying to address cyclic dependency issues that can't easily
   * be solved otherwise. This is meant to be a temporary workaround only supposed to be used until a better solution
   * is made available.
   * Therefore, by using this API, you implicitly agree to:
   * - consider it as technical debt and open an issue to track the tech debt resolution
   * - accept that this is only a temporary solution, and will comply to switching to the long term solution when asked by the Core team
   *
   * @remark The execution order is not guaranteed to be consistent. Only guarantee is that the returned promise will be
   *         resolved once all plugins are started, and before Core's `start` lifecycle is resumed.
   *
   * @remark Throws for a dependency that opted into lazy initialization: it has no start
   *         contract until its deferred `start()` runs, so those must be read with
   *         {@link LoadPluginContract | loadPluginContract} (triggers and waits) or observed with
   *         {@link LazyInitPlugins.onLazyStartService | lazyInit.onLazyStartService} (waits only).
   *
   * @example
   * ```ts
   * setup(core) {
   *   core.plugins.onStart<{pluginA: StartContractA, pluginB: StartContractA}>('pluginA', 'pluginB')
   *       .then(({ pluginA, pluginB }) => {
   *         if(pluginA.found && pluginB.found) {
   *           // do something with pluginA.contract and pluginB.contract
   *         }
   *       });
   * }
   *
   * @experimental
   * ```
   */
  onStart: PluginContractResolver;
  /**
   * Loads a single declared dependency's start contract, waiting for it to become safe to use.
   * For a lazy dependency this triggers its `lazyInitialize()` and deferred `start()` on this
   * instance if nothing has yet, then waits for them. Rejects with a
   * `DeferredInitializationError` (see `@kbn/core-plugins-server`) if that attempt fails.
   *
   * The dependency must be declared in the calling plugin's manifest (required, optional, or
   * `runtimePluginDependencies`), otherwise the API throws at call time.
   *
   * @remarks
   * Do NOT `await` this from your own `setup()`/`start()` for a lazy dependency: blocking a
   * lifecycle on another plugin's deferred phases stalls boot, so core rejects it. Call it
   * post-boot instead: from a route handler, a task runner, your own `lazyInitialize()`, or a
   * function returned from `start()` that consumers invoke later. To react to a lazy dependency
   * without forcing it to initialize, use {@link LazyInitPlugins.onLazyStartService} instead.
   *
   * @example
   * ```ts
   * // In a route handler (post-boot):
   * router.get({ path, validate }, async (ctx, req, res) => {
   *   const fleet = await core.plugins.loadPluginContract<FleetStartContract>('fleet');
   *   return res.ok({ body: await fleet.getSomething() });
   * });
   * ```
   *
   * @experimental
   */
  loadPluginContract: LoadPluginContract;
  /**
   * Lazy-initialization helpers: an explicit self-trigger, plus non-triggering ways to read or
   * observe the state of this plugin or any lazy plugin declared in its manifest.
   *
   * @see {@link LazyInitPlugins}
   *
   * @experimental
   */
  lazyInit: LazyInitPlugins;
}

/**
 * Start contract of Core's `plugins` service.
 *
 * @public
 */
export interface PluginsServiceStart {
  /**
   * Returns a promise that will resolve with the requested plugin start contracts once all plugins have been started.
   *
   * If called when plugins are already started, the returned promise will resolve instantly.
   *
   * The API can only be used to resolve required dependencies, optional dependencies, or dependencies explicitly
   * defined as `runtimePluginDependencies` in the calling plugin's manifest, otherwise the API will throw at call time.
   *
   * **Important:** This API should only be used when trying to address cyclic dependency issues that can't easily
   * be solved otherwise. This is meant to be a temporary workaround only supposed to be used until a better solution
   * is made available.
   * Therefore, by using this API, you implicitly agree to:
   * - consider it as technical debt and open an issue to track the tech debt resolution
   * - accept that this is only a temporary solution, and will comply to switching to the long term solution when asked by the Core team
   *
   * @remark The execution order is not guaranteed to be consistent. Only guarantee is that the returned promise will be
   *         resolved once all plugins are started, and before Core's `start` lifecycle is resumed.
   *
   * @remark Throws for a dependency that opted into lazy initialization: it has no start
   *         contract until its deferred `start()` runs, so those must be read with
   *         {@link LoadPluginContract | loadPluginContract} (triggers and waits) or observed with
   *         {@link LazyInitPlugins.onLazyStartService | lazyInit.onLazyStartService} (waits only).
   *
   * @example
   * ```ts
   * start(core) {
   *   core.plugins.onStart<{pluginA: StartContractA, pluginB: StartContractA}>('pluginA', 'pluginB')
   *       .then(({ pluginA, pluginB }) => {
   *         if(pluginA.found && pluginB.found) {
   *           // do something with pluginA.contract and pluginB.contract
   *         }
   *       });
   * }
   * ```
   *
   * @experimental
   */
  onStart: PluginContractResolver;
  /**
   * Loads a single declared dependency's start contract, waiting for it to become safe to use.
   * For a lazy dependency this triggers its `lazyInitialize()` and deferred `start()` on this
   * instance if nothing has yet, then waits for them. Rejects with a
   * `DeferredInitializationError` (see `@kbn/core-plugins-server`) if that attempt fails.
   *
   * The dependency must be declared in the calling plugin's manifest (required, optional, or
   * `runtimePluginDependencies`), otherwise the API throws at call time.
   *
   * @remarks
   * Do NOT `await` this from your own `start()` for a lazy dependency: blocking `start()` on
   * another plugin's deferred phases stalls boot, so core rejects it. Call it post-boot instead:
   * from a route handler, a task runner, your own `lazyInitialize()`, or a function returned from
   * `start()` that consumers invoke later.
   *
   * @example
   * ```ts
   * start(core) {
   *   // Return a function; consumers call it post-boot, never from their own start().
   *   return {
   *     getFleet: () => core.plugins.loadPluginContract<FleetStartContract>('fleet'),
   *   };
   * }
   * ```
   *
   * @experimental
   */
  loadPluginContract: LoadPluginContract;
  /**
   * Lazy-initialization helpers: an explicit self-trigger, plus non-triggering ways to read or
   * observe the state of this plugin or any lazy plugin declared in its manifest.
   *
   * @see {@link LazyInitPlugins}
   *
   * @experimental
   */
  lazyInit: LazyInitPlugins;
}

/**
 * Contract resolver response for found plugins.
 *
 * @see {@link PluginContractResolverResponseItem}
 * @public
 */
export interface FoundPluginContractResolverResponseItem<ContractType = unknown> {
  found: true;
  contract: ContractType;
}

/**
 * Contract resolver response for not found plugins.
 *
 * @see {@link PluginContractResolverResponseItem}
 * @public
 */
export interface NotFoundPluginContractResolverResponseItem {
  found: false;
}

/**
 * Contract resolver response.
 *
 * @see {@link PluginContractResolver}
 * @public
 */
export type PluginContractResolverResponseItem<ContractType = unknown> =
  | NotFoundPluginContractResolverResponseItem
  | FoundPluginContractResolverResponseItem<ContractType>;

/**
 * A record of plugin contracts.
 *
 * @see {@link PluginContractResolver}
 * @public
 */
export type PluginContractMap = Record<PluginName, unknown>;

/**
 * Response from a plugin contract resolver request.
 *
 * @see {@link PluginContractResolver}
 * @public
 */
export type PluginContractResolverResponse<ContractMap extends PluginContractMap> = {
  [Key in keyof ContractMap]: PluginContractResolverResponseItem<ContractMap[Key]>;
};

/**
 * A plugin contract resolver, allowing to retrieve plugin contracts at runtime.
 *
 * Please refer to {@link PluginsServiceSetup} and {@link PluginsServiceStart} for more documentation and examples.
 *
 * @public
 */
export type PluginContractResolver = <T extends PluginContractMap>(
  ...pluginNames: Array<keyof T>
) => Promise<PluginContractResolverResponse<T>>;

/**
 * Loads a single declared dependency's start contract, typed by an explicit generic type
 * argument. See {@link PluginsServiceSetup.loadPluginContract} and
 * {@link PluginsServiceStart.loadPluginContract} for documentation and examples.
 *
 * @public
 * @experimental
 */
export type LoadPluginContract = <T>(pluginName: PluginName) => Promise<T>;
