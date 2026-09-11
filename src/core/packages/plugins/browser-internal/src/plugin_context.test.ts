/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of } from 'rxjs';
import type { DiscoveredPlugin, PluginOpaqueId } from '@kbn/core-base-common';
import { PluginType } from '@kbn/core-base-common';
import { type MockedLogger, loggerMock } from '@kbn/logging-mocks';
import type { App } from '@kbn/core-application-browser';
import type { PluginInitializerContext } from '@kbn/core-plugins-browser';
import { coreContextMock } from '@kbn/core-base-browser-mocks';
import { createPluginInitializerContext, createPluginSetupContext } from './plugin_context';
import { PluginWrapper } from './plugin';
import {
  createPluginInitializerContextMock,
  createRuntimePluginContractResolverMock,
} from './test_helpers';
import type { PluginsServiceSetupDeps } from './plugins_service';

const createPluginManifest = (pluginName: string): DiscoveredPlugin => {
  return {
    id: pluginName,
    configPath: [pluginName],
    type: PluginType.standard,
    requiredPlugins: [],
    optionalPlugins: [],
    requiredBundles: [],
    runtimePluginDependencies: [],
  };
};

const testPluginId = 'testPluginId';

describe('createPluginInitializerContext', () => {
  let pluginId: PluginOpaqueId;
  let pluginManifest: DiscoveredPlugin;
  let pluginConfig: Record<string, unknown>;
  let coreContext: ReturnType<typeof coreContextMock.create>;
  let logger: MockedLogger;
  let initContext: PluginInitializerContext;

  beforeEach(() => {
    pluginId = Symbol(testPluginId);
    pluginManifest = createPluginManifest(testPluginId);
    pluginConfig = {};
    coreContext = coreContextMock.create();
    logger = coreContext.logger as MockedLogger;

    initContext = createPluginInitializerContext(
      coreContext,
      pluginId,
      pluginManifest,
      pluginConfig
    );
  });

  describe('logger.get', () => {
    it('calls the underlying logger factory with the correct parameters', () => {
      initContext.logger.get('service.sub');
      expect(logger.get).toHaveBeenCalledTimes(1);
      expect(logger.get).toHaveBeenCalledWith('plugins', testPluginId, 'service.sub');
    });

    it('returns the logger from the underlying factory', () => {
      const underlyingLogger = loggerMock.create();
      logger.get.mockReturnValue(underlyingLogger);
      expect(initContext.logger.get('anything')).toEqual(underlyingLogger);
    });
  });
});

describe('createPluginSetupContext', () => {
  const createPlugin = (manifest: DiscoveredPlugin) =>
    new PluginWrapper(manifest, Symbol(manifest.id), createPluginInitializerContextMock());

  const createDeps = () =>
    ({
      http: {},
      application: { register: jest.fn(), registerAppUpdater: jest.fn() },
      deferredInit: { getStatus$: jest.fn(() => of({ status: 'available' })), refresh: jest.fn() },
    } as unknown as PluginsServiceSetupDeps);

  const createApp = (): App => ({ id: 'app', title: 'App', mount: jest.fn() });

  it('registers the app unchanged when the plugin is not lazy-init enabled', () => {
    const plugin = createPlugin(createPluginManifest(testPluginId));
    const deps = createDeps();
    const app = createApp();

    const setupContext = createPluginSetupContext({
      deps,
      plugin,
      runtimeResolver: createRuntimePluginContractResolverMock(),
    });
    setupContext.application.register(app);

    expect(deps.application.register).toHaveBeenCalledWith(plugin.opaqueId, app);
    expect(deps.deferredInit.getStatus$).not.toHaveBeenCalled();
  });

  it('wraps the app mount behind the initializing gate when the plugin is lazy-init enabled', () => {
    const plugin = createPlugin({
      ...createPluginManifest(testPluginId),
      enableLazyInitialize: true,
    });
    const deps = createDeps();
    const app = createApp();

    const setupContext = createPluginSetupContext({
      deps,
      plugin,
      runtimeResolver: createRuntimePluginContractResolverMock(),
    });
    setupContext.application.register(app);

    expect(deps.application.register).toHaveBeenCalledTimes(1);
    const [registeredOpaqueId, registeredApp] = (deps.application.register as jest.Mock).mock
      .calls[0];
    expect(registeredOpaqueId).toBe(plugin.opaqueId);
    expect(registeredApp.mount).not.toBe(app.mount);
    expect(deps.deferredInit.getStatus$).toHaveBeenCalledWith(testPluginId);
  });
});
