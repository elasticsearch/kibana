/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { map } from 'rxjs';
import { withTimeout, isPromise } from '@kbn/std';
import type { DiscoveredPlugin, PluginName } from '@kbn/core-base-common';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type { Logger } from '@kbn/logging';
import { PluginType } from '@kbn/core-base-common';
import type { PluginOpaqueId } from '@kbn/core-base-common';
import type { NodeRoles } from '@kbn/core-node-server';
import type { CoreStart } from '@kbn/core-lifecycle-server';
import type { PluginWrapper } from './plugin';
import { type PluginDependencies } from './types';
import {
  createPluginPrebootSetupContext,
  createPluginSetupContext,
  createPluginStartContext,
} from './plugin_context';
import type {
  PluginsServicePrebootSetupDeps,
  PluginsServiceSetupDeps,
  PluginsServiceStartDeps,
} from './plugins_service';
import { RuntimePluginContractResolver } from './plugin_contract_resolver';
import { type DeferredInitEngine, toServiceStatus } from './deferred_init';

const Sec = 1000;

/** @internal */
export class PluginsSystem<T extends PluginType> {
  private readonly runtimeResolver: RuntimePluginContractResolver;
  private readonly plugins = new Map<PluginName, PluginWrapper>();
  private readonly log: Logger;
  // `satup`, the past-tense version of the noun `setup`.
  private readonly satupPlugins: PluginName[] = [];
  private sortedPluginNames?: Set<string>;
  private pluginNamesByOpaqueId?: Map<PluginOpaqueId, PluginName>;
  private nodeRoles?: NodeRoles;

  constructor(
    private readonly coreContext: CoreContext,
    public readonly type: T,
    private readonly deferredInitEngine?: DeferredInitEngine
  ) {
    this.log = coreContext.logger.get('plugins-system', this.type);
    this.runtimeResolver = new RuntimePluginContractResolver(this.log.get('contract-resolver'));
  }

  /**
   * Records this node's roles. A node without the `ui` role never receives the requests that
   * would trigger a lazy plugin, so {@link startPlugins} triggers them itself once boot is done.
   */
  public setNodeRoles(roles: NodeRoles): void {
    this.nodeRoles = roles;
  }

  public addPlugin(plugin: PluginWrapper) {
    if (plugin.manifest.type !== this.type) {
      throw new Error(
        `Cannot add plugin with type "${plugin.manifest.type}" to plugin system with type "${this.type}".`
      );
    }

    this.plugins.set(plugin.name, plugin);

    // clear derived plugin caches on addition
    this.sortedPluginNames = undefined;
    this.pluginNamesByOpaqueId = undefined;
  }

  public getPlugins() {
    return [...this.plugins.values()];
  }

  /**
   * Resolves a start contract on behalf of the plugin identified by `source`, backing
   * `context.loadPluginContract()` in that plugin's route handlers. Opaque ids are what the
   * request handler context knows about the route's owner; the runtime resolver works in plugin
   * names and needs one to enforce that the dependency is declared in the caller's manifest.
   *
   * Returns `undefined` for an unknown opaque id (core's own routes, or a plugin belonging to the
   * other plugin system) so the caller can reject with its own message.
   */
  public loadPluginContractFor(
    source: PluginOpaqueId,
    dependencyName: PluginName
  ): Promise<unknown> | undefined {
    const pluginName = this.getPluginNameByOpaqueId(source);
    return pluginName === undefined
      ? undefined
      : this.runtimeResolver.loadPluginContract(pluginName, dependencyName);
  }

  private getPluginNameByOpaqueId(source: PluginOpaqueId): PluginName | undefined {
    if (!this.pluginNamesByOpaqueId) {
      this.pluginNamesByOpaqueId = new Map(
        [...this.plugins.values()].map((plugin) => [plugin.opaqueId, plugin.name])
      );
    }
    return this.pluginNamesByOpaqueId.get(source);
  }

  /**
   * @returns a Map of each plugin and an Array of its available dependencies
   * @internal
   */
  public getPluginDependencies(): PluginDependencies {
    const asNames = new Map<string, string[]>();
    const asOpaqueIds = new Map<symbol, symbol[]>();

    for (const pluginName of this.getTopologicallySortedPluginNames()) {
      const plugin = this.plugins.get(pluginName)!;
      const dependencies = [
        ...new Set([
          ...plugin.requiredPlugins,
          ...plugin.optionalPlugins.filter((optPlugin) => this.plugins.has(optPlugin)),
        ]),
      ];

      asNames.set(
        plugin.name,
        dependencies.map((depId) => this.plugins.get(depId)!.name)
      );
      asOpaqueIds.set(
        plugin.opaqueId,
        dependencies.map((depId) => this.plugins.get(depId)!.opaqueId)
      );
    }

    return { asNames, asOpaqueIds };
  }

  public async setupPlugins(
    deps: T extends PluginType.preboot ? PluginsServicePrebootSetupDeps : PluginsServiceSetupDeps
  ): Promise<Map<string, unknown>> {
    const contracts = new Map<PluginName, unknown>();
    if (this.plugins.size === 0) {
      return contracts;
    }

    const runtimeDependencies = buildPluginRuntimeDependencyMap(this.plugins);
    this.runtimeResolver.setDependencyMap(runtimeDependencies);
    if (this.deferredInitEngine) {
      const lazyPluginNames = collectLazyPluginNames(this.plugins);
      assertLazyPluginsAreNotInjectedDependencies(this.plugins, lazyPluginNames);
      this.runtimeResolver.setLazyPluginNames(lazyPluginNames);
      this.runtimeResolver.setDeferredInitEngine(this.deferredInitEngine);
    }

    const sortedPlugins = new Map(
      [...this.getTopologicallySortedPluginNames()]
        .map((pluginName) => [pluginName, this.plugins.get(pluginName)!] as [string, PluginWrapper])
        .filter(([pluginName, plugin]) => plugin.includesServerPlugin)
    );
    this.log.info(
      `Setting up [${sortedPlugins.size}] plugins: [${[...sortedPlugins.keys()].join(',')}]`
    );

    for (const [pluginName, plugin] of sortedPlugins) {
      this.log.debug(`Setting up plugin "${pluginName}"...`);
      const pluginDeps = new Set([...plugin.requiredPlugins, ...plugin.optionalPlugins]);
      const pluginDepContracts = Array.from(pluginDeps).reduce((depContracts, dependencyName) => {
        // Only set if present. Could be absent if plugin does not have server-side code or is a
        // missing optional dependency.
        if (contracts.has(dependencyName)) {
          depContracts[dependencyName] = contracts.get(dependencyName);
        }

        return depContracts;
      }, {} as Record<PluginName, unknown>);

      let pluginSetupContext;
      if (this.type === PluginType.preboot) {
        pluginSetupContext = createPluginPrebootSetupContext({
          deps: deps as PluginsServicePrebootSetupDeps,
          plugin,
        });
      } else {
        pluginSetupContext = createPluginSetupContext({
          deps: deps as PluginsServiceSetupDeps,
          plugin,
          runtimeResolver: this.runtimeResolver,
          deferredInitEngine: this.deferredInitEngine,
        });
      }

      await plugin.init();

      if (
        this.type !== PluginType.preboot &&
        this.deferredInitEngine &&
        plugin.enableLazyInitialize
      ) {
        const setupDeps = deps as PluginsServiceSetupDeps;
        const engine = this.deferredInitEngine;
        engine.register(plugin.name);
        // Path A: core reflects deferred-init state into the plugin's /status entry, so the
        // plugin author writes no status code. Registered during setup, before status.start().
        setupDeps.status.plugins.set(
          plugin.name,
          engine.state$(plugin.name).pipe(map((state) => toServiceStatus(plugin.name, state)))
        );
        this.log.info(
          `Plugin "${plugin.name}" opted into lazy initialization; its lazyInitialize() and start() will run on first trigger, not at boot.`
        );
      }

      let contract: unknown;
      const contractOrPromise = plugin.setup(pluginSetupContext, pluginDepContracts);
      if (isPromise(contractOrPromise)) {
        if (this.coreContext.env.mode.dev) {
          this.log.warn(
            `Plugin ${pluginName} is using asynchronous setup lifecycle. Asynchronous plugins support will be removed in a later version.`
          );
        }
        const contractMaybe = await withTimeout<any>({
          promise: contractOrPromise,
          timeoutMs: 10 * Sec,
        });

        if (contractMaybe.timedout) {
          throw new Error(
            `Setup lifecycle of "${pluginName}" plugin wasn't completed in 10sec. Consider disabling the plugin and re-start.`
          );
        } else {
          contract = contractMaybe.value;
        }
      } else {
        contract = contractOrPromise;
      }

      contracts.set(pluginName, contract);
      this.satupPlugins.push(pluginName);
    }

    this.runtimeResolver.resolveSetupRequests(contracts);

    return contracts;
  }

  public async startPlugins(deps: PluginsServiceStartDeps) {
    if (this.type === PluginType.preboot) {
      throw new Error('Preboot plugins cannot be started.');
    }

    const contracts = new Map<PluginName, unknown>();
    if (this.satupPlugins.length === 0) {
      return contracts;
    }

    this.log.info(`Starting [${this.satupPlugins.length}] plugins: [${[...this.satupPlugins]}]`);

    // Awaiting a lazy plugin's deferred phases (via `loadPluginContract`/`trigger`) from inside
    // `start()` would block this loop and defeat lazy initialization, so the engine rejects such
    // calls while the start cycle is active. Cleared in `finally` so a thrown `start()` can't leave
    // the flag stuck for post-boot callers.
    this.deferredInitEngine?.beginStartCycle();
    try {
      for (const pluginName of this.satupPlugins) {
        const plugin = this.plugins.get(pluginName)!;
        const pluginDeps = new Set([...plugin.requiredPlugins, ...plugin.optionalPlugins]);
        const pluginDepContracts = Array.from(pluginDeps).reduce((depContracts, dependencyName) => {
          // Only set if present. Could be absent if plugin does not have server-side code or is a
          // missing optional dependency.
          if (contracts.has(dependencyName)) {
            depContracts[dependencyName] = contracts.get(dependencyName);
          }

          return depContracts;
        }, {} as Record<PluginName, unknown>);
        const startContext = createPluginStartContext({
          deps,
          plugin,
          runtimeResolver: this.runtimeResolver,
        });

        // A lazy plugin's `start()` is not part of boot. Its dependencies have all started by now
        // (topological order, and lazy plugins cannot themselves be dependencies), so everything
        // `lazyInitialize()`/`start()` will need is captured here and handed to the engine, which
        // runs the two on this instance's first trigger. Attaching the runner before the loop
        // moves on matters: a dependent may call `loadPluginContract` for this plugin from a
        // request that arrives before the loop finishes.
        if (this.deferredInitEngine && plugin.enableLazyInitialize) {
          this.log.debug(`Deferring start of lazy plugin "${pluginName}" to its first trigger...`);
          this.attachDeferredRunner(
            this.deferredInitEngine,
            plugin,
            startContext,
            pluginDepContracts
          );
          continue;
        }

        this.log.debug(`Starting plugin "${pluginName}"...`);
        let contract: unknown;
        const contractOrPromise = plugin.start(startContext, pluginDepContracts);
        if (isPromise(contractOrPromise)) {
          if (this.coreContext.env.mode.dev) {
            this.log.warn(
              `Plugin ${pluginName} is using asynchronous start lifecycle. Asynchronous plugins support will be removed in a later version.`
            );
          }
          const contractMaybe = await withTimeout({
            promise: contractOrPromise,
            timeoutMs: 10 * Sec,
          });

          if (contractMaybe.timedout) {
            throw new Error(
              `Start lifecycle of "${pluginName}" plugin wasn't completed in 10sec. Consider disabling the plugin and re-start.`
            );
          } else {
            contract = contractMaybe.value;
          }
        } else {
          contract = contractOrPromise;
        }

        contracts.set(pluginName, contract);
        // Unblocks any dependent whose own `start()` is mid-loop, already awaiting this plugin's
        // contract via `onStart` — otherwise that dependent would have to wait for the whole loop
        // (including its own `start()` call) to finish, which can't happen.
        this.runtimeResolver.notifyStartContractAvailable(pluginName, contract);
      }
    } finally {
      this.deferredInitEngine?.endStartCycle();
    }

    this.runtimeResolver.resolveStartRequests(contracts);
    this.triggerLazyPluginsOnHeadlessNode();

    return contracts;
  }

  /**
   * Hands the engine the two deferred phases of a lazy plugin, bound to the start context and
   * dependency contracts the boot loop just computed for it. Neither runs here.
   */
  private attachDeferredRunner(
    engine: DeferredInitEngine,
    plugin: PluginWrapper,
    startContext: CoreStart,
    pluginDepContracts: Record<PluginName, unknown>
  ): void {
    const pluginName = plugin.name;
    engine.setRunner(pluginName, {
      lazyInitialize: () => plugin.runLazyInitialize(startContext, pluginDepContracts),
      start: async () => {
        this.log.debug(`Starting lazy plugin "${pluginName}"...`);
        const contract = await plugin.start(startContext, pluginDepContracts);
        // Published before the engine flips to `available`, so a `loadPluginContract` or
        // `onLazyStartService` that wakes up on that transition finds the contract in place.
        this.runtimeResolver.notifyStartContractAvailable(pluginName, contract);
      },
    });
  }

  /**
   * A node without the `ui` role serves no pages and no UI-driven API calls, so nothing would
   * ever trigger its lazy plugins; their background tasks would be claimed and skipped forever.
   * There is nothing worth deferring on such a node, so kick every lazy plugin now that boot is
   * done. Non-blocking: the phases run concurrently with the rest of core's start.
   */
  private triggerLazyPluginsOnHeadlessNode(): void {
    if (!this.deferredInitEngine || this.nodeRoles === undefined || this.nodeRoles.ui) {
      return;
    }
    const lazyPluginNames = this.satupPlugins.filter(
      (pluginName) => this.plugins.get(pluginName)!.enableLazyInitialize
    );
    if (lazyPluginNames.length === 0) {
      return;
    }
    this.log.info(
      `This node has no "ui" role, so no request can trigger its lazy plugins; triggering [${lazyPluginNames.join(
        ','
      )}] now.`
    );
    for (const pluginName of lazyPluginNames) {
      this.deferredInitEngine.ensureInitialized(pluginName);
    }
  }

  public async stopPlugins() {
    if (this.plugins.size === 0 || this.satupPlugins.length === 0) {
      return;
    }

    this.log.info(`Stopping all plugins.`);

    const reverseDependencyMap = buildReverseDependencyMap(this.plugins);
    const pluginStopPromiseMap = new Map<PluginName, Promise<void>>();
    for (let i = this.satupPlugins.length - 1; i > -1; i--) {
      const pluginName = this.satupPlugins[i];
      const plugin = this.plugins.get(pluginName)!;
      const pluginDependant = reverseDependencyMap.get(pluginName)!;
      const dependantPromises = pluginDependant.map(
        (dependantName) => pluginStopPromiseMap.get(dependantName)!
      );

      // Stop plugin as soon as all the dependant plugins are stopped.
      const pluginStopPromise = Promise.all(dependantPromises).then(async () => {
        this.log.debug(`Stopping plugin "${pluginName}"...`);

        try {
          const resultMaybe = await withTimeout({
            promise: plugin.stop(),
            timeoutMs: 15 * Sec,
          });
          if (resultMaybe?.timedout) {
            this.log.warn(`"${pluginName}" plugin didn't stop in 15sec., move on to the next.`);
          }
        } catch (e) {
          this.log.warn(`"${pluginName}" thrown during stop: ${e}`);
        }
      });
      pluginStopPromiseMap.set(pluginName, pluginStopPromise);
    }

    await Promise.allSettled(pluginStopPromiseMap.values());

    this.log.info(`All plugins stopped.`);
  }

  /**
   * Get a Map of all discovered UI plugins in topological order.
   */
  public uiPlugins() {
    const uiPluginNames = [...this.getTopologicallySortedPluginNames().keys()].filter(
      (pluginName) => this.plugins.get(pluginName)!.includesUiPlugin
    );
    const filterUiPlugins = (pluginName: string) => uiPluginNames.includes(pluginName);
    const publicPlugins = new Map<PluginName, DiscoveredPlugin>(
      uiPluginNames.map((pluginName) => {
        const plugin = this.plugins.get(pluginName)!;
        return [
          pluginName,
          {
            id: pluginName,
            type: plugin.manifest.type,
            configPath: plugin.manifest.configPath,
            requiredPlugins: plugin.manifest.requiredPlugins.filter(filterUiPlugins),
            optionalPlugins: plugin.manifest.optionalPlugins.filter(filterUiPlugins),
            runtimePluginDependencies: plugin.manifest.runtimePluginDependencies,
            requiredBundles: plugin.manifest.requiredBundles,
            enabledOnAnonymousPages: plugin.manifest.enabledOnAnonymousPages,
            enableLazyInitialize: plugin.manifest.enableLazyInitialize,
          },
        ];
      })
    );

    return publicPlugins;
  }

  private getTopologicallySortedPluginNames() {
    if (!this.sortedPluginNames) {
      this.sortedPluginNames = getTopologicallySortedPluginNames(this.plugins);
    }
    return this.sortedPluginNames;
  }
}

/**
 * Gets topologically sorted plugin names that are registered with the plugin system.
 * Ordering is possible if and only if the plugins graph has no directed cycles,
 * that is, if it is a directed acyclic graph (DAG). If plugins cannot be ordered
 * an error is thrown.
 *
 * Uses Kahn's Algorithm to sort the graph.
 */
const getTopologicallySortedPluginNames = (plugins: Map<PluginName, PluginWrapper>) => {
  // We clone plugins so we can remove handled nodes while we perform the
  // topological ordering. If the cloned graph is _not_ empty at the end, we
  // know we were not able to topologically order the graph. We exclude optional
  // dependencies that are not present in the plugins graph.
  const pluginsDependenciesGraph = new Map(
    [...plugins.entries()].map(([pluginName, plugin]) => {
      return [
        pluginName,
        new Set([
          ...plugin.requiredPlugins,
          ...plugin.optionalPlugins.filter((dependency) => plugins.has(dependency)),
        ]),
      ] as [PluginName, Set<PluginName>];
    })
  );

  // First, find a list of "start nodes" which have no outgoing edges. At least
  // one such node must exist in a non-empty acyclic graph.
  const pluginsWithAllDependenciesSorted = [...pluginsDependenciesGraph.keys()].filter(
    (pluginName) => pluginsDependenciesGraph.get(pluginName)!.size === 0
  );

  const sortedPluginNames = new Set<PluginName>();
  while (pluginsWithAllDependenciesSorted.length > 0) {
    const sortedPluginName = pluginsWithAllDependenciesSorted.pop()!;

    // We know this plugin has all its dependencies sorted, so we can remove it
    // and include into the final result.
    pluginsDependenciesGraph.delete(sortedPluginName);
    sortedPluginNames.add(sortedPluginName);

    // Go through the rest of the plugins and remove `sortedPluginName` from their
    // unsorted dependencies.
    for (const [pluginName, dependencies] of pluginsDependenciesGraph) {
      // If we managed delete `sortedPluginName` from dependencies let's check
      // whether it was the last one and we can mark plugin as sorted.
      if (dependencies.delete(sortedPluginName) && dependencies.size === 0) {
        pluginsWithAllDependenciesSorted.push(pluginName);
      }
    }
  }

  if (pluginsDependenciesGraph.size > 0) {
    // Identify circular dependencies
    let cyclePaths: string[] = [];

    try {
      const circularDependencies = findCircularDependencies(pluginsDependenciesGraph);

      cyclePaths = circularDependencies.map((cycle) => `\n  ${cycle.join(' -> ')} -> ${cycle[0]}`);
    } catch (e) {
      cyclePaths = [];
    }

    const edgesLeft = JSON.stringify([...pluginsDependenciesGraph.keys()]);

    throw new Error(
      `Topological ordering of plugins did not complete due to circular dependencies:` +
        `${
          cyclePaths.length > 0 ? `\n\nDetected circular dependencies:${cyclePaths.join('')}` : ''
        }` +
        `\n\nPlugins with cyclic or missing dependencies: ${edgesLeft}`
    );
  }

  return sortedPluginNames;
};

const buildReverseDependencyMap = (
  pluginMap: Map<PluginName, PluginWrapper>
): Map<PluginName, PluginName[]> => {
  const reverseMap = new Map<PluginName, PluginName[]>();
  for (const pluginName of pluginMap.keys()) {
    reverseMap.set(pluginName, []);
  }
  for (const [pluginName, pluginWrapper] of pluginMap.entries()) {
    const allDependencies = [...pluginWrapper.requiredPlugins, ...pluginWrapper.optionalPlugins];
    for (const dependency of allDependencies) {
      // necessary to evict non-present optional dependency
      if (pluginMap.has(dependency)) {
        reverseMap.get(dependency)!.push(pluginName);
      }
    }
    reverseMap.set(pluginName, []);
  }
  return reverseMap;
};

/**
 * Deferred initialization is a server-side concern -- the engine only ever registers a plugin
 * during the server `setup()` loop -- so a plugin without server code cannot be lazy no matter
 * what its manifest says, and must not constrain how others depend on it.
 */
const collectLazyPluginNames = (pluginMap: Map<PluginName, PluginWrapper>): Set<PluginName> =>
  new Set(
    [...pluginMap.values()]
      .filter((plugin) => plugin.enableLazyInitialize && plugin.includesServerPlugin)
      .map(({ name }) => name)
  );

/**
 * Rejects, at boot, any plugin that declares a deferred-init plugin as a required or optional
 * dependency. Core builds the `plugins` argument of `setup()`/`start()` from those two lists
 * alone, so such a declaration hands the dependent a start contract whose Elasticsearch-backed
 * state has not been initialized yet, with nothing at the call site to signal it. Declaring the
 * dependency under `runtimePluginDependencies` instead keeps it out of that argument entirely --
 * and out of the topological sort, so a lazy plugin no longer dictates its dependents' boot order
 * -- while still permitting `core.plugins.loadPluginContract()`, which waits for the deferred init
 * to finish before handing the contract over.
 *
 * Only dependents that ship server code are checked: `requiredPlugins` is shared by both sides of
 * a plugin, and a browser-only dependent is never handed a server contract, so forbidding the
 * declaration there would reject a perfectly safe dependency on the lazy plugin's browser
 * contract.
 */
const assertLazyPluginsAreNotInjectedDependencies = (
  pluginMap: Map<PluginName, PluginWrapper>,
  lazyPluginNames: ReadonlySet<PluginName>
): void => {
  if (!lazyPluginNames.size) {
    return;
  }

  const violations: string[] = [];
  for (const [pluginName, plugin] of pluginMap) {
    if (!plugin.includesServerPlugin) {
      continue;
    }
    for (const dependencyName of new Set([...plugin.requiredPlugins, ...plugin.optionalPlugins])) {
      if (lazyPluginNames.has(dependencyName)) {
        violations.push(`"${pluginName}" -> "${dependencyName}"`);
      }
    }
  }

  if (violations.length) {
    throw new Error(
      `Plugins that opt into deferred initialization cannot be declared as required or optional ` +
        `dependencies, because core would then inject their uninitialized start contract into the ` +
        `dependent's setup()/start(). Offending dependencies: ${violations.join(
          ', '
        )}. Move each ` +
        `of these to "runtimePluginDependencies" in the dependent's kibana.jsonc, and read the ` +
        `contract with "await core.plugins.loadPluginContract(<dependency>)" from a route handler, ` +
        `a task runner, or another post-boot code path.`
    );
  }
};

const buildPluginRuntimeDependencyMap = (
  pluginMap: Map<PluginName, PluginWrapper>
): Map<PluginName, Set<PluginName>> => {
  const runtimeDependencies = new Map<PluginName, Set<PluginName>>();
  for (const [pluginName, pluginWrapper] of pluginMap.entries()) {
    const pluginRuntimeDeps = new Set([
      ...pluginWrapper.optionalPlugins,
      ...pluginWrapper.requiredPlugins,
      ...pluginWrapper.runtimePluginDependencies,
    ]);
    runtimeDependencies.set(pluginName, pluginRuntimeDeps);
  }
  return runtimeDependencies;
};

/**
 * Finds all circular dependencies in the plugin graph
 * @param dependencyGraph Map of plugin names to their unresolved dependencies
 * @returns Array of circular dependency paths
 */
export const findCircularDependencies = (
  dependencyGraph: Map<PluginName, Set<PluginName>>
): PluginName[][] => {
  // Store found cycles as a set of stringified paths to avoid duplicates
  const cycleSet = new Set<string>();
  const cycles: PluginName[][] = [];

  // Find all cycles for each node in the graph
  for (const startNode of dependencyGraph.keys()) {
    // Track visited and recursion stack for this specific search
    const visited = new Set<PluginName>();
    const recursionStack = new Set<PluginName>();
    const path: PluginName[] = [];

    const dfs = (node: PluginName) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const dependencies = dependencyGraph.get(node) || new Set<PluginName>();

      for (const dependency of dependencies) {
        // If we haven't visited this dependency yet, explore it
        if (!visited.has(dependency)) {
          dfs(dependency);
        }
        // If the dependency is in our current recursion path, we found a cycle
        else if (recursionStack.has(dependency)) {
          // Extract the cycle
          const cycleStartIndex = path.indexOf(dependency);
          if (cycleStartIndex !== -1) {
            const cycle = path.slice(cycleStartIndex);
            // Create a canonical representation by starting from alphabetically first node
            const normalizedCycle = normalizeCycle(cycle);

            // Add to cycles if not already seen
            const cycleKey = JSON.stringify(normalizedCycle);
            if (!cycleSet.has(cycleKey)) {
              cycleSet.add(cycleKey);
              cycles.push(cycle);
            }
          }
        }
      }

      // Backtrack
      path.pop();
      recursionStack.delete(node);
    };

    dfs(startNode);
  }

  return cycles;
};

/**
 * Normalizes a cycle by rotating it to start with the alphabetically first node
 * This helps identify duplicate cycles regardless of where we start traversing
 */
export const normalizeCycle = (cycle: PluginName[]): PluginName[] => {
  if (cycle.length <= 1) return cycle;
  if (new Set(cycle).size !== cycle.length) {
    throw new Error(`Cycle contains duplicate plugins: ${cycle}`);
  }

  // Find the index of the alphabetically first node
  let minIndex = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i].localeCompare(cycle[minIndex]) < 0) {
      minIndex = i;
    }
  }

  // Rotate the array to start with that node
  return [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
};
