/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { duration } from 'moment';
import { first } from 'rxjs';
import { REPO_ROOT, fromRoot } from '@kbn/repo-info';
import { rawConfigServiceMock, getEnvOptions, configServiceMock } from '@kbn/config-mocks';
import type { CoreContext } from '@kbn/core-base-server-internal';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { NodeInfo } from '@kbn/core-node-server';
import { nodeServiceMock } from '@kbn/core-node-server-mocks';
import type { InstanceInfo } from './plugin_context';
import {
  createPluginInitializerContext,
  createPluginPrebootSetupContext,
  createPluginSetupContext,
  createPluginStartContext,
} from './plugin_context';
import { createRuntimePluginContractResolverMock } from './test_helpers';

import { PluginType } from '@kbn/core-base-common';
import type { PluginManifest } from '@kbn/core-plugins-server';
import { schema, ByteSizeValue } from '@kbn/config-schema';
import { ConfigService, Env } from '@kbn/config';
import { PluginWrapper } from './plugin';

import { coreInternalLifecycleMock } from '@kbn/core-lifecycle-server-mocks';
import { mockCoreContext } from '@kbn/core-base-server-mocks';
import { createCoreContextConfigServiceMock } from './test_helpers';

function createPluginManifest(manifestProps: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'some-plugin-id',
    version: 'some-version',
    configPath: 'path',
    kibanaVersion: '7.0.0',
    type: PluginType.standard,
    requiredPlugins: ['some-required-dep'],
    requiredBundles: [],
    optionalPlugins: ['some-optional-dep'],
    runtimePluginDependencies: [],
    server: true,
    ui: true,
    owner: {
      name: 'Core',
      githubTeam: 'kibana-core',
    },
    ...manifestProps,
  };
}

describe('createPluginInitializerContext', () => {
  let logger: ReturnType<typeof loggingSystemMock.create>;
  let coreId: symbol;
  let opaqueId: symbol;
  let env: Env;
  let coreContext: CoreContext;
  let instanceInfo: InstanceInfo;
  let nodeInfo: NodeInfo;

  beforeEach(async () => {
    logger = loggingSystemMock.create();
    coreId = Symbol('core');
    opaqueId = Symbol();
    instanceInfo = {
      uuid: 'instance-uuid',
      airgapped: false,
    };
    nodeInfo = nodeServiceMock.createInternalPrebootContract();
    env = Env.createDefault(REPO_ROOT, getEnvOptions());
    coreContext = mockCoreContext.create({
      env,
      logger,
      configService: configServiceMock.create(),
    });
  });

  describe('context.config', () => {
    it('config.get() should return the plugin config synchronously', async () => {
      const config$ = rawConfigServiceMock.create({
        rawConfig: {
          plugin: {
            foo: 'bar',
            answer: 42,
          },
        },
      });

      const configService = new ConfigService(config$, env, logger);
      configService.setSchema(
        'plugin',
        schema.object({
          foo: schema.string(),
          answer: schema.number(),
        })
      );
      await configService.validate();

      coreContext = { coreId, env, logger, configService };

      const manifest = createPluginManifest({
        configPath: 'plugin',
      });

      const pluginInitializerContext = createPluginInitializerContext({
        coreContext,
        opaqueId,
        manifest,
        instanceInfo,
        nodeInfo,
      });

      expect(pluginInitializerContext.config.get()).toEqual({
        foo: 'bar',
        answer: 42,
      });
    });

    it('config.globalConfig$ should be an observable for the global config', async () => {
      const configService = createCoreContextConfigServiceMock();

      coreContext = { coreId, env, logger, configService };

      const manifest = createPluginManifest();

      const pluginInitializerContext = createPluginInitializerContext({
        coreContext,
        opaqueId,
        manifest,
        instanceInfo,
        nodeInfo,
      });

      expect(pluginInitializerContext.config.legacy.globalConfig$).toBeDefined();

      const configObject = await pluginInitializerContext.config.legacy.globalConfig$
        .pipe(first())
        .toPromise();
      expect(configObject).toStrictEqual({
        elasticsearch: {
          shardTimeout: duration(30, 's'),
          requestTimeout: duration(30, 's'),
        },
        path: { data: fromRoot('data') },
        savedObjects: { maxImportPayloadBytes: new ByteSizeValue(26214400) },
      });
    });
  });

  describe('context.env', () => {
    it('should expose the correct instance uuid', () => {
      const manifest = createPluginManifest();
      instanceInfo = {
        uuid: 'kibana-uuid',
        airgapped: false,
      };
      const pluginInitializerContext = createPluginInitializerContext({
        coreContext,
        opaqueId,
        manifest,
        instanceInfo,
        nodeInfo,
      });
      expect(pluginInitializerContext.env.instanceUuid).toBe('kibana-uuid');
    });

    it('should expose paths to the config files', () => {
      coreContext = {
        ...coreContext,
        env: Env.createDefault(
          REPO_ROOT,
          getEnvOptions({
            configs: ['/home/kibana/config/kibana.yml', '/home/kibana/config/kibana.dev.yml'],
          })
        ),
      };
      const pluginInitializerContext = createPluginInitializerContext({
        coreContext,
        opaqueId,
        manifest: createPluginManifest(),
        instanceInfo,
        nodeInfo,
      });
      expect(pluginInitializerContext.env.configs).toEqual([
        '/home/kibana/config/kibana.yml',
        '/home/kibana/config/kibana.dev.yml',
      ]);
    });
  });

  describe('context.node', () => {
    it('should expose the correct node roles', () => {
      const pluginInitializerContext = createPluginInitializerContext({
        coreContext,
        opaqueId,
        manifest: createPluginManifest(),
        instanceInfo,
        nodeInfo: { roles: { backgroundTasks: false, ui: true, migrator: false } },
      });
      expect(pluginInitializerContext.node.roles.backgroundTasks).toBe(false);
      expect(pluginInitializerContext.node.roles.ui).toBe(true);
    });
  });
});

describe('createPluginPrebootSetupContext', () => {
  let coreContext: CoreContext;
  let opaqueId: symbol;
  let nodeInfo: NodeInfo;

  beforeEach(async () => {
    opaqueId = Symbol();
    coreContext = {
      coreId: Symbol('core'),
      env: Env.createDefault(REPO_ROOT, getEnvOptions()),
      logger: loggingSystemMock.create(),
      configService: configServiceMock.create(),
    };
    nodeInfo = nodeServiceMock.createInternalPrebootContract();
  });

  it('`holdSetupUntilResolved` captures plugin.name', () => {
    const manifest = createPluginManifest();
    const plugin = new PluginWrapper({
      path: 'some-path',
      manifest,
      opaqueId,
      initializerContext: createPluginInitializerContext({
        coreContext,
        opaqueId,
        manifest,
        instanceInfo: {
          uuid: 'instance-uuid',
          airgapped: false,
        },
        nodeInfo,
      }),
    });

    const corePreboot = coreInternalLifecycleMock.createInternalPreboot();
    const prebootSetupContext = createPluginPrebootSetupContext({ deps: corePreboot, plugin });

    const holdSetupPromise = Promise.resolve(undefined);
    prebootSetupContext.preboot.holdSetupUntilResolved('some-reason', holdSetupPromise);

    expect(corePreboot.preboot.holdSetupUntilResolved).toHaveBeenCalledTimes(1);
    expect(corePreboot.preboot.holdSetupUntilResolved).toHaveBeenCalledWith(
      'some-plugin-id',
      'some-reason',
      holdSetupPromise
    );
  });
});

describe('createPluginSetupContext', () => {
  let coreContext: CoreContext;
  let opaqueId: symbol;
  let nodeInfo: NodeInfo;

  beforeEach(async () => {
    opaqueId = Symbol();
    coreContext = {
      coreId: Symbol('core'),
      env: Env.createDefault(REPO_ROOT, getEnvOptions()),
      logger: loggingSystemMock.create(),
      configService: configServiceMock.create(),
    };
    nodeInfo = nodeServiceMock.createInternalPrebootContract();
  });

  const createPlugin = (manifest: PluginManifest) =>
    new PluginWrapper({
      path: 'some-path',
      manifest,
      opaqueId,
      initializerContext: createPluginInitializerContext({
        coreContext,
        opaqueId,
        manifest,
        instanceInfo: { uuid: 'instance-uuid', airgapped: false },
        nodeInfo,
      }),
    });

  const createRuntimeResolver = () => createRuntimePluginContractResolverMock();

  describe('plugins.lazyInit', () => {
    // The contract is always defined: the observation methods let an ordinary plugin watch a lazy
    // dependency, so they cannot be reserved for lazy plugins.
    it('is defined even when the plugin does not have enableLazyInitialize', () => {
      const plugin = createPlugin(createPluginManifest({ enableLazyInitialize: false }));
      const ctx = createPluginSetupContext({
        deps: coreInternalLifecycleMock.createInternalSetup(),
        plugin,
        runtimeResolver: createRuntimeResolver(),
      });

      expect(ctx.plugins.lazyInit).toBeDefined();
    });

    it('scopes every method to the calling plugin and delegates to the runtime resolver', async () => {
      const plugin = createPlugin(createPluginManifest({ enableLazyInitialize: true }));
      const runtimeResolver = createRuntimeResolver();
      runtimeResolver.trigger.mockResolvedValue(undefined);
      runtimeResolver.getLazyInitStatus.mockReturnValue('available');
      const status$ = {} as any;
      runtimeResolver.lazyInitStatus$.mockReturnValue(status$);
      const callback = jest.fn();

      const ctx = createPluginSetupContext({
        deps: coreInternalLifecycleMock.createInternalSetup(),
        plugin,
        runtimeResolver,
      });

      await ctx.plugins.lazyInit.trigger();
      expect(runtimeResolver.trigger).toHaveBeenCalledWith('some-plugin-id');

      expect(ctx.plugins.lazyInit.getStatus('some-runtime-dep')).toBe('available');
      expect(runtimeResolver.getLazyInitStatus).toHaveBeenCalledWith(
        'some-plugin-id',
        'some-runtime-dep'
      );

      expect(ctx.plugins.lazyInit.status$('some-runtime-dep')).toBe(status$);
      expect(runtimeResolver.lazyInitStatus$).toHaveBeenCalledWith(
        'some-plugin-id',
        'some-runtime-dep'
      );

      ctx.plugins.lazyInit.onLazyStartService('some-runtime-dep', callback);
      expect(runtimeResolver.onLazyStartService).toHaveBeenCalledWith(
        'some-plugin-id',
        'some-runtime-dep',
        callback
      );
    });

    it('trigger rejects when the resolver rejects', async () => {
      const plugin = createPlugin(createPluginManifest({ enableLazyInitialize: true }));
      const runtimeResolver = createRuntimeResolver();
      runtimeResolver.trigger.mockRejectedValue(new Error('init failed'));

      const ctx = createPluginSetupContext({
        deps: coreInternalLifecycleMock.createInternalSetup(),
        plugin,
        runtimeResolver,
      });

      await expect(ctx.plugins.lazyInit.trigger()).rejects.toThrow('init failed');
    });

    it('is exposed identically on the start context', async () => {
      const plugin = createPlugin(createPluginManifest({ enableLazyInitialize: true }));
      const runtimeResolver = createRuntimeResolver();
      runtimeResolver.getLazyInitStatus.mockReturnValue('idle');

      const ctx = createPluginStartContext({
        deps: coreInternalLifecycleMock.createInternalStart(),
        plugin,
        runtimeResolver,
      });

      expect(ctx.plugins.lazyInit.getStatus('some-plugin-id')).toBe('idle');
      expect(runtimeResolver.getLazyInitStatus).toHaveBeenCalledWith(
        'some-plugin-id',
        'some-plugin-id'
      );
    });
  });
});
