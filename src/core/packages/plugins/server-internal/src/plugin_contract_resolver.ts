/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { filter, take, type Observable } from 'rxjs';
import type { Logger } from '@kbn/logging';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { PluginName } from '@kbn/core-base-common';
import type {
  PluginContractResolverResponse,
  PluginContractMap,
  PluginContractResolverResponseItem,
} from '@kbn/core-plugins-contracts-server';
import type { InitState } from '@kbn/core-plugins-server';
import type { DeferredInitEngine } from './deferred_init';

export type IRuntimePluginContractResolver = PublicMethodsOf<RuntimePluginContractResolver>;

type LazyInitApi = 'trigger' | 'getStatus' | 'status$' | 'onLazyStartService';

export class RuntimePluginContractResolver {
  private dependencyMap?: Map<PluginName, Set<PluginName>>;
  private setupContracts?: Map<PluginName, unknown>;
  private startContracts?: Map<PluginName, unknown>;
  private deferredInitEngine?: DeferredInitEngine;
  /**
   * Names of the plugins that opted into lazy initialization, derived from the manifests during
   * `setupPlugins` and therefore known before any plugin's `setup()` runs. The engine's own
   * {@link DeferredInitEngine.isRegistered} cannot back the guards here: lazy dependencies are
   * declared as `runtimePluginDependencies`, which create no topological edge, so a dependent can
   * call into this resolver from its own `setup()` before the lazy plugin has been set up and
   * registered with the engine.
   */
  private lazyPluginNames: ReadonlySet<PluginName> = new Set();

  private readonly setupRequestQueue: PluginContractRequest[] = [];
  private readonly startRequestQueue: PluginContractRequest[] = [];
  /**
   * Contracts for plugins whose `start()` has already returned, populated incrementally as
   * {@link PluginsSystem.startPlugins}'s loop progresses -- well before the whole loop (and
   * therefore {@link resolveStartRequests}) finishes -- and, for lazy plugins, whenever their
   * deferred `start()` completes post-boot. Without this, a plugin calling
   * `onStart`/`loadPluginContract` on an already-started dependency from its OWN `start()` would
   * deadlock: that request could only unblock once every plugin's `start()` had returned, which
   * can't happen until this very `start()` call returns first.
   */
  private readonly availableStartContracts = new Map<PluginName, unknown>();

  constructor(private readonly log: Logger) {}

  setDependencyMap(depMap: Map<PluginName, Set<PluginName>>) {
    this.dependencyMap = new Map(depMap.entries());
  }

  setDeferredInitEngine(engine: DeferredInitEngine) {
    this.deferredInitEngine = engine;
  }

  setLazyPluginNames(names: ReadonlySet<PluginName>) {
    this.lazyPluginNames = new Set(names);
  }

  onSetup = <T extends PluginContractMap>(
    pluginName: PluginName,
    dependencyNames: Array<keyof T>
  ): Promise<PluginContractResolverResponse<T>> => {
    this.assertDeclaredDependencies('onSetup', pluginName, dependencyNames as PluginName[]);

    if (this.setupContracts) {
      const response = createContractRequestResponse(
        dependencyNames as PluginName[],
        this.setupContracts
      );
      return Promise.resolve(response as PluginContractResolverResponse<T>);
    } else {
      const setupContractRequest = createPluginContractRequest<PluginContractResolverResponse<T>>(
        dependencyNames as PluginName[]
      );
      this.setupRequestQueue.push(setupContractRequest as PluginContractRequest);
      return setupContractRequest.contractPromise;
    }
  };

  onStart = <T extends PluginContractMap>(
    pluginName: PluginName,
    dependencyNames: Array<keyof T>
  ): Promise<PluginContractResolverResponse<T>> => {
    this.assertDeclaredDependencies('onStart', pluginName, dependencyNames as PluginName[]);

    // A lazy plugin has no start contract until its deferred `start()` runs, and `onStart` is the
    // API plugins reach for at boot. Route them to the two APIs whose semantics are explicit about
    // waiting versus triggering, rather than leaving a silent bypass of the boot-time rule that
    // keeps lazy plugins out of the injected `plugins` argument.
    const lazyDependencies = (dependencyNames as PluginName[]).filter((name) =>
      this.lazyPluginNames.has(name)
    );
    if (lazyDependencies.length) {
      throw new Error(
        `onStart cannot resolve plugins that opt into lazy initialization, because they have no ` +
          `start contract until their deferred start() runs. Lazy dependencies: ` +
          `${lazyDependencies.join(', ')}. Use ` +
          `"await core.plugins.loadPluginContract(<dependency>)" from a post-boot code path to ` +
          `trigger and wait, or "core.plugins.lazyInit.onLazyStartService(<dependency>, cb)" to ` +
          `react without triggering.`
      );
    }

    return this.requestStartContracts<T>(dependencyNames as PluginName[]);
  };

  private assertDeclaredDependencies(
    api: 'onSetup' | 'onStart' | 'loadPluginContract' | LazyInitApi,
    pluginName: PluginName,
    dependencyNames: PluginName[]
  ): void {
    if (!this.dependencyMap) {
      throw new Error(`${api} cannot be called before setDependencyMap`);
    }

    const dependencyList = this.dependencyMap.get(pluginName) ?? new Set();
    const notDependencyPlugins = dependencyNames.filter((name) => !dependencyList.has(name));
    if (notDependencyPlugins.length) {
      throw new Error(
        'Dynamic contract resolving requires the dependencies to be declared in the plugin manifest.' +
          `Undeclared dependencies: ${notDependencyPlugins.join(', ')}`
      );
    }
  }

  /**
   * The queueing half of {@link onStart}, without its lazy-plugin guard, so
   * {@link loadPluginContract} can reuse it -- that API is the sanctioned way to reach a lazy
   * plugin's start contract, so it must not trip the guard that points callers at it.
   */
  private requestStartContracts = <T extends PluginContractMap>(
    dependencyNames: PluginName[]
  ): Promise<PluginContractResolverResponse<T>> => {
    if (this.startContracts) {
      const response = createContractRequestResponse(dependencyNames, this.startContracts);
      return Promise.resolve(response as PluginContractResolverResponse<T>);
    }

    if (dependencyNames.every((name) => this.availableStartContracts.has(name))) {
      const response = createContractRequestResponse(dependencyNames, this.availableStartContracts);
      return Promise.resolve(response as PluginContractResolverResponse<T>);
    }

    const startContractRequest =
      createPluginContractRequest<PluginContractResolverResponse<T>>(dependencyNames);
    this.startRequestQueue.push(startContractRequest as PluginContractRequest);
    return startContractRequest.contractPromise;
  };

  /**
   * Called once per plugin, right after its `start()` returns: from the boot loop for ordinary
   * plugins, and from the deferred-init runner for lazy plugins, whose `start()` runs post-boot.
   * Any queued {@link onStart}/{@link loadPluginContract} request that was only waiting on this
   * plugin resolves immediately instead of waiting for {@link resolveStartRequests}, and the
   * contract is added to the final map as well so post-boot lookups find it.
   */
  notifyStartContractAvailable(pluginName: PluginName, contract: unknown): void {
    this.availableStartContracts.set(pluginName, contract);
    this.startContracts?.set(pluginName, contract);

    for (let i = this.startRequestQueue.length - 1; i >= 0; i--) {
      const request = this.startRequestQueue[i];
      if (request.pluginNames.every((name) => this.availableStartContracts.has(name))) {
        request.resolve(
          createContractRequestResponse(request.pluginNames, this.availableStartContracts)
        );
        this.startRequestQueue.splice(i, 1);
      }
    }
  }

  /**
   * Loads a single declared dependency's start contract. For an ordinary dependency this resolves
   * once its `start()` has returned. For a lazy dependency this is the triggering accessor: it
   * kicks the dependency's `lazyInitialize()` and deferred `start()` on this instance if nothing
   * has yet, waits for them, and only then reads the contract they produced. Rejects with
   * `DeferredInitializationError` if that attempt fails.
   */
  loadPluginContract = async <T>(
    pluginName: PluginName,
    dependencyName: PluginName
  ): Promise<T> => {
    this.assertDeclaredDependencies('loadPluginContract', pluginName, [dependencyName]);

    // Wait first, then read: a lazy plugin's contract only exists once its deferred start() has
    // run, and the runner publishes it (via `notifyStartContractAvailable`) before the engine
    // reports `available`.
    if (this.lazyPluginNames.has(dependencyName) && this.deferredInitEngine) {
      await this.deferredInitEngine.waitUntilAvailable(dependencyName);
    }

    const response = await this.requestStartContracts<Record<PluginName, T>>([dependencyName]);
    const item = response[dependencyName];
    if (!item.found) {
      throw new Error(
        `Cannot load contract for plugin "${dependencyName}": it is missing, disabled, or has no start contract.`
      );
    }

    return item.contract;
  };

  /**
   * Backs `core.plugins.lazyInit.trigger()`: the calling plugin explicitly runs its own deferred
   * phases (if they have not run here yet) and waits for them. Self-only, and the only
   * non-request path that causes a lazy plugin to initialize.
   */
  trigger = (pluginName: PluginName): Promise<void> => {
    if (!this.lazyPluginNames.has(pluginName)) {
      return Promise.reject(
        new Error(
          `Plugin "${pluginName}" did not opt into lazy initialization ("enableLazyInitialize" in ` +
            `its kibana.jsonc), so there is nothing to trigger.`
        )
      );
    }
    if (!this.deferredInitEngine) {
      return Promise.reject(new Error('trigger cannot be called before setDeferredInitEngine'));
    }
    return this.deferredInitEngine.waitUntilAvailable(pluginName);
  };

  /** Backs `core.plugins.lazyInit.getStatus()`: synchronous, never triggers. */
  getLazyInitStatus = (pluginName: PluginName, target: PluginName): InitState => {
    return this.assertLazyTarget('getStatus', pluginName, target).getState(target);
  };

  /** Backs `core.plugins.lazyInit.status$()`: replays the current state, never triggers. */
  lazyInitStatus$ = (pluginName: PluginName, target: PluginName): Observable<InitState> => {
    return this.assertLazyTarget('status$', pluginName, target).state$(target);
  };

  /**
   * Backs `core.plugins.lazyInit.onLazyStartService()`: runs `callback` with `target`'s start
   * contract once `target` has started on this instance, without triggering it. Fires at most
   * once, immediately if `target` is already available. A throwing callback is logged rather
   * than propagated, so one dependent's bug cannot poison the lazy plugin's state stream.
   */
  onLazyStartService = <T>(
    pluginName: PluginName,
    target: PluginName,
    callback: (contract: T) => void
  ): void => {
    const engine = this.assertLazyTarget('onLazyStartService', pluginName, target);
    engine
      .state$(target)
      .pipe(
        filter((state) => state === 'available'),
        take(1)
      )
      .subscribe(() => {
        try {
          callback(this.availableStartContracts.get(target) as T);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.log.error(
            `onLazyStartService callback registered by "${pluginName}" for lazy plugin ` +
              `"${target}" threw: ${message}`
          );
        }
      });
  };

  /**
   * The observation APIs accept the caller itself or any lazy plugin declared in its manifest.
   * Returns the engine so callers can narrow on it once.
   */
  private assertLazyTarget(
    api: LazyInitApi,
    pluginName: PluginName,
    target: PluginName
  ): DeferredInitEngine {
    if (target !== pluginName) {
      this.assertDeclaredDependencies(api, pluginName, [target]);
    }
    if (!this.lazyPluginNames.has(target)) {
      throw new Error(
        `lazyInit.${api} only applies to plugins that opted into lazy initialization ` +
          `("enableLazyInitialize" in kibana.jsonc); "${target}" did not. Use onStart() or ` +
          `loadPluginContract() for ordinary plugins.`
      );
    }
    if (!this.deferredInitEngine) {
      throw new Error(`lazyInit.${api} cannot be called before setDeferredInitEngine`);
    }
    return this.deferredInitEngine;
  }

  resolveSetupRequests(setupContracts: Map<PluginName, unknown>) {
    if (this.setupContracts) {
      throw new Error('resolveSetupRequests can only be called once');
    }
    this.setupContracts = setupContracts;

    for (const setupRequest of this.setupRequestQueue) {
      const response = createContractRequestResponse(setupRequest.pluginNames, setupContracts);
      setupRequest.resolve(response);
    }
  }

  resolveStartRequests(startContracts: Map<PluginName, unknown>) {
    if (this.startContracts) {
      throw new Error('resolveStartRequests can only be called once');
    }
    this.startContracts = startContracts;

    for (const startRequest of this.startRequestQueue) {
      const response = createContractRequestResponse(startRequest.pluginNames, startContracts);
      startRequest.resolve(response);
    }
  }
}

interface PluginContractRequest<T = unknown> {
  pluginNames: PluginName[];
  contractPromise: Promise<T>;
  resolve: (data?: T) => void;
}

const createPluginContractRequest = <T = unknown>(
  pluginNames: PluginName[]
): PluginContractRequest<T> => {
  let resolve!: (data?: T) => void;
  const contractPromise = new Promise<any>((_resolve) => {
    resolve = _resolve;
  });

  return {
    pluginNames,
    contractPromise,
    resolve,
  };
};

const createContractRequestResponse = <T extends PluginContractMap>(
  pluginNames: PluginName[],
  contracts: Map<string, unknown>
): PluginContractResolverResponse<T> => {
  const response = {} as Record<string, unknown>;
  for (const pluginName of pluginNames) {
    const pluginResponse: PluginContractResolverResponseItem = contracts.has(pluginName)
      ? {
          found: true,
          contract: contracts.get(pluginName)!,
        }
      : { found: false };
    response[pluginName] = pluginResponse;
  }

  return response as PluginContractResolverResponse<T>;
};
