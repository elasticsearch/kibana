/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { coreMock, httpServiceMock, httpServerMock } from '@kbn/core/server/mocks';
import type { DeferredInitExampleStartContract } from '@kbn/deferred-init-example-plugin/server';
import { DeferredInitExampleConsumerServerPlugin } from './plugin';
import { LAZY_PLUGIN_ID, STATUS_ROUTE } from '../common/constants';

const createPlugin = () =>
  new DeferredInitExampleConsumerServerPlugin(coreMock.createPluginInitializerContext());

const dependencyContract: DeferredInitExampleStartContract = {
  getDoc: async () => ({
    message: 'hello',
    greeting: 'hi',
    initializedAt: new Date().toISOString(),
    initializedBy: 'instance-uuid',
  }),
  getInstanceState: () => ({
    instanceUuid: 'instance-uuid',
    initializedAt: new Date().toISOString(),
    completedPhases: ['savedObjectMigrations'],
  }),
};

describe('DeferredInitExampleConsumerServerPlugin', () => {
  // `start()` must NOT call `core.plugins.loadPluginContract` for a lazy plugin directly: core's
  // start-cycle guard rejects that. Instead it returns a `getDeferredInitExample()` function that
  // callers invoke post-boot. These tests exercise that function-in-contract pattern.
  describe('start()', () => {
    it('does not call loadPluginContract during start() itself', () => {
      const plugin = createPlugin();
      const core = coreMock.createStart();
      core.plugins.loadPluginContract.mockResolvedValue(dependencyContract);

      plugin.start(core);

      // The whole point of the function-in-contract pattern: nothing is loaded until the returned
      // function is called post-boot.
      expect(core.plugins.loadPluginContract).not.toHaveBeenCalled();
    });

    it('resolves deferredInitExample when the returned function is invoked post-boot', async () => {
      const plugin = createPlugin();
      const core = coreMock.createStart();
      core.plugins.loadPluginContract.mockResolvedValue(dependencyContract);

      const { getDeferredInitExample } = plugin.start(core);
      await expect(getDeferredInitExample()).resolves.toBe(dependencyContract);
      expect(core.plugins.loadPluginContract).toHaveBeenCalledWith(LAZY_PLUGIN_ID);
    });

    it('propagates a rejection out of the returned function (e.g. deferred init failed)', async () => {
      const plugin = createPlugin();
      const core = coreMock.createStart();
      const failure = new Error('deferredInitExample contract unavailable');
      core.plugins.loadPluginContract.mockRejectedValueOnce(failure);

      const { getDeferredInitExample } = plugin.start(core);
      await expect(getDeferredInitExample()).rejects.toBe(failure);
    });
  });

  // Everything registered in `setup()` that is not the data route must be able to run on a quiet
  // node without causing the lazy plugin to initialize.
  describe('setup()', () => {
    const setupPlugin = () => {
      const plugin = createPlugin();
      const core = coreMock.createSetup();
      const router = httpServiceMock.createRouter();
      core.http.createRouter.mockReturnValue(router);
      plugin.setup(core);
      // The core mock builds `lazyInit` out of jest mocks, but only types the first level as such.
      const lazyInit = core.plugins.lazyInit as jest.Mocked<typeof core.plugins.lazyInit>;
      return { plugin, core, router, lazyInit };
    };

    const getStatusHandler = (router: ReturnType<typeof httpServiceMock.createRouter>) =>
      router.get.mock.calls.find(([config]) => config.path === STATUS_ROUTE)![1];

    it('observes the lazy plugin starting without triggering or loading it', () => {
      const { core, lazyInit } = setupPlugin();

      expect(lazyInit.onLazyStartService).toHaveBeenCalledWith(
        LAZY_PLUGIN_ID,
        expect.any(Function)
      );
      expect(lazyInit.trigger).not.toHaveBeenCalled();
      expect(core.plugins.loadPluginContract).not.toHaveBeenCalled();
    });

    it('serves the lazy plugin state synchronously, and reports nothing observed until it starts', async () => {
      const { router, lazyInit } = setupPlugin();
      lazyInit.getStatus.mockReturnValue('idle');
      const response = httpServerMock.createResponseFactory();

      await getStatusHandler(router)({} as never, httpServerMock.createKibanaRequest(), response);

      expect(lazyInit.getStatus).toHaveBeenCalledWith(LAZY_PLUGIN_ID);
      expect(response.ok).toHaveBeenCalledWith({
        body: { status: 'idle', observedLazyStart: null },
      });
      expect(lazyInit.trigger).not.toHaveBeenCalled();
    });

    it('records what the onLazyStartService callback learned once the lazy plugin has started', async () => {
      const { router, lazyInit } = setupPlugin();
      const [, callback] = lazyInit.onLazyStartService.mock.calls[0];
      callback(dependencyContract);
      lazyInit.getStatus.mockReturnValue('available');
      const response = httpServerMock.createResponseFactory();

      await getStatusHandler(router)({} as never, httpServerMock.createKibanaRequest(), response);

      expect(response.ok).toHaveBeenCalledWith({
        body: {
          status: 'available',
          observedLazyStart: { at: expect.any(String), instanceUuid: 'instance-uuid' },
        },
      });
    });
  });
});
