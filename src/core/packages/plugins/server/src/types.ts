/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { Type } from '@kbn/config-schema';
import type { RecursiveReadonly, MaybePromise } from '@kbn/utility-types';
import type { PathConfigType } from '@kbn/utils';
import type { LoggerFactory } from '@kbn/logging';
import type {
  ConfigPath,
  EnvironmentMode,
  PackageInfo,
  ConfigDeprecationProvider,
} from '@kbn/config';
import type { PluginName, PluginOpaqueId, PluginType } from '@kbn/core-base-common';
import type { NodeInfo } from '@kbn/core-node-server';
import type { ElasticsearchConfigType } from '@kbn/core-elasticsearch-server-internal';
import type { SavedObjectsConfigType } from '@kbn/core-saved-objects-base-server-internal';
import type { CorePreboot, CoreSetup, CoreStart } from '@kbn/core-lifecycle-server';
import type { SharedGlobalConfigKeys } from './shared_global_config';
type Maybe<T> = T | undefined;

/**
 * Dedicated type for plugin configuration schema.
 *
 * @public
 */
export type PluginConfigSchema<T> = Type<T>;

/**
 * Type defining the list of configuration properties that will be exposed on the client-side
 * Object properties can either be fully exposed or narrowed down to specific keys.
 *
 * @public
 */
export type ExposedToBrowserDescriptor<T> = {
  [Key in keyof T]?: T[Key] extends Maybe<any[]>
    ? // handles arrays as primitive values
      boolean
    : T[Key] extends Maybe<object>
    ? // can be nested for objects
      ExposedToBrowserDescriptor<T[Key]> | boolean
    : // primitives
      boolean;
};

/**
 * Type defining the list of configuration properties that can be dynamically updated
 * Object properties can either be fully exposed or narrowed down to specific keys.
 *
 * @public
 */
export type DynamicConfigDescriptor<T> = {
  [Key in keyof T]?: T[Key] extends Maybe<any[]>
    ? // handles arrays as primitive values
      boolean
    : T[Key] extends Maybe<object>
    ? // can be nested for objects
      DynamicConfigDescriptor<T[Key]> | boolean
    : // primitives
      boolean;
};

/**
 * Describes a plugin configuration properties.
 *
 * @example
 * ```typescript
 * // my_plugin/server/index.ts
 * import { schema, TypeOf } from '@kbn/config-schema';
 * import { PluginConfigDescriptor } from '@kbn/core/server';
 *
 * const configSchema = schema.object({
 *   secret: schema.string({ defaultValue: 'Only on server' }),
 *   uiProp: schema.string({ defaultValue: 'Accessible from client' }),
 * });
 *
 * type ConfigType = TypeOf<typeof configSchema>;
 *
 * export const config: PluginConfigDescriptor<ConfigType> = {
 *   exposeToBrowser: {
 *     uiProp: true,
 *   },
 *   schema: configSchema,
 *   deprecations: ({ rename, unused }) => [
 *     rename('securityKey', 'secret'),
 *     unused('deprecatedProperty'),
 *   ],
 * };
 * ```
 *
 * @public
 */
export interface PluginConfigDescriptor<T = any> {
  /**
   * Provider for the {@link ConfigDeprecation} to apply to the plugin configuration.
   */
  deprecations?: ConfigDeprecationProvider;
  /**
   * List of configuration properties that will be available on the client-side plugin.
   */
  exposeToBrowser?: ExposedToBrowserDescriptor<T>;
  /**
   * List of configuration properties that can be dynamically changed via the PUT /internal/core/_settings API.
   */
  dynamicConfig?: DynamicConfigDescriptor<T>;
  /**
   * Schema to use to validate the plugin configuration.
   *
   * {@link PluginConfigSchema}
   */
  schema: PluginConfigSchema<T>;
  /**
   * Expose non-default configs to usage collection to be sent via telemetry.
   * set a config to `true` to report the actual changed config value.
   * set a config to `false` to report the changed config value as [redacted].
   *
   * All changed configs except booleans and numbers will be reported
   * as [redacted] unless otherwise specified.
   *
   * {@link MakeUsageFromSchema}
   */
  exposeToUsage?: MakeUsageFromSchema<T>;
}

/**
 * List of configuration values that will be exposed to usage collection.
 * If parent node or actual config path is set to `true` then the actual value
 * of these configs will be reoprted.
 * If parent node or actual config path is set to `false` then the config
 * will be reported as [redacted].
 *
 * @public
 */
export type MakeUsageFromSchema<T> = {
  [Key in keyof T]?: T[Key] extends Maybe<object[]>
    ? // arrays of objects are always redacted
      false
    : T[Key] extends Maybe<any[]>
    ? boolean
    : T[Key] extends Maybe<object>
    ? MakeUsageFromSchema<T[Key]> | boolean
    : boolean;
};

/**
 * Describes the set of required and optional properties plugin can define in its
 * mandatory JSON manifest file.
 *
 * @remarks
 * Should never be used in code outside of Core but is exported for
 * documentation purposes.
 *
 * @public
 */
export interface PluginManifest {
  /**
   * Identifier of the plugin. Must be a string in camelCase. Part of a plugin public contract.
   * Other plugins leverage it to access plugin API, navigate to the plugin, etc.
   */
  readonly id: PluginName;

  /**
   * Version of the plugin.
   */
  readonly version: string;

  /**
   * The version of Kibana the plugin is compatible with, defaults to "version".
   */
  readonly kibanaVersion: string;

  /**
   * Type of the plugin, defaults to `standard`.
   */
  readonly type: PluginType;

  /**
   * Root {@link ConfigPath | configuration path} used by the plugin, defaults
   * to "id" in snake_case format.
   *
   * @example
   * id: myPlugin
   * configPath: my_plugin
   */
  readonly configPath: ConfigPath;

  /**
   * An optional list of the other plugins that **must be** installed and enabled
   * for this plugin to function properly.
   */
  readonly requiredPlugins: readonly PluginName[];

  /**
   * List of plugin ids that this plugin's UI code imports modules from that are
   * not in `requiredPlugins`.
   *
   * @remarks
   * The plugins listed here will be loaded in the browser, even if the plugin is
   * disabled. Required by `@kbn/optimizer` to support cross-plugin imports.
   * "core" and plugins already listed in `requiredPlugins` do not need to be
   * duplicated here.
   */
  readonly requiredBundles: readonly string[];

  /**
   * An optional list of the other plugins that if installed and enabled **may be**
   * leveraged by this plugin for some additional functionality but otherwise are
   * not required for this plugin to work properly.
   */
  readonly optionalPlugins: readonly PluginName[];

  /**
   * An optional list of plugin dependencies that can be resolved dynamically at runtime
   * using the dynamic contract resolving capabilities from the plugin service.
   */
  readonly runtimePluginDependencies: readonly string[];

  /**
   * Specifies whether plugin includes some client/browser specific functionality
   * that should be included into client bundle via `public/ui_plugin.js` file.
   */
  readonly ui: boolean;

  /**
   * Specifies whether plugin includes some server-side specific functionality.
   */
  readonly server: boolean;

  /**
   * Specifies directory names that can be imported by other ui-plugins built
   * using the same instance of the @kbn/optimizer. A temporary measure we plan
   * to replace with better mechanisms for sharing static code between plugins
   * @deprecated To be deleted when https://github.com/elastic/kibana/issues/101948 is done.
   */
  readonly extraPublicDirs?: string[];

  /**
   * Only used for the automatically generated API documentation. Specifying service
   * folders will cause your plugin API reference to be broken up into sub sections.
   */
  readonly serviceFolders?: readonly string[];

  readonly owner: {
    /**
     * The name of the team that currently owns this plugin.
     */
    readonly name: string;
    /**
     * All internal plugins should have a github team specified. GitHub teams can be viewed here:
     * https://github.com/orgs/elastic/teams
     */
    readonly githubTeam?: string;
  };

  /**
   * TODO: make required once all plugins specify this.
   * A brief description of what this plugin does and any capabilities it provides.
   */
  readonly description?: string;

  /**
   * Specifies whether this plugin - and its required dependencies - will be enabled for anonymous pages (login page, status page when
   * configured, etc.) Default is false.
   */
  readonly enabledOnAnonymousPages?: boolean;

  /**
   * Opt this plugin into core-managed lazy initialization. See {@link Plugin.lazyInitialize}.
   * Default is false.
   *
   * When set, only `setup()` runs at boot. `lazyInitialize()` and then `start()` run on this
   * instance's first trigger: a hit on one of the plugin's routes, its browser app loading,
   * another plugin calling `loadPluginContract()`, or the plugin itself calling
   * `core.plugins.lazyInit.trigger()`.
   *
   * @remarks
   * Once set, no other plugin may list this one under `requiredPlugins` or `optionalPlugins` --
   * core rejects that at boot. Those two lists are what core injects into a dependent's
   * `setup()`/`start()` arguments, and there is no start contract to inject until the deferred
   * `start()` has run. Dependents must declare this plugin under `runtimePluginDependencies` and
   * read its start contract with `core.plugins.loadPluginContract()`, which triggers and waits,
   * or observe it without triggering via `core.plugins.lazyInit`.
   */
  readonly enableLazyInitialize?: boolean;
}

/**
 * The interface that should be returned by a `PluginInitializer` for a `preboot` plugin.
 *
 * @public
 */
export interface PrebootPlugin<TSetup = void, TPluginsSetup extends object = object> {
  setup(core: CorePreboot, plugins: TPluginsSetup): TSetup;

  stop?(): void;
}

/**
 * The interface that should be returned by a `PluginInitializer` for a `standard` plugin.
 *
 * @public
 */
export interface Plugin<
  TSetup = void,
  TStart = void,
  TPluginsSetup extends Record<string, any> = {},
  TPluginsStart extends Record<string, any> = {}
> {
  setup(core: CoreSetup<TPluginsStart, TStart>, plugins: TPluginsSetup): TSetup;

  start(core: CoreStart, plugins: TPluginsStart): TStart;

  /**
   * Not invoked for a lazy plugin whose deferred `start()` never ran on this instance: there is
   * nothing start-time to tear down, and `setup()`-time registrations need no cleanup.
   */
  stop?(): MaybePromise<void>;

  /**
   * The plugin's costly, Elasticsearch-backed initialization. Only invoked by core when the
   * plugin's manifest sets `enableLazyInitialize: true` (see {@link PluginManifest}). For such a
   * plugin the lifecycle is `setup()` at boot, then on this instance's first trigger
   * `lazyInitialize()` followed by `start()`. Nothing else in the plugin runs before that, so
   * `start()` can build its contract over initialized state without readiness checks, and
   * `core.getStartServices()` resolves only once both phases have completed here.
   *
   * Receives the same arguments as `start()`: every non-lazy dependency has started by the time
   * this runs, so their contracts are injected as usual.
   *
   * @remarks
   * Runs once per Kibana instance, not once per deployment: core tracks the state in memory, the
   * same way it tracks any plugin's `/status` entry, so every instance behind a load balancer
   * runs this on its own first trigger. That is what lets it set up instance-local preconditions
   * (downloading a binary, warming an in-process cache), but it also means the implementation
   * must tolerate several instances running it concurrently against the same cluster: make the
   * Elasticsearch work idempotent (create-if-missing rather than blind create).
   *
   * A throw is retried on a jittered exponential backoff, and once background retries are spent,
   * on the next trigger. Success is sticky: if the deferred `start()` that follows throws, only
   * `start()` is re-run on the next attempt.
   *
   * Do not do this work from `setup()` (for example behind `getStartServices().then(...)`), and do
   * not make setup-registered callbacks that run on other plugins' traffic (task runners,
   * capabilities switchers, usage collectors) await this plugin's own start. They must check
   * `core.plugins.lazyInit.getStatus()` and no-op instead, or explicitly `trigger()`.
   *
   * @public
   */
  lazyInitialize?(core: CoreStart, plugins: TPluginsStart): Promise<void>;
}

/**
 * @public
 */
export type SharedGlobalConfig = RecursiveReadonly<{
  elasticsearch: Pick<
    ElasticsearchConfigType,
    (typeof SharedGlobalConfigKeys.elasticsearch)[number]
  >;
  path: Pick<PathConfigType, (typeof SharedGlobalConfigKeys.path)[number]>;
  savedObjects: Pick<SavedObjectsConfigType, (typeof SharedGlobalConfigKeys.savedObjects)[number]>;
}>;

/**
 * Context that's available to plugins during initialization stage.
 *
 * @public
 */
export interface PluginInitializerContext<ConfigSchema = unknown> {
  opaqueId: PluginOpaqueId;
  env: {
    mode: EnvironmentMode;
    packageInfo: Readonly<PackageInfo>;
    instanceUuid: string;
    configs: readonly string[];
    airgapped: boolean;
  };
  /**
   * Access the configuration for this particular Kibana node.
   * Can be used to determine which `roles` the current process was started with.
   *
   * @example
   * ```typescript
   * // plugins/my-plugin/server/plugin.ts
   *
   * export class MyPlugin implements Plugin  {
   *   constructor(private readonly initContext: PluginInitializerContext) {
   *     this.initContext = initContext;
   *   }
   *   setup() {
   *     if (this.initContext.node.roles.backgroundTasks) {
   *       // run background tasks
   *     } else if (this.initContext.node.roles.ui) {
   *       // register http routes, etc
   *     }
   *   }
   * }
   * ```
   */
  node: NodeInfo;
  /**
   * {@link LoggerFactory | logger factory} instance already bound to the plugin's logging context
   *
   * @example
   * ```typescript
   * // plugins/my-plugin/server/plugin.ts
   * // "id: myPlugin" in `plugins/my-plugin/kibana.yaml`
   *
   * export class MyPlugin implements Plugin  {
   *   constructor(private readonly initContext: PluginInitializerContext) {
   *     this.logger = initContext.logger.get();
   *     // `logger` context: `plugins.myPlugin`
   *     this.mySubLogger = initContext.logger.get('sub'); // or this.logger.get('sub');
   *     // `mySubLogger` context: `plugins.myPlugin.sub`
   *   }
   * }
   * ```
   */
  logger: LoggerFactory;
  /**
   * Accessors for the plugin's configuration
   */
  config: {
    /**
     * Provide access to Kibana legacy configuration values.
     *
     * @remarks Naming not final here, it may be renamed in a near future
     * @deprecated Accessing configuration values outside of the plugin's config scope is highly discouraged.
     * Can be removed when https://github.com/elastic/kibana/issues/119862 is done.
     */
    legacy: {
      globalConfig$: Observable<SharedGlobalConfig>;
      get: () => SharedGlobalConfig;
    };
    /**
     * Return an observable of the plugin's configuration
     *
     * @example
     * ```typescript
     * // plugins/my-plugin/server/plugin.ts
     *
     * export class MyPlugin implements Plugin {
     *   constructor(private readonly initContext: PluginInitializerContext) {}
     *   setup(core) {
     *     this.configSub = this.initContext.config.create<MyPluginConfigType>().subscribe((config) => {
     *       this.myService.reconfigure(config);
     *     });
     *   }
     *   stop() {
     *     this.configSub.unsubscribe();
     *   }
     * ```
     *
     * @example
     * ```typescript
     * // plugins/my-plugin/server/plugin.ts
     *
     * export class MyPlugin implements Plugin {
     *   constructor(private readonly initContext: PluginInitializerContext) {}
     *   async setup(core) {
     *     this.config = await this.initContext.config.create<MyPluginConfigType>().pipe(take(1)).toPromise();
     *   }
     *   stop() {
     *     this.configSub.unsubscribe();
     *   }
     * ```
     *
     * @remarks The underlying observable has a replay effect, meaning that awaiting for the first emission
     *          will be resolved at next tick, without risks to delay any asynchronous code's workflow.
     */
    create: <T = ConfigSchema>() => Observable<T>;
    /**
     * Return the current value of the plugin's configuration synchronously.
     *
     * @example
     * ```typescript
     * // plugins/my-plugin/server/plugin.ts
     *
     * export class MyPlugin implements Plugin {
     *   constructor(private readonly initContext: PluginInitializerContext) {}
     *   setup(core) {
     *     const config = this.initContext.config.get<MyPluginConfigType>();
     *     // do something with the config
     *   }
     * }
     * ```
     *
     * @remarks This should only be used when synchronous access is an absolute necessity, such
     *          as during the plugin's setup or start lifecycle. For all other usages,
     *          {@link create} should be used instead.
     */
    get: <T = ConfigSchema>() => T;
  };
}

/**
 * The `plugin` export at the root of a plugin's `server` directory should conform
 * to this interface.
 *
 * @public
 */
export type PluginInitializer<
  TSetup = void,
  TStart = void,
  TPluginsSetup extends Record<string, any> = never,
  TPluginsStart extends Record<string, any> = never
> = (
  core: PluginInitializerContext
) => Promise<
  Plugin<TSetup, TStart, TPluginsSetup, TPluginsStart> | PrebootPlugin<TSetup, TPluginsSetup>
>;
