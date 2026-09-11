/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  mockCreatePluginPrebootSetupContext,
  mockCreatePluginSetupContext,
  mockCreatePluginStartContext,
  runtimeResolverMock,
} from './plugins_system.test.mocks';

import { BehaviorSubject } from 'rxjs';

import { REPO_ROOT } from '@kbn/repo-info';
import { type PluginName, PluginType } from '@kbn/core-base-common';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type { Logger } from '@kbn/logging';
import { Env } from '@kbn/config';
import { configServiceMock, getEnvOptions } from '@kbn/config-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';

import { PluginWrapper } from './plugin';
import { findCircularDependencies, normalizeCycle, PluginsSystem } from './plugins_system';
import { coreInternalLifecycleMock } from '@kbn/core-lifecycle-server-mocks';
import { DeferredInitEngine } from './deferred_init';

function createPlugin(
  id: string,
  {
    required = [],
    optional = [],
    runtime = [],
    server = true,
    ui = true,
    type = PluginType.standard,
  }: {
    required?: string[];
    optional?: string[];
    runtime?: string[];
    server?: boolean;
    ui?: boolean;
    type?: PluginType;
  } = {}
): PluginWrapper<any, any> {
  const plugin = new PluginWrapper<any, any>({
    path: 'some-path',
    manifest: {
      id,
      version: 'some-version',
      configPath: 'path',
      kibanaVersion: '7.0.0',
      type,
      requiredPlugins: required,
      optionalPlugins: optional,
      runtimePluginDependencies: runtime,
      requiredBundles: [],
      server,
      ui,
      owner: { name: 'foo' },
    },
    opaqueId: Symbol(id),
    initializerContext: { logger } as any,
  });
  jest.spyOn(plugin, 'init').mockResolvedValue();
  return plugin;
}

const prebootDeps = coreInternalLifecycleMock.createInternalPreboot();
const setupDeps = coreInternalLifecycleMock.createInternalSetup();
const startDeps = coreInternalLifecycleMock.createInternalStart();

let pluginsSystem: PluginsSystem<PluginType.standard>;
let configService: ReturnType<typeof configServiceMock.create>;
let logger: ReturnType<typeof loggingSystemMock.create>;
let env: Env;
let coreContext: CoreContext;

beforeEach(() => {
  runtimeResolverMock.setDependencyMap.mockReset();
  runtimeResolverMock.setDeferredInitEngine.mockReset();
  runtimeResolverMock.setLazyPluginNames.mockReset();
  runtimeResolverMock.loadPluginContract.mockReset();
  runtimeResolverMock.resolveSetupRequests.mockReset();
  runtimeResolverMock.resolveStartRequests.mockReset();

  logger = loggingSystemMock.create();
  env = Env.createDefault(REPO_ROOT, getEnvOptions());

  configService = configServiceMock.create();
  configService.atPath.mockReturnValue(new BehaviorSubject({ initialize: true }));

  coreContext = { coreId: Symbol(), env, logger, configService: configService as any };

  pluginsSystem = new PluginsSystem(coreContext, PluginType.standard);
});

test('can be setup even without plugins', async () => {
  const pluginsSetup = await pluginsSystem.setupPlugins(setupDeps);

  expect(pluginsSetup).toBeInstanceOf(Map);
  expect(pluginsSetup.size).toBe(0);
});

test('throws if adding plugin with incompatible type', () => {
  const prebootPlugin = createPlugin('plugin-preboot', { type: PluginType.preboot });
  const standardPlugin = createPlugin('plugin-standard');

  const prebootPluginSystem = new PluginsSystem(coreContext, PluginType.preboot);
  const standardPluginSystem = new PluginsSystem(coreContext, PluginType.standard);

  prebootPluginSystem.addPlugin(prebootPlugin);
  expect(() => prebootPluginSystem.addPlugin(standardPlugin)).toThrowErrorMatchingInlineSnapshot(
    `"Cannot add plugin with type \\"standard\\" to plugin system with type \\"preboot\\"."`
  );
  expect(prebootPluginSystem.getPlugins()).toEqual([prebootPlugin]);

  standardPluginSystem.addPlugin(standardPlugin);
  expect(() => standardPluginSystem.addPlugin(prebootPlugin)).toThrowErrorMatchingInlineSnapshot(
    `"Cannot add plugin with type \\"preboot\\" to plugin system with type \\"standard\\"."`
  );
  expect(standardPluginSystem.getPlugins()).toEqual([standardPlugin]);
});

test('getPlugins returns the list of plugins', () => {
  const pluginA = createPlugin('plugin-a');
  const pluginB = createPlugin('plugin-b');
  pluginsSystem.addPlugin(pluginA);
  pluginsSystem.addPlugin(pluginB);

  expect(pluginsSystem.getPlugins()).toEqual([pluginA, pluginB]);
});

test('getPluginDependencies returns dependency tree with keys topologically sorted', () => {
  pluginsSystem.addPlugin(createPlugin('plugin-a', { required: ['no-dep'] }));
  pluginsSystem.addPlugin(
    createPlugin('plugin-b', { required: ['plugin-a'], optional: ['no-dep', 'other'] })
  );
  pluginsSystem.addPlugin(createPlugin('no-dep'));

  expect(pluginsSystem.getPluginDependencies()).toMatchInlineSnapshot(`
    Object {
      "asNames": Map {
        "no-dep" => Array [],
        "plugin-a" => Array [
          "no-dep",
        ],
        "plugin-b" => Array [
          "plugin-a",
          "no-dep",
        ],
      },
      "asOpaqueIds": Map {
        Symbol(no-dep) => Array [],
        Symbol(plugin-a) => Array [
          Symbol(no-dep),
        ],
        Symbol(plugin-b) => Array [
          Symbol(plugin-a),
          Symbol(no-dep),
        ],
      },
    }
  `);
});

test('`setupPlugins` throws plugin has missing required dependency', async () => {
  pluginsSystem.addPlugin(createPlugin('some-id', { required: ['missing-dep'] }));

  await expect(pluginsSystem.setupPlugins(setupDeps)).rejects.toMatchInlineSnapshot(`
    [Error: Topological ordering of plugins did not complete due to circular dependencies:

    Plugins with cyclic or missing dependencies: ["some-id"]]
  `);
});

test('`setupPlugins` throws if plugins have circular required dependency', async () => {
  pluginsSystem.addPlugin(createPlugin('no-dep'));
  pluginsSystem.addPlugin(createPlugin('depends-on-1', { required: ['depends-on-2'] }));
  pluginsSystem.addPlugin(createPlugin('depends-on-2', { required: ['depends-on-1'] }));

  await expect(pluginsSystem.setupPlugins(setupDeps)).rejects.toMatchInlineSnapshot(`
    [Error: Topological ordering of plugins did not complete due to circular dependencies:

    Detected circular dependencies:
      depends-on-1 -> depends-on-2 -> depends-on-1

    Plugins with cyclic or missing dependencies: ["depends-on-1","depends-on-2"]]
  `);
});

test('`setupPlugins` throws if plugins have circular optional dependency', async () => {
  pluginsSystem.addPlugin(createPlugin('no-dep'));
  pluginsSystem.addPlugin(createPlugin('depends-on-1', { optional: ['depends-on-2'] }));
  pluginsSystem.addPlugin(createPlugin('depends-on-2', { optional: ['depends-on-1'] }));

  await expect(pluginsSystem.setupPlugins(setupDeps)).rejects.toMatchInlineSnapshot(`
    [Error: Topological ordering of plugins did not complete due to circular dependencies:

    Detected circular dependencies:
      depends-on-1 -> depends-on-2 -> depends-on-1

    Plugins with cyclic or missing dependencies: ["depends-on-1","depends-on-2"]]
  `);
});

test('`setupPlugins` ignores missing optional dependency', async () => {
  const plugin = createPlugin('some-id', { optional: ['missing-dep'] });
  jest.spyOn(plugin, 'setup').mockResolvedValue('test');

  pluginsSystem.addPlugin(plugin);

  expect([...(await pluginsSystem.setupPlugins(setupDeps))]).toMatchInlineSnapshot(`
    Array [
      Array [
        "some-id",
        "test",
      ],
    ]
  `);
});

test('`setupPlugins` setups the runtimeResolver', async () => {
  const pluginA = createPlugin('pluginA', { required: [] });
  const pluginB = createPlugin('pluginB', { required: ['pluginA'] });

  jest.spyOn(pluginA, 'setup').mockReturnValue('contractA');
  jest.spyOn(pluginB, 'setup').mockReturnValue('contractB');

  pluginsSystem.addPlugin(pluginA);
  pluginsSystem.addPlugin(pluginB);

  await pluginsSystem.setupPlugins(setupDeps);

  expect(runtimeResolverMock.setDependencyMap).toHaveBeenCalledTimes(1);
  expect(runtimeResolverMock.setDependencyMap).toHaveBeenCalledWith(expect.any(Map));

  expect(runtimeResolverMock.resolveSetupRequests).toHaveBeenCalledTimes(1);
  expect(runtimeResolverMock.resolveSetupRequests).toHaveBeenCalledWith(expect.any(Map));
  expect(
    Object.fromEntries([...runtimeResolverMock.resolveSetupRequests.mock.calls[0][0].entries()])
  ).toEqual({
    pluginA: 'contractA',
    pluginB: 'contractB',
  });
});

test('correctly orders plugins and returns exposed values for "setup" and "start"', async () => {
  interface Contracts {
    setup: Record<PluginName, unknown>;
    start: Record<PluginName, unknown>;
  }

  const plugins = new Map([
    [
      createPlugin('order-4', { required: ['order-2'] }),
      {
        setup: { 'order-2': 'added-as-2' },
        start: { 'order-2': 'started-as-2' },
      },
    ],
    [
      createPlugin('order-0'),
      {
        setup: {},
        start: {},
      },
    ],
    [
      createPlugin('order-2', { required: ['order-1'], optional: ['order-0'] }),
      {
        setup: { 'order-1': 'added-as-3', 'order-0': 'added-as-1' },
        start: { 'order-1': 'started-as-3', 'order-0': 'started-as-1' },
      },
    ],
    [
      createPlugin('order-1', { required: ['order-0'] }),
      {
        setup: { 'order-0': 'added-as-1' },
        start: { 'order-0': 'started-as-1' },
      },
    ],
    [
      createPlugin('order-3', { required: ['order-2'], optional: ['missing-dep'] }),
      {
        setup: { 'order-2': 'added-as-2' },
        start: { 'order-2': 'started-as-2' },
      },
    ],
  ] as Array<[PluginWrapper<any, any>, Contracts]>);

  const setupContextMap = new Map();
  const startContextMap = new Map();

  [...plugins.keys()].forEach((plugin, index) => {
    jest.spyOn(plugin, 'setup').mockResolvedValue(`added-as-${index}`);
    jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);

    setupContextMap.set(plugin.name, `setup-for-${plugin.name}`);
    startContextMap.set(plugin.name, `start-for-${plugin.name}`);

    pluginsSystem.addPlugin(plugin);
  });

  mockCreatePluginSetupContext.mockImplementation(({ plugin }) => setupContextMap.get(plugin.name));

  mockCreatePluginStartContext.mockImplementation(({ plugin }) => startContextMap.get(plugin.name));

  expect([...(await pluginsSystem.setupPlugins(setupDeps))]).toMatchInlineSnapshot(`
    Array [
      Array [
        "order-0",
        "added-as-1",
      ],
      Array [
        "order-1",
        "added-as-3",
      ],
      Array [
        "order-2",
        "added-as-2",
      ],
      Array [
        "order-3",
        "added-as-4",
      ],
      Array [
        "order-4",
        "added-as-0",
      ],
    ]
  `);

  for (const [plugin, deps] of plugins) {
    expect(mockCreatePluginSetupContext).toHaveBeenCalledWith({
      deps: setupDeps,
      plugin,
      runtimeResolver: expect.any(Object),
    });
    expect(plugin.setup).toHaveBeenCalledTimes(1);
    expect(plugin.setup).toHaveBeenCalledWith(setupContextMap.get(plugin.name), deps.setup);
  }

  expect([...(await pluginsSystem.startPlugins(startDeps))]).toMatchInlineSnapshot(`
    Array [
      Array [
        "order-0",
        "started-as-1",
      ],
      Array [
        "order-1",
        "started-as-3",
      ],
      Array [
        "order-2",
        "started-as-2",
      ],
      Array [
        "order-3",
        "started-as-4",
      ],
      Array [
        "order-4",
        "started-as-0",
      ],
    ]
  `);

  for (const [plugin, deps] of plugins) {
    expect(mockCreatePluginStartContext).toHaveBeenCalledWith({
      deps: startDeps,
      plugin,
      runtimeResolver: expect.any(Object),
    });
    expect(plugin.start).toHaveBeenCalledTimes(1);
    expect(plugin.start).toHaveBeenCalledWith(startContextMap.get(plugin.name), deps.start);
  }
});

test('correctly orders preboot plugins and returns exposed values for "setup"', async () => {
  const prebootPluginSystem = new PluginsSystem(coreContext, PluginType.preboot);
  const plugins = new Map([
    [
      createPlugin('order-4', { type: PluginType.preboot, required: ['order-2'] }),
      { 'order-2': 'added-as-2' },
    ],
    [createPlugin('order-0', { type: PluginType.preboot }), {}],
    [
      createPlugin('order-2', {
        type: PluginType.preboot,
        required: ['order-1'],
        optional: ['order-0'],
      }),
      { 'order-1': 'added-as-3', 'order-0': 'added-as-1' },
    ],
    [
      createPlugin('order-1', { type: PluginType.preboot, required: ['order-0'] }),
      { 'order-0': 'added-as-1' },
    ],
    [
      createPlugin('order-3', {
        type: PluginType.preboot,
        required: ['order-2'],
        optional: ['missing-dep'],
      }),
      { 'order-2': 'added-as-2' },
    ],
  ] as Array<[PluginWrapper<any, any>, Record<PluginName, unknown>]>);

  const setupContextMap = new Map();
  [...plugins.keys()].forEach((plugin, index) => {
    jest.spyOn(plugin, 'setup').mockResolvedValue(`added-as-${index}`);
    setupContextMap.set(plugin.name, `setup-for-${plugin.name}`);
    prebootPluginSystem.addPlugin(plugin);
  });

  mockCreatePluginPrebootSetupContext.mockImplementation(({ plugin }) =>
    setupContextMap.get(plugin.name)
  );

  expect([...(await prebootPluginSystem.setupPlugins(prebootDeps))]).toMatchInlineSnapshot(`
    Array [
      Array [
        "order-0",
        "added-as-1",
      ],
      Array [
        "order-1",
        "added-as-3",
      ],
      Array [
        "order-2",
        "added-as-2",
      ],
      Array [
        "order-3",
        "added-as-4",
      ],
      Array [
        "order-4",
        "added-as-0",
      ],
    ]
  `);

  for (const [plugin, deps] of plugins) {
    expect(mockCreatePluginPrebootSetupContext).toHaveBeenCalledWith({
      deps: prebootDeps,
      plugin,
    });
    expect(plugin.setup).toHaveBeenCalledTimes(1);
    expect(plugin.setup).toHaveBeenCalledWith(setupContextMap.get(plugin.name), deps);
  }
});

test('`setupPlugins` only setups plugins that have server side', async () => {
  const firstPluginToRun = createPlugin('order-0');
  const secondPluginNotToRun = createPlugin('order-not-run', { server: false });
  const thirdPluginToRun = createPlugin('order-1');

  [firstPluginToRun, secondPluginNotToRun, thirdPluginToRun].forEach((plugin, index) => {
    jest.spyOn(plugin, 'setup').mockResolvedValue(`added-as-${index}`);

    pluginsSystem.addPlugin(plugin);
  });

  expect([...(await pluginsSystem.setupPlugins(setupDeps))]).toMatchInlineSnapshot(`
    Array [
      Array [
        "order-1",
        "added-as-2",
      ],
      Array [
        "order-0",
        "added-as-0",
      ],
    ]
  `);

  expect(mockCreatePluginSetupContext).toHaveBeenCalledWith({
    deps: setupDeps,
    plugin: firstPluginToRun,
    runtimeResolver: expect.any(Object),
  });
  expect(mockCreatePluginSetupContext).not.toHaveBeenCalledWith({
    deps: setupDeps,
    plugin: secondPluginNotToRun,
    runtimeResolver: expect.any(Object),
  });
  expect(mockCreatePluginSetupContext).toHaveBeenCalledWith({
    deps: setupDeps,
    plugin: thirdPluginToRun,
    runtimeResolver: expect.any(Object),
  });

  expect(firstPluginToRun.setup).toHaveBeenCalledTimes(1);
  expect(secondPluginNotToRun.setup).not.toHaveBeenCalled();
  expect(thirdPluginToRun.setup).toHaveBeenCalledTimes(1);
});

test('`uiPlugins` returns empty Map before plugins are added', async () => {
  expect(pluginsSystem.uiPlugins()).toMatchInlineSnapshot(`Map {}`);
});

test('`uiPlugins` returns ordered Maps of all plugin manifests', async () => {
  const plugins = new Map([
    [createPlugin('order-4', { required: ['order-2'] }), { 'order-2': 'added-as-2' }],
    [createPlugin('order-0'), {}],
    [
      createPlugin('order-2', { required: ['order-1'], optional: ['order-0'] }),
      { 'order-1': 'added-as-3', 'order-0': 'added-as-1' },
    ],
    [createPlugin('order-1', { required: ['order-0'] }), { 'order-0': 'added-as-1' }],
    [
      createPlugin('order-3', { required: ['order-2'], optional: ['missing-dep'] }),
      { 'order-2': 'added-as-2' },
    ],
  ] as Array<[PluginWrapper, Record<PluginName, unknown>]>);

  [...plugins.keys()].forEach((plugin) => {
    pluginsSystem.addPlugin(plugin);
  });

  expect([...pluginsSystem.uiPlugins().keys()]).toMatchInlineSnapshot(`
    Array [
      "order-0",
      "order-1",
      "order-2",
      "order-3",
      "order-4",
    ]
  `);
});

test('`uiPlugins` returns only ui plugin dependencies', async () => {
  const plugins = [
    createPlugin('ui-plugin', {
      required: ['req-ui', 'req-no-ui'],
      optional: ['opt-ui', 'opt-no-ui'],
      ui: true,
      server: false,
    }),
    createPlugin('req-ui', { ui: true, server: false }),
    createPlugin('req-no-ui', { ui: false, server: true }),
    createPlugin('opt-ui', { ui: true, server: false }),
    createPlugin('opt-no-ui', { ui: false, server: true }),
  ];

  plugins.forEach((plugin) => {
    pluginsSystem.addPlugin(plugin);
  });

  const plugin = pluginsSystem.uiPlugins().get('ui-plugin')!;
  expect(plugin.requiredPlugins).toEqual(['req-ui']);
  expect(plugin.optionalPlugins).toEqual(['opt-ui']);
});

test('`uiPlugins` filters out missing plugin dependencies', async () => {
  const plugins = [
    createPlugin('ui-plugin', {
      optional: ['available', 'missing'],
      runtime: ['available', 'missing'],
      ui: true,
      server: false,
    }),
    createPlugin('available', { ui: true, server: false }),
  ];

  plugins.forEach((plugin) => {
    pluginsSystem.addPlugin(plugin);
  });

  const plugin = pluginsSystem.uiPlugins().get('ui-plugin')!;
  expect(plugin.optionalPlugins).toEqual(['available']);
  expect(plugin.runtimePluginDependencies).toEqual(['available', 'missing']);
});

test('can start without plugins', async () => {
  await pluginsSystem.setupPlugins(setupDeps);
  const pluginsStart = await pluginsSystem.startPlugins(startDeps);

  expect(pluginsStart).toBeInstanceOf(Map);
  expect(pluginsStart.size).toBe(0);
});

test('cannot start preboot plugins', async () => {
  const prebootPlugin = createPlugin('order-0', { type: PluginType.preboot });
  jest.spyOn(prebootPlugin, 'setup').mockResolvedValue({});
  jest.spyOn(prebootPlugin, 'start').mockResolvedValue({});

  const prebootPluginSystem = new PluginsSystem(coreContext, PluginType.preboot);
  prebootPluginSystem.addPlugin(prebootPlugin);
  await prebootPluginSystem.setupPlugins(prebootDeps);

  await expect(
    prebootPluginSystem.startPlugins(startDeps)
  ).rejects.toThrowErrorMatchingInlineSnapshot(`"Preboot plugins cannot be started."`);
  expect(prebootPlugin.start).not.toHaveBeenCalled();
});

test('`startPlugins` only starts plugins that were setup', async () => {
  const firstPluginToRun = createPlugin('order-0');
  const secondPluginNotToRun = createPlugin('order-not-run', { server: false });
  const thirdPluginToRun = createPlugin('order-1');

  [firstPluginToRun, secondPluginNotToRun, thirdPluginToRun].forEach((plugin, index) => {
    jest.spyOn(plugin, 'setup').mockResolvedValue(`setup-as-${index}`);
    jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);

    pluginsSystem.addPlugin(plugin);
  });
  await pluginsSystem.setupPlugins(setupDeps);
  const result = await pluginsSystem.startPlugins(startDeps);
  expect([...result]).toMatchInlineSnapshot(`
    Array [
      Array [
        "order-1",
        "started-as-2",
      ],
      Array [
        "order-0",
        "started-as-0",
      ],
    ]
  `);
});

describe('setup', () => {
  beforeAll(() => {
    jest.useFakeTimers({ legacyFakeTimers: true });
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  it('throws timeout error if "setup" was not completed in 10 sec.', async () => {
    const plugin: PluginWrapper = createPlugin('timeout-setup');
    jest.spyOn(plugin, 'setup').mockImplementation(() => new Promise((i) => i));
    pluginsSystem.addPlugin(plugin);
    mockCreatePluginSetupContext.mockImplementation(() => ({}));

    const promise = pluginsSystem.setupPlugins(setupDeps);
    process.nextTick(() => {
      // let the await init go through. then simulate the timeout
      jest.runAllTimers();
    });

    await expect(promise).rejects.toMatchInlineSnapshot(
      `[Error: Setup lifecycle of "timeout-setup" plugin wasn't completed in 10sec. Consider disabling the plugin and re-start.]`
    );
  });

  it('logs only server-side plugins', async () => {
    [
      createPlugin('order-0'),
      createPlugin('order-not-run', { server: false }),
      createPlugin('order-1'),
    ].forEach((plugin, index) => {
      jest.spyOn(plugin, 'setup').mockResolvedValue(`setup-as-${index}`);
      jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);
      pluginsSystem.addPlugin(plugin);
    });
    await pluginsSystem.setupPlugins(setupDeps);
    const log = logger.get.mock.results[0].value as jest.Mocked<Logger>;
    expect(log.info).toHaveBeenCalledWith(`Setting up [2] plugins: [order-1,order-0]`);
  });
});

describe('start', () => {
  beforeAll(() => {
    jest.useFakeTimers({ legacyFakeTimers: true });
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  it('throws timeout error if "start" was not completed in 10 sec.', async () => {
    const plugin = createPlugin('timeout-start');
    jest.spyOn(plugin, 'setup').mockResolvedValue({});
    jest.spyOn(plugin, 'start').mockImplementation(() => new Promise((i) => i));

    pluginsSystem.addPlugin(plugin);
    mockCreatePluginSetupContext.mockImplementation(() => ({}));
    mockCreatePluginStartContext.mockImplementation(() => ({}));

    await pluginsSystem.setupPlugins(setupDeps);
    const promise = pluginsSystem.startPlugins(startDeps);
    jest.runAllTimers();

    await expect(promise).rejects.toMatchInlineSnapshot(
      `[Error: Start lifecycle of "timeout-start" plugin wasn't completed in 10sec. Consider disabling the plugin and re-start.]`
    );
  });

  it('logs only server-side plugins', async () => {
    [
      createPlugin('order-0'),
      createPlugin('order-not-run', { server: false }),
      createPlugin('order-1'),
    ].forEach((plugin, index) => {
      jest.spyOn(plugin, 'setup').mockResolvedValue(`setup-as-${index}`);
      jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);
      pluginsSystem.addPlugin(plugin);
    });
    await pluginsSystem.setupPlugins(setupDeps);
    await pluginsSystem.startPlugins(startDeps);
    const log = logger.get.mock.results[0].value as jest.Mocked<Logger>;
    expect(log.info).toHaveBeenCalledWith(`Starting [2] plugins: [order-1,order-0]`);
  });

  it('setups the runtimeResolver', async () => {
    const pluginA = createPlugin('pluginA', { required: [] });
    const pluginB = createPlugin('pluginB', { required: ['pluginA'] });

    jest.spyOn(pluginA, 'setup').mockReturnValue({});
    jest.spyOn(pluginB, 'setup').mockReturnValue({});

    jest.spyOn(pluginA, 'start').mockReturnValue('contractA');
    jest.spyOn(pluginB, 'start').mockReturnValue('contractB');

    pluginsSystem.addPlugin(pluginA);
    pluginsSystem.addPlugin(pluginB);

    await pluginsSystem.setupPlugins(setupDeps);
    await pluginsSystem.startPlugins(startDeps);

    expect(runtimeResolverMock.resolveStartRequests).toHaveBeenCalledTimes(1);
    expect(runtimeResolverMock.resolveStartRequests).toHaveBeenCalledWith(expect.any(Map));
    expect(
      Object.fromEntries([...runtimeResolverMock.resolveStartRequests.mock.calls[0][0].entries()])
    ).toEqual({
      pluginA: 'contractA',
      pluginB: 'contractB',
    });
  });

  it('leaves a lazy plugin out of the boot loop and hands the engine its two deferred phases', async () => {
    const engine = new DeferredInitEngine(logger.get());
    jest.spyOn(engine, 'setRunner');
    const localPluginsSystem = new PluginsSystem(coreContext, PluginType.standard, engine);
    const startContext = { start: 'context' };
    mockCreatePluginStartContext.mockReturnValue(startContext);
    runtimeResolverMock.notifyStartContractAvailable.mockReset();

    const dependency = createPlugin('dependency');
    jest.spyOn(dependency, 'setup').mockReturnValue({});
    jest.spyOn(dependency, 'start').mockReturnValue('dependencyContract');
    const lazyPlugin = createPlugin('lazyPlugin', { required: ['dependency'] });
    jest.spyOn(lazyPlugin, 'enableLazyInitialize', 'get').mockReturnValue(true);
    jest.spyOn(lazyPlugin, 'setup').mockReturnValue({});
    jest.spyOn(lazyPlugin, 'start').mockReturnValue('lazyContract');
    jest.spyOn(lazyPlugin, 'runLazyInitialize').mockResolvedValue(undefined);

    localPluginsSystem.addPlugin(dependency);
    localPluginsSystem.addPlugin(lazyPlugin);

    await localPluginsSystem.setupPlugins(setupDeps);
    const contracts = await localPluginsSystem.startPlugins(startDeps);

    // Boot: the dependency started, the lazy plugin did not, and nothing was published for it.
    expect(dependency.start).toHaveBeenCalledTimes(1);
    expect(lazyPlugin.start).not.toHaveBeenCalled();
    expect(lazyPlugin.runLazyInitialize).not.toHaveBeenCalled();
    expect([...contracts.keys()]).toEqual(['dependency']);
    expect(runtimeResolverMock.notifyStartContractAvailable).toHaveBeenCalledTimes(1);
    expect(runtimeResolverMock.notifyStartContractAvailable).toHaveBeenCalledWith(
      'dependency',
      'dependencyContract'
    );

    expect(engine.setRunner).toHaveBeenCalledTimes(1);
    const [pluginId, runner] = (engine.setRunner as jest.Mock).mock.calls[0];
    expect(pluginId).toBe('lazyPlugin');

    // First trigger, phase one: `lazyInitialize` gets the same arguments `start()` will.
    await runner.lazyInitialize();
    expect(lazyPlugin.runLazyInitialize).toHaveBeenCalledWith(startContext, {
      dependency: 'dependencyContract',
    });
    expect(lazyPlugin.start).not.toHaveBeenCalled();

    // Phase two: `start()` runs and its contract is published to the resolver.
    await runner.start();
    expect(lazyPlugin.start).toHaveBeenCalledWith(startContext, {
      dependency: 'dependencyContract',
    });
    expect(runtimeResolverMock.notifyStartContractAvailable).toHaveBeenCalledWith(
      'lazyPlugin',
      'lazyContract'
    );
  });

  it('does not attach a runner for plugins that did not opt into lazy init', async () => {
    const engine = new DeferredInitEngine(logger.get());
    jest.spyOn(engine, 'setRunner');
    const localPluginsSystem = new PluginsSystem(coreContext, PluginType.standard, engine);

    const plugin = createPlugin('regularPlugin');
    jest.spyOn(plugin, 'setup').mockReturnValue({});
    jest.spyOn(plugin, 'start').mockReturnValue('contract');

    localPluginsSystem.addPlugin(plugin);

    await localPluginsSystem.setupPlugins(setupDeps);
    await localPluginsSystem.startPlugins(startDeps);

    expect(engine.setRunner).not.toHaveBeenCalled();
  });
});

describe('start - lazy plugins on a node without the ui role', () => {
  const setupLazySystem = () => {
    const engine = new DeferredInitEngine(logger.get());
    jest.spyOn(engine, 'ensureInitialized');
    const localPluginsSystem = new PluginsSystem(coreContext, PluginType.standard, engine);

    const lazyPlugin = createPlugin('lazyPlugin');
    jest.spyOn(lazyPlugin, 'enableLazyInitialize', 'get').mockReturnValue(true);
    jest.spyOn(lazyPlugin, 'setup').mockReturnValue({});
    jest.spyOn(lazyPlugin, 'start').mockReturnValue('lazyContract');
    const regularPlugin = createPlugin('regularPlugin');
    jest.spyOn(regularPlugin, 'setup').mockReturnValue({});
    jest.spyOn(regularPlugin, 'start').mockReturnValue('contract');

    localPluginsSystem.addPlugin(lazyPlugin);
    localPluginsSystem.addPlugin(regularPlugin);
    return { engine, localPluginsSystem };
  };

  it('triggers every lazy plugin once boot is done, since no request ever will', async () => {
    const { engine, localPluginsSystem } = setupLazySystem();
    localPluginsSystem.setNodeRoles({ ui: false, backgroundTasks: true, migrator: false });

    await localPluginsSystem.setupPlugins(setupDeps);
    await localPluginsSystem.startPlugins(startDeps);

    expect(engine.ensureInitialized).toHaveBeenCalledTimes(1);
    expect(engine.ensureInitialized).toHaveBeenCalledWith('lazyPlugin');
  });

  it('leaves lazy plugins idle on a node with the ui role', async () => {
    const { engine, localPluginsSystem } = setupLazySystem();
    localPluginsSystem.setNodeRoles({ ui: true, backgroundTasks: true, migrator: false });

    await localPluginsSystem.setupPlugins(setupDeps);
    await localPluginsSystem.startPlugins(startDeps);

    expect(engine.ensureInitialized).not.toHaveBeenCalled();
    expect(engine.getState('lazyPlugin')).toBe('idle');
  });

  it('leaves lazy plugins idle when the node roles are unknown', async () => {
    const { engine, localPluginsSystem } = setupLazySystem();

    await localPluginsSystem.setupPlugins(setupDeps);
    await localPluginsSystem.startPlugins(startDeps);

    expect(engine.ensureInitialized).not.toHaveBeenCalled();
  });
});

describe('start - deferred-init start-cycle guard', () => {
  it('brackets the start loop with begin/endStartCycle on the engine', async () => {
    const engine = new DeferredInitEngine(logger.get());
    jest.spyOn(engine, 'beginStartCycle');
    jest.spyOn(engine, 'endStartCycle');
    const localPluginsSystem = new PluginsSystem(coreContext, PluginType.standard, engine);

    const plugin = createPlugin('somePlugin');
    jest.spyOn(plugin, 'setup').mockReturnValue({});
    jest.spyOn(plugin, 'start').mockReturnValue('contract');
    localPluginsSystem.addPlugin(plugin);

    await localPluginsSystem.setupPlugins(setupDeps);
    await localPluginsSystem.startPlugins(startDeps);

    expect(engine.beginStartCycle).toHaveBeenCalledTimes(1);
    expect(engine.endStartCycle).toHaveBeenCalledTimes(1);
    expect((engine.beginStartCycle as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (engine.endStartCycle as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it('clears the start cycle even when a plugin start() throws', async () => {
    const engine = new DeferredInitEngine(logger.get());
    jest.spyOn(engine, 'endStartCycle');
    const localPluginsSystem = new PluginsSystem(coreContext, PluginType.standard, engine);

    const plugin = createPlugin('boom-plugin');
    jest.spyOn(plugin, 'setup').mockReturnValue({});
    const error = new Error('boom');
    jest.spyOn(plugin, 'start').mockRejectedValueOnce(error);
    localPluginsSystem.addPlugin(plugin);

    await localPluginsSystem.setupPlugins(setupDeps);
    await expect(localPluginsSystem.startPlugins(startDeps)).rejects.toBe(error);

    expect(engine.endStartCycle).toHaveBeenCalledTimes(1);
  });

  it('propagates a start() error immediately, without retrying', async () => {
    const plugin = createPlugin('failing-start');
    jest.spyOn(plugin, 'setup').mockResolvedValue({});
    const error = new Error('boom');
    jest.spyOn(plugin, 'start').mockRejectedValueOnce(error);

    pluginsSystem.addPlugin(plugin);
    mockCreatePluginSetupContext.mockImplementation(() => ({}));
    mockCreatePluginStartContext.mockImplementation(() => ({}));

    await pluginsSystem.setupPlugins(setupDeps);

    await expect(pluginsSystem.startPlugins(startDeps)).rejects.toBe(error);
    expect(plugin.start).toHaveBeenCalledTimes(1);
  });
});

describe('deferred-init engine wiring', () => {
  it('registers the deferred-init engine with the runtime contract resolver, when present', async () => {
    const engine = new DeferredInitEngine(logger.get());
    const localPluginsSystem = new PluginsSystem(coreContext, PluginType.standard, engine);
    const plugin = createPlugin('somePlugin');
    jest.spyOn(plugin, 'setup').mockReturnValue({});
    localPluginsSystem.addPlugin(plugin);

    await localPluginsSystem.setupPlugins(setupDeps);

    expect(runtimeResolverMock.setDeferredInitEngine).toHaveBeenCalledWith(engine);
  });

  it('does not attempt to register an engine when none was provided', async () => {
    const plugin = createPlugin('somePlugin');
    jest.spyOn(plugin, 'setup').mockReturnValue({});
    pluginsSystem.addPlugin(plugin);

    await pluginsSystem.setupPlugins(setupDeps);

    expect(runtimeResolverMock.setDeferredInitEngine).not.toHaveBeenCalled();
  });
});

describe('loadPluginContractFor', () => {
  it('resolves via the runtime resolver, scoped to the plugin owning the opaque id', () => {
    const plugin = createPlugin('somePlugin', { runtime: ['lazyPlugin'] });
    pluginsSystem.addPlugin(plugin);

    pluginsSystem.loadPluginContractFor(plugin.opaqueId, 'lazyPlugin');

    expect(runtimeResolverMock.loadPluginContract).toHaveBeenCalledWith('somePlugin', 'lazyPlugin');
  });

  it('returns undefined for an opaque id that belongs to no plugin in this system', () => {
    pluginsSystem.addPlugin(createPlugin('somePlugin'));

    expect(pluginsSystem.loadPluginContractFor(Symbol('core'), 'lazyPlugin')).toBeUndefined();
    expect(runtimeResolverMock.loadPluginContract).not.toHaveBeenCalled();
  });

  it('sees plugins added after a previous lookup cached the opaque-id map', () => {
    const first = createPlugin('firstPlugin');
    pluginsSystem.addPlugin(first);
    pluginsSystem.loadPluginContractFor(first.opaqueId, 'lazyPlugin');

    const late = createPlugin('latePlugin');
    pluginsSystem.addPlugin(late);

    pluginsSystem.loadPluginContractFor(late.opaqueId, 'lazyPlugin');
    expect(runtimeResolverMock.loadPluginContract).toHaveBeenLastCalledWith(
      'latePlugin',
      'lazyPlugin'
    );
  });
});

describe('setup - lazy plugins cannot be injected dependencies', () => {
  const createSystemWithEngine = () =>
    new PluginsSystem(coreContext, PluginType.standard, new DeferredInitEngine(logger.get()));

  const addLazyPlugin = (system: PluginsSystem<PluginType.standard>, id = 'lazyPlugin') => {
    const lazyPlugin = createPlugin(id);
    jest.spyOn(lazyPlugin, 'enableLazyInitialize', 'get').mockReturnValue(true);
    jest.spyOn(lazyPlugin, 'setup').mockReturnValue({});
    system.addPlugin(lazyPlugin);
    return lazyPlugin;
  };

  it('throws when a lazy plugin is declared as a required dependency', async () => {
    const system = createSystemWithEngine();
    addLazyPlugin(system);
    const dependent = createPlugin('dependentPlugin', { required: ['lazyPlugin'] });
    jest.spyOn(dependent, 'setup').mockReturnValue({});
    system.addPlugin(dependent);

    await expect(system.setupPlugins(setupDeps)).rejects.toThrowError(
      /"dependentPlugin" -> "lazyPlugin"/
    );
  });

  it('throws when a lazy plugin is declared as an optional dependency', async () => {
    const system = createSystemWithEngine();
    addLazyPlugin(system);
    const dependent = createPlugin('dependentPlugin', { optional: ['lazyPlugin'] });
    jest.spyOn(dependent, 'setup').mockReturnValue({});
    system.addPlugin(dependent);

    await expect(system.setupPlugins(setupDeps)).rejects.toThrowError(
      /"dependentPlugin" -> "lazyPlugin"/
    );
  });

  it('throws before any plugin is set up, so the failure cannot be half-applied', async () => {
    const system = createSystemWithEngine();
    const lazyPlugin = addLazyPlugin(system);
    const dependent = createPlugin('dependentPlugin', { required: ['lazyPlugin'] });
    jest.spyOn(dependent, 'setup').mockReturnValue({});
    system.addPlugin(dependent);

    await expect(system.setupPlugins(setupDeps)).rejects.toThrow();

    expect(lazyPlugin.setup).not.toHaveBeenCalled();
    expect(dependent.setup).not.toHaveBeenCalled();
  });

  it('reports every offending edge at once', async () => {
    const system = createSystemWithEngine();
    addLazyPlugin(system);
    for (const id of ['dependentA', 'dependentB']) {
      const dependent = createPlugin(id, { required: ['lazyPlugin'] });
      jest.spyOn(dependent, 'setup').mockReturnValue({});
      system.addPlugin(dependent);
    }

    await expect(system.setupPlugins(setupDeps)).rejects.toThrowError(
      /"dependentA" -> "lazyPlugin".*"dependentB" -> "lazyPlugin"/
    );
  });

  it('allows a lazy plugin declared as a runtime plugin dependency', async () => {
    const system = createSystemWithEngine();
    addLazyPlugin(system);
    const dependent = createPlugin('dependentPlugin', { runtime: ['lazyPlugin'] });
    jest.spyOn(dependent, 'setup').mockReturnValue({});
    system.addPlugin(dependent);

    await expect(system.setupPlugins(setupDeps)).resolves.toBeDefined();
    expect(dependent.setup).toHaveBeenCalledTimes(1);
  });

  it('allows a lazy plugin to declare its own required dependencies', async () => {
    const system = createSystemWithEngine();
    const dependency = createPlugin('normalDependency');
    jest.spyOn(dependency, 'setup').mockReturnValue({});
    system.addPlugin(dependency);

    const lazyPlugin = createPlugin('lazyPlugin', { required: ['normalDependency'] });
    jest.spyOn(lazyPlugin, 'enableLazyInitialize', 'get').mockReturnValue(true);
    jest.spyOn(lazyPlugin, 'setup').mockReturnValue({});
    system.addPlugin(lazyPlugin);

    await expect(system.setupPlugins(setupDeps)).resolves.toBeDefined();
  });

  it('ignores a browser-only dependent, which is never handed a server contract', async () => {
    const system = createSystemWithEngine();
    addLazyPlugin(system);
    const browserOnlyDependent = createPlugin('browserOnlyDependent', {
      required: ['lazyPlugin'],
      server: false,
    });
    system.addPlugin(browserOnlyDependent);

    await expect(system.setupPlugins(setupDeps)).resolves.toBeDefined();
  });

  it('ignores a browser-only plugin that claims to be lazy, since it cannot be', async () => {
    const system = createSystemWithEngine();
    const browserOnlyLazy = createPlugin('browserOnlyLazy', { server: false });
    jest.spyOn(browserOnlyLazy, 'enableLazyInitialize', 'get').mockReturnValue(true);
    system.addPlugin(browserOnlyLazy);

    const dependent = createPlugin('dependentPlugin', { required: ['browserOnlyLazy'] });
    jest.spyOn(dependent, 'setup').mockReturnValue({});
    system.addPlugin(dependent);

    await expect(system.setupPlugins(setupDeps)).resolves.toBeDefined();
    expect(runtimeResolverMock.setLazyPluginNames).toHaveBeenCalledWith(new Set());
  });

  it('hands the lazy plugin names to the runtime contract resolver', async () => {
    const system = createSystemWithEngine();
    addLazyPlugin(system);
    const dependent = createPlugin('dependentPlugin', { runtime: ['lazyPlugin'] });
    jest.spyOn(dependent, 'setup').mockReturnValue({});
    system.addPlugin(dependent);

    await system.setupPlugins(setupDeps);

    expect(runtimeResolverMock.setLazyPluginNames).toHaveBeenCalledWith(new Set(['lazyPlugin']));
  });
});

describe('asynchronous plugins', () => {
  const runScenario = async ({
    production,
    asyncSetup,
    asyncStart,
  }: {
    production: boolean;
    asyncSetup: boolean;
    asyncStart: boolean;
  }) => {
    env = Env.createDefault(
      REPO_ROOT,
      getEnvOptions({
        cliArgs: {
          dev: !production,
          envName: production ? 'production' : 'development',
        },
      })
    );
    coreContext = { coreId: Symbol(), env, logger, configService: configService as any };
    pluginsSystem = new PluginsSystem(coreContext, PluginType.standard);

    const syncPlugin = createPlugin('sync-plugin');
    jest.spyOn(syncPlugin, 'setup').mockReturnValue('setup-sync');
    jest.spyOn(syncPlugin, 'start').mockReturnValue('start-sync');
    pluginsSystem.addPlugin(syncPlugin);

    const asyncPlugin = createPlugin('async-plugin');
    jest
      .spyOn(asyncPlugin, 'setup')
      .mockReturnValue(asyncSetup ? Promise.resolve('setup-async') : 'setup-sync');
    jest
      .spyOn(asyncPlugin, 'start')
      .mockReturnValue(asyncStart ? Promise.resolve('start-async') : 'start-sync');
    pluginsSystem.addPlugin(asyncPlugin);

    await pluginsSystem.setupPlugins(setupDeps);
    await pluginsSystem.startPlugins(startDeps);
  };

  it('logs a warning if a plugin returns a promise from its setup contract in dev mode', async () => {
    await runScenario({
      production: false,
      asyncSetup: true,
      asyncStart: false,
    });

    const log = logger.get.mock.results[0].value as jest.Mocked<Logger>;
    expect(log.warn.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "Plugin async-plugin is using asynchronous setup lifecycle. Asynchronous plugins support will be removed in a later version.",
        ],
      ]
    `);
  });

  it('does not log warnings if a plugin returns a promise from its setup contract in prod mode', async () => {
    await runScenario({
      production: true,
      asyncSetup: true,
      asyncStart: false,
    });

    const log = logger.get.mock.results[0].value as jest.Mocked<Logger>;
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs a warning if a plugin returns a promise from its start contract in dev mode', async () => {
    await runScenario({
      production: false,
      asyncSetup: false,
      asyncStart: true,
    });

    const log = logger.get.mock.results[0].value as jest.Mocked<Logger>;
    expect(log.warn.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "Plugin async-plugin is using asynchronous start lifecycle. Asynchronous plugins support will be removed in a later version.",
        ],
      ]
    `);
  });

  it('does not log warnings if a plugin returns a promise from its start contract  in prod mode', async () => {
    await runScenario({
      production: true,
      asyncSetup: false,
      asyncStart: true,
    });

    const log = logger.get.mock.results[0].value as jest.Mocked<Logger>;
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs multiple warnings if both `setup` and `start` return promises', async () => {
    await runScenario({
      production: false,
      asyncSetup: true,
      asyncStart: true,
    });

    const log = logger.get.mock.results[0].value as jest.Mocked<Logger>;
    expect(log.warn.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "Plugin async-plugin is using asynchronous setup lifecycle. Asynchronous plugins support will be removed in a later version.",
        ],
        Array [
          "Plugin async-plugin is using asynchronous start lifecycle. Asynchronous plugins support will be removed in a later version.",
        ],
      ]
    `);
  });
});

describe('normalizeCycle', () => {
  it.each([
    [[], []],
    [['a'], ['a']],
    [
      ['a', 'b'],
      ['a', 'b'],
    ],
    [
      ['b', 'a'],
      ['a', 'b'],
    ],
    [
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ],
    [
      ['c', 'a', 'b'],
      ['a', 'b', 'c'],
    ],
    [
      ['a', 'c', 'b'],
      ['a', 'c', 'b'],
    ],
  ])("normalizes cycle '%s'", (plugins: PluginName[], expected: PluginName[]) => {
    expect(normalizeCycle(plugins)).toEqual(expected);
  });

  it.each([
    [['a', 'b', 'a']],
    [['b', 'a', 'b']],
    [['a', 'b', 'c', 'a']],
    [['c', 'a', 'b', 'c']],
    [['a', 'c', 'b', 'a']],
  ])("throws error for invalid cycle format '%s'", (plugins: PluginName[]) => {
    expect(() => normalizeCycle(plugins)).toThrow();
  });
});

describe('findCircularDependencies', () => {
  it.each([
    [new Map([]) as Map<PluginName, Set<PluginName>>, []],
    [new Map([['a', new Set(['b'])]]), []],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['c'])],
        ['c', new Set(['d'])],
        ['d', new Set(['e'])],
      ]),
      [],
    ],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
      ]),
      [['a', 'b']],
    ],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['c'])],
        ['c', new Set(['a'])],
      ]),
      [['a', 'b', 'c']],
    ],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
        ['c', new Set(['d'])],
        ['d', new Set(['c'])],
      ]),
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    ],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['c'])],
        ['c', new Set(['d'])],
        ['d', new Set(['c'])],
      ]),
      [['c', 'd']],
    ],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['c'])],
        ['c', new Set(['d'])],
        ['d', new Set(['a'])],
      ]),
      [['a', 'b', 'c', 'd']],
    ],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
        ['b', new Set(['a'])],
      ]),
      [['a', 'b']],
    ],
    [
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['c'])],
        ['c', new Set(['a'])],
        ['d', new Set(['e'])],
      ]),
      [['a', 'b', 'c']],
    ],
  ])(
    "returns correct circular dependencies for '%s'",
    (dependencyGraph: Map<PluginName, Set<PluginName>>, expected: PluginName[][]) => {
      expect(findCircularDependencies(dependencyGraph)).toEqual(expected);
    }
  );
});

describe('stop', () => {
  beforeAll(() => {
    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const nextTick = () => new Promise((resolve) => setImmediate(resolve));

  it('stops all plugins', async () => {
    const [plugin1, plugin2, plugin3] = [
      createPlugin('plugin-1'),
      createPlugin('plugin-2'),
      createPlugin('plugin-3'),
    ].map((plugin, index) => {
      jest.spyOn(plugin, 'setup').mockResolvedValue(`setup-as-${index}`);
      jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);
      pluginsSystem.addPlugin(plugin);
      return plugin;
    });

    const stopSpy1 = jest.spyOn(plugin1, 'stop').mockImplementationOnce(() => Promise.resolve());
    const stopSpy2 = jest.spyOn(plugin2, 'stop').mockImplementationOnce(() => Promise.resolve());
    const stopSpy3 = jest.spyOn(plugin3, 'stop').mockImplementationOnce(() => Promise.resolve());

    mockCreatePluginSetupContext.mockImplementation(() => ({}));

    await pluginsSystem.setupPlugins(setupDeps);
    const stopPromise = pluginsSystem.stopPlugins();

    await nextTick();
    jest.runAllTimers();

    await stopPromise;

    expect(stopSpy1).toHaveBeenCalledTimes(1);
    expect(stopSpy2).toHaveBeenCalledTimes(1);
    expect(stopSpy3).toHaveBeenCalledTimes(1);
  });

  it('stops plugins in the correct order', async () => {
    // stop order: 3 => 1 => 2
    const [plugin1, plugin2, plugin3] = [
      createPlugin('plugin-1', { required: ['plugin-2'] }),
      createPlugin('plugin-2'),
      createPlugin('plugin-3', { required: ['plugin-1', 'plugin-2'] }),
    ].map((plugin, index) => {
      jest.spyOn(plugin, 'setup').mockResolvedValue(`setup-as-${index}`);
      jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);
      pluginsSystem.addPlugin(plugin);
      return plugin;
    });

    const stopSpy1 = jest.spyOn(plugin1, 'stop').mockImplementationOnce(() => Promise.resolve());
    const stopSpy2 = jest.spyOn(plugin2, 'stop').mockImplementationOnce(() => Promise.resolve());
    const stopSpy3 = jest.spyOn(plugin3, 'stop').mockImplementationOnce(() => Promise.resolve());

    mockCreatePluginSetupContext.mockImplementation(() => ({}));

    await pluginsSystem.setupPlugins(setupDeps);
    const stopPromise = pluginsSystem.stopPlugins();

    await nextTick();
    jest.runAllTimers();

    await stopPromise;

    expect(stopSpy3.mock.invocationCallOrder[0]).toBeLessThan(stopSpy1.mock.invocationCallOrder[0]);
    expect(stopSpy1.mock.invocationCallOrder[0]).toBeLessThan(stopSpy2.mock.invocationCallOrder[0]);
  });

  it('waits for 15 sec to finish "stop" and move on to the next plugin.', async () => {
    const [plugin1, plugin2] = [createPlugin('timeout-stop-1'), createPlugin('timeout-stop-2')].map(
      (plugin, index) => {
        jest.spyOn(plugin, 'setup').mockResolvedValue(`setup-as-${index}`);
        jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);
        pluginsSystem.addPlugin(plugin);
        return plugin;
      }
    );

    const stopSpy1 = jest
      .spyOn(plugin1, 'stop')
      .mockImplementationOnce(() => new Promise((resolve) => resolve));
    const stopSpy2 = jest.spyOn(plugin2, 'stop').mockImplementationOnce(() => Promise.resolve());

    mockCreatePluginSetupContext.mockImplementation(() => ({}));

    await pluginsSystem.setupPlugins(setupDeps);
    const stopPromise = pluginsSystem.stopPlugins();

    await nextTick();
    jest.runAllTimers();

    await stopPromise;

    expect(stopSpy1).toHaveBeenCalledTimes(1);
    expect(stopSpy2).toHaveBeenCalledTimes(1);

    expect(loggingSystemMock.collect(logger).warn.flat()).toEqual(
      expect.arrayContaining([
        `"timeout-stop-1" plugin didn't stop in 15sec., move on to the next.`,
      ])
    );
  });

  it('logs a message if a plugin fails top stop', async () => {
    // stop order: 3 => 1 => 2
    const [plugin1, plugin2, plugin3] = [
      createPlugin('plugin-1', { required: ['plugin-2'] }),
      createPlugin('plugin-2'),
      createPlugin('plugin-3', { required: ['plugin-1', 'plugin-2'] }),
    ].map((plugin, index) => {
      jest.spyOn(plugin, 'setup').mockResolvedValue(`setup-as-${index}`);
      jest.spyOn(plugin, 'start').mockResolvedValue(`started-as-${index}`);
      pluginsSystem.addPlugin(plugin);
      return plugin;
    });

    const stopSpy1 = jest
      .spyOn(plugin1, 'stop')
      .mockImplementationOnce(() => Promise.reject('woups'));
    const stopSpy2 = jest.spyOn(plugin2, 'stop').mockImplementationOnce(() => Promise.resolve());
    const stopSpy3 = jest.spyOn(plugin3, 'stop').mockImplementationOnce(() => Promise.resolve());

    mockCreatePluginSetupContext.mockImplementation(() => ({}));

    await pluginsSystem.setupPlugins(setupDeps);
    const stopPromise = pluginsSystem.stopPlugins();

    await nextTick();
    jest.runAllTimers();

    await stopPromise;

    expect(stopSpy1).toHaveBeenCalledTimes(1);
    expect(stopSpy2).toHaveBeenCalledTimes(1);
    expect(stopSpy3).toHaveBeenCalledTimes(1);

    expect(loggingSystemMock.collect(logger).warn.flat()).toEqual(
      expect.arrayContaining([`"plugin-1" thrown during stop: woups`])
    );
  });
});
