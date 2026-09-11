/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import type { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { filter, map, tap, toArray } from 'rxjs';
import { getFlattenedObject } from '@kbn/std';

import type { Logger } from '@kbn/logging';
import type { IConfigService } from '@kbn/config';
import type { CoreContext, CoreService } from '@kbn/core-base-server-internal';
import { type PluginName, type PluginOpaqueId, PluginType } from '@kbn/core-base-common';
import type { InternalEnvironmentServicePreboot } from '@kbn/core-environment-server-internal';
import type { InternalNodeServicePreboot } from '@kbn/core-node-server-internal';
import type { InternalPluginInfo, UiPlugins } from '@kbn/core-plugins-base-server-internal';
import type {
  InternalCorePreboot,
  InternalCoreSetup,
  InternalCoreStart,
} from '@kbn/core-lifecycle-server-internal';
import type { PluginConfigDescriptor } from '@kbn/core-plugins-server';
import type { DiscoveredPlugin } from '@kbn/core-base-common';
import type { PluginDiscoveryError } from './discovery';
import { discover, PluginDiscoveryErrorType } from './discovery';
import type { PluginWrapper } from './plugin';

import type { PluginDependencies } from './types';
import type { PluginsConfigType } from './plugins_config';
import { PluginsConfig } from './plugins_config';
import { PluginsSystem } from './plugins_system';
import { createBrowserConfig } from './create_browser_config';
import { DeferredInitEngine, registerDeferredInitStatusRoute } from './deferred_init';

/** @internal */
export type DiscoveredPlugins = {
  [key in PluginType]: {
    pluginTree: PluginDependencies;
    pluginPaths: string[];
    uiPlugins: UiPlugins;
  };
};

/** @internal */
export interface InternalPluginsServiceSetup {
  /** Indicates whether or not plugins were initialized. */
  initialized: boolean;
  /** Setup contracts returned by plugins. */
  contracts: Map<PluginName, unknown>;
}

/** @internal */
export interface InternalPluginsServiceStart {
  /** Start contracts returned by plugins. */
  contracts: Map<PluginName, unknown>;
}

/** @internal */
export type PluginsServicePrebootSetupDeps = InternalCorePreboot;

/** @internal */
export type PluginsServiceSetupDeps = InternalCoreSetup;

/** @internal */
export type PluginsServiceStartDeps = InternalCoreStart;

/** @internal */
export interface PluginsServiceDiscoverDeps {
  environment: InternalEnvironmentServicePreboot;
  node: InternalNodeServicePreboot;
}

/** @internal */
export class PluginsService
  implements CoreService<InternalPluginsServiceSetup, InternalPluginsServiceStart>
{
  private readonly log: Logger;
  private readonly prebootPluginsSystem: PluginsSystem<PluginType.preboot>;
  private arePrebootPluginsStopped = false;
  private readonly prebootUiPluginInternalInfo = new Map<PluginName, InternalPluginInfo>();
  private readonly standardPluginsSystem: PluginsSystem<PluginType.standard>;
  private readonly standardUiPluginInternalInfo = new Map<PluginName, InternalPluginInfo>();
  private readonly configService: IConfigService;
  private readonly config$: Observable<PluginsConfig>;
  private readonly pluginConfigDescriptors = new Map<PluginName, PluginConfigDescriptor>();
  private readonly pluginConfigUsageDescriptors = new Map<string, Record<string, any | any[]>>();
  private readonly deferredInitEngine: DeferredInitEngine;

  constructor(private readonly coreContext: CoreContext) {
    this.log = coreContext.logger.get('plugins-service');
    this.configService = coreContext.configService;
    this.config$ = coreContext.configService
      .atPath<PluginsConfigType>('plugins')
      .pipe(map((rawConfig) => new PluginsConfig(rawConfig, coreContext.env)));
    this.deferredInitEngine = new DeferredInitEngine(coreContext.logger.get('deferred-init'));
    this.prebootPluginsSystem = new PluginsSystem(this.coreContext, PluginType.preboot);
    this.standardPluginsSystem = new PluginsSystem(
      this.coreContext,
      PluginType.standard,
      this.deferredInitEngine
    );
  }

  /**
   * Backs `context.loadPluginContract()` for standard plugins' route handlers. Handed to the
   * context service at setup, which knows a route's owner only by opaque id. Preboot plugins are
   * excluded: no start contract exists during preboot.
   */
  public readonly loadPluginContractForRoute = (
    source: PluginOpaqueId,
    dependencyName: PluginName
  ): Promise<unknown> => {
    const contract = this.standardPluginsSystem.loadPluginContractFor(source, dependencyName);
    if (!contract) {
      return Promise.reject(
        new Error(
          `Cannot load the start contract of "${dependencyName}": context.loadPluginContract() ` +
            `is only available to routes registered by a standard plugin.`
        )
      );
    }
    return contract;
  };

  public async discover({
    environment,
    node,
  }: PluginsServiceDiscoverDeps): Promise<DiscoveredPlugins> {
    const config = await firstValueFrom(this.config$);

    const airgapped = await firstValueFrom(
      this.coreContext.configService.atPath<boolean>('airgapped')
    ).catch(() => false);

    const { error$, plugin$ } = discover({
      config,
      coreContext: this.coreContext,
      instanceInfo: {
        uuid: environment.instanceUuid,
        airgapped,
      },
      nodeInfo: {
        roles: node.roles,
      },
    });
    this.standardPluginsSystem.setNodeRoles(node.roles);

    await this.handleDiscoveryErrors(error$);
    await this.handleDiscoveredPlugins(plugin$);

    const prebootUiPlugins = this.prebootPluginsSystem.uiPlugins();
    const standardUiPlugins = this.standardPluginsSystem.uiPlugins();
    return {
      preboot: {
        pluginPaths: this.prebootPluginsSystem.getPlugins().map((plugin) => plugin.path),
        pluginTree: this.prebootPluginsSystem.getPluginDependencies(),
        uiPlugins: {
          internal: this.prebootUiPluginInternalInfo,
          public: prebootUiPlugins,
          browserConfigs: this.generateUiPluginsConfigs(prebootUiPlugins),
        },
      },
      standard: {
        pluginPaths: this.standardPluginsSystem.getPlugins().map((plugin) => plugin.path),
        pluginTree: this.standardPluginsSystem.getPluginDependencies(),
        uiPlugins: {
          internal: this.standardUiPluginInternalInfo,
          public: standardUiPlugins,
          browserConfigs: this.generateUiPluginsConfigs(standardUiPlugins),
        },
      },
    };
  }

  public getExposedPluginConfigsToUsage() {
    return this.pluginConfigUsageDescriptors;
  }

  public async preboot(deps: PluginsServicePrebootSetupDeps) {
    this.log.debug('Prebooting plugins service');

    const config = await firstValueFrom(this.config$);
    if (config.initialize) {
      await this.prebootPluginsSystem.setupPlugins(deps);
    } else {
      this.log.info(
        'Skipping `setup` for `preboot` plugins since plugin initialization is disabled.'
      );
    }
  }

  public async setup(deps: PluginsServiceSetupDeps) {
    this.log.debug('Setting up plugins service');

    const config = await firstValueFrom(this.config$);

    // Always-available core endpoint the initializing UI polls for deferred-init state.
    // Registered on a core router so it is never gated while a plugin is initializing.
    registerDeferredInitStatusRoute(deps.http.createRouter(''), this.deferredInitEngine);

    let contracts = new Map<PluginName, unknown>();
    if (config.initialize) {
      contracts = await this.standardPluginsSystem.setupPlugins(deps);
    } else {
      this.log.info(
        'Skipping `setup` for `standard` plugins since plugin initialization is disabled.'
      );
    }

    return {
      initialized: config.initialize,
      contracts,
    };
  }

  public async start(deps: PluginsServiceStartDeps) {
    this.log.debug('Plugins service starts plugins');

    const config = await firstValueFrom(this.config$);
    if (!config.initialize) {
      this.log.info(
        'Skipping `start` for `standard` plugins since plugin initialization is disabled.'
      );
      return { contracts: new Map() };
    }

    await this.prebootPluginsSystem.stopPlugins();
    this.arePrebootPluginsStopped = true;

    const contracts = await this.standardPluginsSystem.startPlugins(deps);
    return { contracts };
  }

  public async stop() {
    this.log.debug('Stopping plugins service');

    if (!this.arePrebootPluginsStopped) {
      this.arePrebootPluginsStopped = true;
      await this.prebootPluginsSystem.stopPlugins();
    }

    await this.standardPluginsSystem.stopPlugins();
  }

  private generateUiPluginsConfigs(
    uiPlugins: Map<string, DiscoveredPlugin>
  ): Map<PluginName, Observable<unknown>> {
    return new Map(
      [...uiPlugins]
        .filter(([pluginId, _]) => {
          const configDescriptor = this.pluginConfigDescriptors.get(pluginId);
          return (
            configDescriptor &&
            configDescriptor.exposeToBrowser &&
            Object.values(configDescriptor?.exposeToBrowser).some((exposed) => exposed)
          );
        })
        .map(([pluginId, plugin]) => {
          const configDescriptor = this.pluginConfigDescriptors.get(pluginId)!;
          return [
            pluginId,
            this.configService
              .atPath(plugin.configPath)
              .pipe(map((config: any) => createBrowserConfig(config, configDescriptor))),
          ];
        })
    );
  }

  private async handleDiscoveryErrors(error$: Observable<PluginDiscoveryError>) {
    // At this stage we report only errors that can occur when new platform plugin
    // manifest is present, otherwise we can't be sure that the plugin is for the new
    // platform and let legacy platform to handle it.
    const errorTypesToReport = [
      PluginDiscoveryErrorType.IncompatibleVersion,
      PluginDiscoveryErrorType.InvalidManifest,
    ];

    const errors = await firstValueFrom(
      error$.pipe(
        filter((error) => errorTypesToReport.includes(error.type)),
        tap((pluginError) => this.log.error(pluginError)),
        toArray()
      )
    );
    if (errors.length > 0) {
      throw new Error(
        `Failed to initialize plugins:${errors.map((err) => `\n\t${err.message}`).join('')}`
      );
    }
  }

  private async handleDiscoveredPlugins(plugin$: Observable<PluginWrapper>) {
    const pluginEnableStatuses = new Map<
      PluginName,
      { plugin: PluginWrapper; isEnabled: boolean }
    >();
    const plugins = await firstValueFrom(plugin$.pipe(toArray()));

    // Register config descriptors and deprecations
    await Promise.all(
      plugins.map(async (plugin) => {
        const configDescriptor = await plugin.getConfigDescriptor();
        if (configDescriptor) {
          this.pluginConfigDescriptors.set(plugin.name, configDescriptor);
          if (configDescriptor.deprecations) {
            this.coreContext.configService.addDeprecationProvider(
              plugin.configPath,
              configDescriptor.deprecations
            );
          }
          if (configDescriptor.exposeToUsage) {
            this.pluginConfigUsageDescriptors.set(
              Array.isArray(plugin.configPath) ? plugin.configPath.join('.') : plugin.configPath,
              getFlattenedObject(configDescriptor.exposeToUsage)
            );
          }
          if (configDescriptor.dynamicConfig) {
            const configKeys = Object.entries(getFlattenedObject(configDescriptor.dynamicConfig))
              .filter(([, value]) => value === true)
              .map(([key]) => key);
            if (configKeys.length > 0) {
              this.coreContext.configService.addDynamicConfigPaths(plugin.configPath, configKeys);
            }
          }
          this.coreContext.configService.setSchema(plugin.configPath, configDescriptor.schema);
        }
      })
    );

    const config = await firstValueFrom(this.config$);
    const enableAllPlugins = config.shouldEnableAllPlugins;
    if (enableAllPlugins) {
      this.log.warn('Detected override configuration; will enable all plugins');
    }

    // Validate config and handle enabled statuses.
    // NOTE: We can't do both in the same previous loop because some plugins' deprecations may affect others.
    // Hence, we need all the deprecations to be registered before accessing any config parameter.
    for (const plugin of plugins) {
      const isEnabled =
        enableAllPlugins ||
        (await this.coreContext.configService.isEnabledAtPath(plugin.configPath));

      if (pluginEnableStatuses.has(plugin.name)) {
        throw new Error(`Plugin with id "${plugin.name}" is already registered!`);
      }

      if (plugin.includesUiPlugin) {
        const uiPluginInternalInfo =
          plugin.manifest.type === PluginType.preboot
            ? this.prebootUiPluginInternalInfo
            : this.standardUiPluginInternalInfo;
        uiPluginInternalInfo.set(plugin.name, {
          requiredBundles: plugin.requiredBundles,
          version: plugin.manifest.version,
          publicTargetDir: Path.resolve(plugin.path, 'target/public'),
          publicAssetsDir: Path.resolve(plugin.path, 'public/assets'),
        });
      }

      pluginEnableStatuses.set(plugin.name, { plugin, isEnabled });
    }

    // Add the plugins to the Plugin System if enabled and its dependencies are met
    const disabledPlugins = [];
    const disabledDependants = [];
    const disabledDependantsCauses = new Set<string>();
    const pluginEnablementCache = new Map<PluginName, PluginEnablementResult>();

    for (const [pluginName, { plugin, isEnabled }] of pluginEnableStatuses) {
      this.validatePluginDependencies(plugin, pluginEnableStatuses);

      const pluginEnablement = shouldEnablePlugin({
        pluginName,
        pluginEnableStatuses,
        cache: pluginEnablementCache,
      });

      if (pluginEnablement.enabled) {
        if (plugin.manifest.type === PluginType.preboot) {
          this.prebootPluginsSystem.addPlugin(plugin);
        } else {
          this.standardPluginsSystem.addPlugin(plugin);
        }
      } else if (isEnabled) {
        disabledDependants.push(pluginName);
        pluginEnablement.missingOrIncompatibleDependencies.forEach((dependency) =>
          disabledDependantsCauses.add(dependency)
        );
      } else {
        disabledPlugins.push(pluginName);
      }
    }

    this.log.debug(`Discovered ${pluginEnableStatuses.size} plugins.`);
    if (disabledPlugins.length) {
      this.log.info(`The following plugins are disabled: "${disabledPlugins}".`);
    }
    if (disabledDependants.length) {
      this.log.info(
        `Plugins "${disabledDependants}" have been disabled since the following direct or transitive dependencies are missing, disabled, or have incompatible types: [${Array.from(
          disabledDependantsCauses
        )}].`
      );
    }
  }

  /** Throws an error if the plugin's dependencies are invalid. */
  private validatePluginDependencies(
    plugin: PluginWrapper,
    pluginEnableStatuses: Map<PluginName, { plugin: PluginWrapper; isEnabled: boolean }>
  ) {
    const { name, manifest, requiredBundles, requiredPlugins } = plugin;

    // validate that `requiredBundles` ids point to a discovered plugin which `includesUiPlugin`
    for (const requiredBundleId of requiredBundles) {
      if (!pluginEnableStatuses.has(requiredBundleId)) {
        throw new Error(
          `Plugin bundle with id "${requiredBundleId}" is required by plugin "${name}" but it is missing.`
        );
      }

      const requiredPlugin = pluginEnableStatuses.get(requiredBundleId)!.plugin;
      if (!requiredPlugin.includesUiPlugin) {
        throw new Error(
          `Plugin bundle with id "${requiredBundleId}" is required by plugin "${name}" but it doesn't have a UI bundle.`
        );
      }

      if (requiredPlugin.manifest.type !== plugin.manifest.type) {
        throw new Error(
          `Plugin bundle with id "${requiredBundleId}" is required by plugin "${name}" and expected to have "${manifest.type}" type, but its type is "${requiredPlugin.manifest.type}".`
        );
      }
    }

    // validate that OSS plugins do not have required dependencies on X-Pack plugins
    if (plugin.source === 'oss') {
      for (const id of [...requiredPlugins, ...requiredBundles]) {
        const requiredPlugin = pluginEnableStatuses.get(id);
        if (requiredPlugin && requiredPlugin.plugin.source === 'x-pack') {
          throw new Error(
            `X-Pack plugin or bundle with id "${id}" is required by OSS plugin "${name}", which is prohibited. Consider making this an optional dependency instead.`
          );
        }
      }
    }
  }
}

type PluginEnablementResult =
  | { enabled: true }
  | { enabled: false; missingOrIncompatibleDependencies: string[] };

function shouldEnablePlugin({
  pluginName,
  pluginEnableStatuses,
  cache,
  parents = [],
}: {
  pluginName: PluginName;
  pluginEnableStatuses: Map<PluginName, { plugin: PluginWrapper; isEnabled: boolean }>;
  cache: Map<PluginName, PluginEnablementResult>;
  parents?: PluginName[];
}): PluginEnablementResult {
  const cachedValue = cache.get(pluginName);
  if (cachedValue) {
    return cachedValue;
  }

  const pluginInfo = pluginEnableStatuses.get(pluginName);

  let result: PluginEnablementResult;
  if (pluginInfo === undefined || !pluginInfo.isEnabled) {
    result = {
      enabled: false,
      missingOrIncompatibleDependencies: [],
    };
  } else {
    const missingOrIncompatibleDependencies = pluginInfo.plugin.requiredPlugins
      .filter((dep) => !parents.includes(dep))
      .filter(
        (dependencyName) =>
          pluginEnableStatuses.get(dependencyName)?.plugin.manifest.type !==
            pluginInfo.plugin.manifest.type ||
          !shouldEnablePlugin({
            pluginName: dependencyName,
            pluginEnableStatuses,
            parents: [...parents, pluginName],
            cache,
          }).enabled
      );

    if (missingOrIncompatibleDependencies.length === 0) {
      result = {
        enabled: true,
      };
    } else {
      result = {
        enabled: false,
        missingOrIncompatibleDependencies,
      };
    }
  }

  cache.set(pluginName, result);
  return result;
}
