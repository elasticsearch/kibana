/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { coreMock, httpServiceMock, httpServerMock } from '@kbn/core/server/mocks';
import type { DeferredInitExampleStartDeps } from './plugin';
import { DeferredInitExampleServerPlugin } from './plugin';
import type { DeferredInitExampleConfig } from './config';
import { INSTANCE_STATE_ROUTE } from '../common/constants';

const createPlugin = (
  config: DeferredInitExampleConfig = { initDelayMs: 0, forceFailure: false }
) => new DeferredInitExampleServerPlugin(coreMock.createPluginInitializerContext(config));

const createStartDeps = (
  greeting = 'hello from the mock dependency'
): DeferredInitExampleStartDeps => ({
  deferredInitExampleDependency: { getGreeting: () => greeting },
});

// The lifecycle core drives for a lazy plugin is `setup()` at boot, then `lazyInitialize()` and
// `start()` on the instance's first trigger, in that order. These tests exercise the two deferred
// phases directly, the way the deferred-init engine invokes them.
describe('DeferredInitExampleServerPlugin', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const runLazyInitialize = async (
    plugin: DeferredInitExampleServerPlugin,
    core = coreMock.createStart(),
    deps = createStartDeps()
  ) => {
    const lazyInitializePromise = plugin.lazyInitialize(core, deps);
    await jest.runAllTimersAsync();
    await lazyInitializePromise;
    return core;
  };

  it('writes the document using the injected dependency contract, with no accessor involved', async () => {
    const plugin = createPlugin();
    const core = coreMock.createStart();

    await runLazyInitialize(plugin, core, createStartDeps('greetings, injected'));

    expect(core.elasticsearch.client.asInternalUser.index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          greeting: 'greetings, injected',
          initializedBy: 'instance-uuid',
        }),
      })
    );
    // The dependency is an ordinary required plugin: injected, never loaded.
    expect(core.plugins.loadPluginContract).not.toHaveBeenCalled();
  });

  it('start() builds the contract over the state lazyInitialize produced, with no readiness check', async () => {
    const plugin = createPlugin();
    const core = await runLazyInitialize(plugin);

    const contract = plugin.start(core);

    expect(contract.getInstanceState()).toEqual({
      instanceUuid: 'instance-uuid',
      initializedAt: expect.any(String),
      completedPhases: [
        'savedObjectMigrations',
        'defaultState',
        'readDependencyGreeting',
        'wroteDefaultDocument',
      ],
    });
  });

  // Core never does this; the throw documents the invariant rather than a supported state.
  it('start() refuses to run before lazyInitialize() completed on this instance', () => {
    expect(() => createPlugin().start(coreMock.createStart())).toThrow(
      /start\(\) ran before lazyInitialize\(\) completed/
    );
  });

  it('a failed lazyInitialize() leaves nothing behind for start() to pick up', async () => {
    const plugin = createPlugin({ initDelayMs: 0, forceFailure: true });
    const core = coreMock.createStart();

    const lazyInitializePromise = plugin.lazyInitialize(core, createStartDeps());
    const rejection = expect(lazyInitializePromise).rejects.toThrow(/forced failure/);
    await jest.runAllTimersAsync();
    await rejection;

    expect(core.elasticsearch.client.asInternalUser.index).not.toHaveBeenCalled();
    // Core retries `lazyInitialize` from the top on this instance; `start()` stays unreachable.
    expect(() => plugin.start(core)).toThrow(/start\(\) ran before lazyInitialize\(\) completed/);
  });

  it('tolerates a peer instance having created the index concurrently', async () => {
    const plugin = createPlugin();
    const core = coreMock.createStart();
    (core.elasticsearch.client.asInternalUser.indices.create as jest.Mock).mockRejectedValue({
      meta: { body: { error: { type: 'resource_already_exists_exception' } } },
    });

    await runLazyInitialize(plugin, core);

    expect(core.elasticsearch.client.asInternalUser.index).toHaveBeenCalledTimes(1);
  });

  it('serves the instance state from a gated route through getStartServices()', async () => {
    const plugin = createPlugin();
    const coreSetup = coreMock.createSetup();
    const router = httpServiceMock.createRouter();
    coreSetup.http.createRouter.mockReturnValue(router);

    plugin.setup(coreSetup);
    const coreStart = await runLazyInitialize(plugin);
    const contract = plugin.start(coreStart);
    // What core resolves once both deferred phases have run on this instance.
    coreSetup.getStartServices.mockResolvedValue([coreStart, {}, contract]);

    const [, handler] = router.get.mock.calls.find(
      ([config]) => config.path === INSTANCE_STATE_ROUTE
    )!;
    const response = httpServerMock.createResponseFactory();
    await handler({} as never, httpServerMock.createKibanaRequest(), response);

    expect(response.ok).toHaveBeenCalledWith({ body: contract.getInstanceState() });
  });
});
