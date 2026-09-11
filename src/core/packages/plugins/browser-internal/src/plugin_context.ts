/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import type { CoreContext } from '@kbn/core-base-browser-internal';
import type { DiscoveredPlugin, PluginOpaqueId } from '@kbn/core-base-common';
import type { CoreSetup, CoreStart } from '@kbn/core-lifecycle-browser';
import type { PluginInitializerContext } from '@kbn/core-plugins-browser';
import { mountWithInitializingGate } from '@kbn/core-deferred-init-browser-internal';
import type { PluginWrapper } from './plugin';
import type { PluginsServiceSetupDeps, PluginsServiceStartDeps } from './plugins_service';
import type { IRuntimePluginContractResolver } from './plugin_contract_resolver';

/**
 * Provides a plugin-specific context passed to the plugin's constructor. This is currently
 * empty but should provide static services in the future, such as config and logging.
 *
 * @param coreContext
 * @param opaqueId
 * @param pluginManifest
 * @param pluginConfig
 * @internal
 */
export function createPluginInitializerContext(
  coreContext: CoreContext,
  opaqueId: PluginOpaqueId,
  pluginManifest: DiscoveredPlugin,
  pluginConfig: {
    [key: string]: unknown;
  }
): PluginInitializerContext {
  return {
    opaqueId,
    env: coreContext.env,
    logger: {
      get(...contextParts) {
        return coreContext.logger.get('plugins', pluginManifest.id, ...contextParts);
      },
    },
    config: {
      get<T>() {
        return pluginConfig as unknown as T;
      },
    },
  };
}

/**
 * Provides a plugin-specific context passed to the plugin's `setup` lifecycle event. Currently
 * this returns a shallow copy the service setup contracts, but in the future could provide
 * plugin-scoped versions of the service.
 *
 * @param coreContext
 * @param deps
 * @param plugin
 * @internal
 */
export function createPluginSetupContext<
  TSetup,
  TStart,
  TPluginsSetup extends object,
  TPluginsStart extends object
>({
  deps,
  plugin,
  runtimeResolver,
}: {
  deps: PluginsServiceSetupDeps;
  plugin: PluginWrapper<TSetup, TStart, TPluginsSetup, TPluginsStart>;
  runtimeResolver: IRuntimePluginContractResolver;
}): CoreSetup {
  return {
    analytics: deps.analytics,
    application: {
      register: (app) => {
        if (!plugin.discoveredPlugin.enableLazyInitialize) {
          deps.application.register(plugin.opaqueId, app);
          return;
        }
        deps.application.register(plugin.opaqueId, {
          ...app,
          mount: mountWithInitializingGate({
            pluginId: plugin.name,
            mount: app.mount,
            status$: deps.deferredInit.getStatus$(plugin.name),
            // A full reload guarantees a fresh attempt is observed (init state lives server-side
            // and is polled from scratch), rather than relying on the in-place `refresh()` nudge.
            onRetry: () => window.location.reload(),
            getStartServices: () => plugin.startDependencies,
          }),
        });
      },
      registerAppUpdater: (statusUpdater$) => deps.application.registerAppUpdater(statusUpdater$),
    },
    chrome: deps.chrome,
    customBranding: deps.customBranding,
    fatalErrors: deps.fatalErrors,
    featureFlags: deps.featureFlags,
    executionContext: deps.executionContext,
    http: {
      ...deps.http,
      staticAssets: {
        getPluginAssetHref: (assetPath: string) =>
          deps.http.staticAssets.getPluginAssetHref(plugin.name, assetPath),
      },
    },
    injection: {
      getContainer: () => deps.injection.getContainer(plugin.opaqueId),
    },
    notifications: deps.notifications,
    uiSettings: deps.uiSettings,
    settings: deps.settings,
    theme: deps.theme,
    security: {
      registerSecurityDelegate: (api) => deps.security.registerSecurityDelegate(api),
    },
    userProfile: {
      registerUserProfileDelegate: (delegate) =>
        deps.userProfile.registerUserProfileDelegate(delegate),
    },
    userStorage: deps.userStorage,
    plugins: {
      onSetup: (...dependencyNames) => runtimeResolver.onSetup(plugin.name, dependencyNames),
      onStart: (...dependencyNames) => runtimeResolver.onStart(plugin.name, dependencyNames),
    },
    getStartServices: () => plugin.startDependencies,
  };
}

/**
 * Provides a plugin-specific context passed to the plugin's `start` lifecycle event. Currently
 * this returns a shallow copy the service start contracts, but in the future could provide
 * plugin-scoped versions of the service.
 *
 * @param coreContext
 * @param deps
 * @param plugin
 * @internal
 */
export function createPluginStartContext<
  TSetup,
  TStart,
  TPluginsSetup extends object,
  TPluginsStart extends object
>({
  deps,
  plugin,
  runtimeResolver,
}: {
  deps: PluginsServiceStartDeps;
  plugin: PluginWrapper<TSetup, TStart, TPluginsSetup, TPluginsStart>;
  runtimeResolver: IRuntimePluginContractResolver;
}): CoreStart {
  return {
    analytics: deps.analytics,
    application: {
      applications$: deps.application.applications$,
      currentAppId$: deps.application.currentAppId$,
      capabilities: deps.application.capabilities,
      navigateToApp: deps.application.navigateToApp,
      navigateToUrl: deps.application.navigateToUrl,
      getUrlForApp: deps.application.getUrlForApp,
      isAppRegistered: deps.application.isAppRegistered,
      currentLocation$: deps.application.currentLocation$,
    },
    customBranding: deps.customBranding,
    deferredInit: deps.deferredInit,
    docLinks: deps.docLinks,
    executionContext: deps.executionContext,
    featureFlags: deps.featureFlags,
    http: {
      ...deps.http,
      staticAssets: {
        getPluginAssetHref: (assetPath: string) =>
          deps.http.staticAssets.getPluginAssetHref(plugin.name, assetPath),
      },
    },
    injection: {
      fork: () => deps.injection.fork(plugin.opaqueId),
      getContainer: () => deps.injection.getContainer(plugin.opaqueId),
    },
    chrome: omit(deps.chrome, 'getComponent'),
    i18n: deps.i18n,
    notifications: deps.notifications,
    overlays: deps.overlays,
    uiSettings: deps.uiSettings,
    settings: deps.settings,
    fatalErrors: deps.fatalErrors,
    deprecations: deps.deprecations,
    theme: deps.theme,
    security: {
      authc: deps.security.authc,
      serviceAccounts: deps.security.serviceAccounts,
    },
    userProfile: deps.userProfile,
    userStorage: deps.userStorage,
    plugins: {
      onStart: (...dependencyNames) => runtimeResolver.onStart(plugin.name, dependencyNames),
    },
    rendering: deps.rendering,
    pricing: deps.pricing,
  };
}
