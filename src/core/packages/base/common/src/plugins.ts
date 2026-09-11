/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConfigPath } from '@kbn/config';

/**
 * Dedicated type for plugin name/id that is supposed to make Map/Set/Arrays
 * that use it as a key or value more obvious.
 *
 * @public
 */
export type PluginName = string;

/** @public */
export type PluginOpaqueId = symbol;

/** @public */
export enum PluginType {
  /**
   * Preboot plugins are special-purpose plugins that only function during preboot stage.
   */
  preboot = 'preboot',
  /**
   * Standard plugins are plugins that start to function as soon as Kibana is fully booted and are active until it shuts down.
   */
  standard = 'standard',
}

/**
 * Small container object used to expose information about discovered plugins that may
 * or may not have been started.
 * @public
 */
export interface DiscoveredPlugin {
  /**
   * Identifier of the plugin.
   */
  readonly id: PluginName;

  /**
   * Root configuration path used by the plugin, defaults to "id" in snake_case format.
   */
  readonly configPath: ConfigPath;

  /**
   * Type of the plugin, defaults to `standard`.
   */
  readonly type: PluginType;

  /**
   * An optional list of the other plugins that **must be** installed and enabled
   * for this plugin to function properly.
   */
  readonly requiredPlugins: readonly PluginName[];

  /**
   * An optional list of the other plugins that if installed and enabled **may be**
   * leveraged by this plugin for some additional functionality but otherwise are
   * not required for this plugin to work properly.
   */
  readonly optionalPlugins: readonly PluginName[];

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
  readonly requiredBundles: readonly PluginName[];

  /**
   * An optional list of plugin dependencies that can be resolved dynamically at runtime
   * using the dynamic contract resolving capabilities from the plugin service.
   */
  readonly runtimePluginDependencies: readonly PluginName[];

  /**
   * Specifies whether this plugin - and its required dependencies - will be enabled for anonymous pages (login page, status page when
   * configured, etc.) Default is false.
   */
  readonly enabledOnAnonymousPages?: boolean;

  /**
   * Whether this plugin opted into core-managed lazy/deferred Elasticsearch initialization.
   * When `true`, core automatically gates the plugin's registered app behind a loading screen
   * (and its status observable) until the plugin's server-side deferred init completes.
   */
  readonly enableLazyInitialize?: boolean;
}
