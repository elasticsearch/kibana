/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { InitState } from '@kbn/core-plugins-server';
import type { DeferredInitEngine } from './deferred_init';
import { RuntimePluginContractResolver } from './plugin_contract_resolver';

const logger = loggingSystemMock.create().get();

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 1));
const fewTicks = () =>
  nextTick()
    .then(() => nextTick())
    .then(() => nextTick());

const toMap = (record: Record<string, unknown>): Map<string, unknown> => {
  return new Map(Object.entries(record));
};

const pluginAContract = Symbol();

describe('RuntimePluginContractResolver', () => {
  const SOURCE_PLUGIN = 'sourcePlugin';
  let resolver: RuntimePluginContractResolver;

  beforeEach(() => {
    resolver = new RuntimePluginContractResolver(logger);

    const dependencyMap = new Map<string, Set<string>>();
    dependencyMap.set(SOURCE_PLUGIN, new Set(['pluginA', 'pluginB', 'pluginC']));
    resolver.setDependencyMap(dependencyMap);
  });

  describe('setup contracts', () => {
    it('throws if onSetup is called before setDependencyMap', () => {
      resolver = new RuntimePluginContractResolver(logger);

      expect(() => resolver.onSetup(SOURCE_PLUGIN, ['pluginA'])).toThrowErrorMatchingInlineSnapshot(
        `"onSetup cannot be called before setDependencyMap"`
      );
    });

    it('throws if resolveSetupRequests is called multiple times', async () => {
      resolver.resolveSetupRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      expect(() =>
        resolver.resolveSetupRequests(
          toMap({
            pluginA: pluginAContract,
          })
        )
      ).toThrowErrorMatchingInlineSnapshot(`"resolveSetupRequests can only be called once"`);
    });

    it('resolves a single request', async () => {
      const handler = jest.fn();
      resolver.onSetup(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler(contracts));

      await fewTicks();

      expect(handler).not.toHaveBeenCalled();

      resolver.resolveSetupRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      await fewTicks();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
      });
    });

    it('resolves multiple requests', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      resolver.onSetup(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler1(contracts));
      resolver.onSetup(SOURCE_PLUGIN, ['pluginB']).then((contracts) => handler2(contracts));
      resolver
        .onSetup(SOURCE_PLUGIN, ['pluginA', 'pluginB'])
        .then((contracts) => handler3(contracts));

      await fewTicks();

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();

      resolver.resolveSetupRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      await fewTicks();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
      });

      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith({
        pluginB: {
          found: false,
        },
      });

      expect(handler3).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
        pluginB: {
          found: false,
        },
      });
    });

    it('resolves requests instantly when called after resolveSetupRequests', async () => {
      resolver.resolveSetupRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      const handler1 = jest.fn();
      const handler2 = jest.fn();
      resolver.onSetup(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler1(contracts));
      resolver.onSetup(SOURCE_PLUGIN, ['pluginB']).then((contracts) => handler2(contracts));

      await fewTicks();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
      });

      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith({
        pluginB: {
          found: false,
        },
      });
    });

    it('throws when requesting a contract not defined in the dependency map', async () => {
      expect(() =>
        resolver.onSetup(SOURCE_PLUGIN, ['undeclaredPlugin'])
      ).toThrowErrorMatchingInlineSnapshot(
        `"Dynamic contract resolving requires the dependencies to be declared in the plugin manifest.Undeclared dependencies: undeclaredPlugin"`
      );
    });

    it('throws when requesting a mixed defined/undefined dependencies', async () => {
      expect(() =>
        resolver.onSetup(SOURCE_PLUGIN, [
          'pluginA',
          'undeclaredPlugin1',
          'pluginB',
          'undeclaredPlugin2',
        ])
      ).toThrowErrorMatchingInlineSnapshot(
        `"Dynamic contract resolving requires the dependencies to be declared in the plugin manifest.Undeclared dependencies: undeclaredPlugin1, undeclaredPlugin2"`
      );
    });
  });

  describe('start contracts', () => {
    it('throws if onStart is called before setDependencyMap', () => {
      resolver = new RuntimePluginContractResolver(logger);

      expect(() => resolver.onStart(SOURCE_PLUGIN, ['pluginA'])).toThrowErrorMatchingInlineSnapshot(
        `"onStart cannot be called before setDependencyMap"`
      );
    });

    it('throws if resolveStartRequests is called multiple times', async () => {
      resolver.resolveStartRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      expect(() =>
        resolver.resolveStartRequests(
          toMap({
            pluginA: pluginAContract,
          })
        )
      ).toThrowErrorMatchingInlineSnapshot(`"resolveStartRequests can only be called once"`);
    });

    it('resolves a single request', async () => {
      const handler = jest.fn();
      resolver.onStart(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler(contracts));

      await fewTicks();

      expect(handler).not.toHaveBeenCalled();

      resolver.resolveStartRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      await fewTicks();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
      });
    });

    it('resolves multiple requests', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      resolver.onStart(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler1(contracts));
      resolver.onStart(SOURCE_PLUGIN, ['pluginB']).then((contracts) => handler2(contracts));
      resolver
        .onStart(SOURCE_PLUGIN, ['pluginA', 'pluginB'])
        .then((contracts) => handler3(contracts));

      await fewTicks();

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();

      resolver.resolveStartRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      await fewTicks();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
      });

      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith({
        pluginB: {
          found: false,
        },
      });

      expect(handler3).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
        pluginB: {
          found: false,
        },
      });
    });

    it('resolves requests instantly when called after resolveSetupRequests', async () => {
      resolver.resolveStartRequests(
        toMap({
          pluginA: pluginAContract,
        })
      );

      const handler1 = jest.fn();
      const handler2 = jest.fn();
      resolver.onStart(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler1(contracts));
      resolver.onStart(SOURCE_PLUGIN, ['pluginB']).then((contracts) => handler2(contracts));

      await fewTicks();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith({
        pluginA: {
          found: true,
          contract: pluginAContract,
        },
      });

      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith({
        pluginB: {
          found: false,
        },
      });
    });

    it('throws when requesting a contract not defined in the dependency map', async () => {
      expect(() =>
        resolver.onStart(SOURCE_PLUGIN, ['undeclaredPlugin'])
      ).toThrowErrorMatchingInlineSnapshot(
        `"Dynamic contract resolving requires the dependencies to be declared in the plugin manifest.Undeclared dependencies: undeclaredPlugin"`
      );
    });

    it('throws when requesting a mixed defined/undefined dependencies', async () => {
      expect(() =>
        resolver.onStart(SOURCE_PLUGIN, [
          'pluginA',
          'undeclaredPlugin1',
          'pluginB',
          'undeclaredPlugin2',
        ])
      ).toThrowErrorMatchingInlineSnapshot(
        `"Dynamic contract resolving requires the dependencies to be declared in the plugin manifest.Undeclared dependencies: undeclaredPlugin1, undeclaredPlugin2"`
      );
    });

    describe('notifyStartContractAvailable', () => {
      it('resolves a request as soon as its dependency becomes available, before resolveStartRequests', async () => {
        const handler = jest.fn();
        resolver.onStart(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler(contracts));

        await fewTicks();
        expect(handler).not.toHaveBeenCalled();

        // Simulates the mid-loop notification `PluginsSystem.startPlugins` sends right after
        // `pluginA`'s own `start()` returns -- notably, *before* the whole loop (and therefore
        // `resolveStartRequests`) has finished. Without this, a plugin awaiting `pluginA`'s
        // contract from inside its own `start()` would deadlock.
        resolver.notifyStartContractAvailable('pluginA', pluginAContract);
        await fewTicks();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({
          pluginA: { found: true, contract: pluginAContract },
        });
      });

      it('only resolves a multi-dependency request once every dependency has been notified', async () => {
        const handler = jest.fn();
        resolver
          .onStart(SOURCE_PLUGIN, ['pluginA', 'pluginB'])
          .then((contracts) => handler(contracts));

        resolver.notifyStartContractAvailable('pluginA', pluginAContract);
        await fewTicks();
        expect(handler).not.toHaveBeenCalled();

        const pluginBContract = Symbol();
        resolver.notifyStartContractAvailable('pluginB', pluginBContract);
        await fewTicks();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({
          pluginA: { found: true, contract: pluginAContract },
          pluginB: { found: true, contract: pluginBContract },
        });
      });

      it('leaves a request pending for resolveStartRequests to close out when its dependency never starts', async () => {
        const handler = jest.fn();
        resolver
          .onStart(SOURCE_PLUGIN, ['pluginA', 'pluginC'])
          .then((contracts) => handler(contracts));

        // pluginA starts; pluginC is disabled/missing and will never be notified.
        resolver.notifyStartContractAvailable('pluginA', pluginAContract);
        await fewTicks();
        expect(handler).not.toHaveBeenCalled();

        resolver.resolveStartRequests(toMap({ pluginA: pluginAContract }));
        await fewTicks();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({
          pluginA: { found: true, contract: pluginAContract },
          pluginC: { found: false },
        });
      });

      it('does not resolve a since-satisfied request a second time when resolveStartRequests runs', async () => {
        const handler = jest.fn();
        resolver.onStart(SOURCE_PLUGIN, ['pluginA']).then((contracts) => handler(contracts));

        resolver.notifyStartContractAvailable('pluginA', pluginAContract);
        await fewTicks();
        expect(handler).toHaveBeenCalledTimes(1);

        resolver.resolveStartRequests(toMap({ pluginA: pluginAContract }));
        await fewTicks();

        expect(handler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('lazy dependencies', () => {
    beforeEach(() => {
      resolver.setLazyPluginNames(new Set(['pluginA']));
    });

    it('rejects onStart for a dependency that opted into lazy initialization', () => {
      expect(() => resolver.onStart(SOURCE_PLUGIN, ['pluginA'])).toThrowError(
        /onStart cannot resolve plugins that opt into lazy initialization/
      );
    });

    it('rejects onStart when only one of several dependencies is lazy, naming just that one', () => {
      expect(() => resolver.onStart(SOURCE_PLUGIN, ['pluginB', 'pluginA'])).toThrowError(
        /Lazy dependencies: pluginA\./
      );
    });

    it('still resolves onStart for non-lazy dependencies', async () => {
      resolver.resolveStartRequests(toMap({ pluginB: 'contractB' }));

      await expect(resolver.onStart(SOURCE_PLUGIN, ['pluginB'])).resolves.toEqual({
        pluginB: { found: true, contract: 'contractB' },
      });
    });

    it('still allows onSetup for a lazy dependency, whose setup contract needs no deferred init', async () => {
      resolver.resolveSetupRequests(toMap({ pluginA: 'setupContractA' }));

      await expect(resolver.onSetup(SOURCE_PLUGIN, ['pluginA'])).resolves.toEqual({
        pluginA: { found: true, contract: 'setupContractA' },
      });
    });

    it('does not let the onStart guard block loadPluginContract, the sanctioned path', async () => {
      resolver.resolveStartRequests(toMap({ pluginA: pluginAContract }));

      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA')).resolves.toBe(
        pluginAContract
      );
    });

    it('rejects loadPluginContract for a dependency missing from the manifest', async () => {
      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'undeclared')).rejects.toThrowError(
        /Undeclared dependencies: undeclared/
      );
    });
  });

  const createEngineMock = (state$ = new BehaviorSubject<InitState>('idle')) =>
    ({
      isRegistered: jest.fn(),
      waitUntilAvailable: jest.fn(),
      getState: jest.fn(() => state$.value),
      state$: jest.fn(() => state$.asObservable()),
    } as unknown as jest.Mocked<DeferredInitEngine>);

  describe('loadPluginContract', () => {
    it('resolves with the contract once found, without an engine attached', async () => {
      resolver.resolveStartRequests(toMap({ pluginA: pluginAContract }));

      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA')).resolves.toBe(
        pluginAContract
      );
    });

    it('throws when the dependency contract is not found', async () => {
      resolver.resolveStartRequests(toMap({}));

      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA')).rejects.toThrow(
        'Cannot load contract for plugin "pluginA": it is missing, disabled, or has no start contract.'
      );
    });

    it('does not wait on the engine when the dependency is not lazy', async () => {
      const engine = createEngineMock();
      resolver.setDeferredInitEngine(engine);
      resolver.resolveStartRequests(toMap({ pluginA: pluginAContract }));

      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA')).resolves.toBe(
        pluginAContract
      );
      expect(engine.waitUntilAvailable).not.toHaveBeenCalled();
    });

    it('waits on the engine when the dependency is lazy', async () => {
      const engine = createEngineMock();
      engine.waitUntilAvailable.mockResolvedValue(undefined);
      resolver.setDeferredInitEngine(engine);
      resolver.setLazyPluginNames(new Set(['pluginA']));
      resolver.resolveStartRequests(toMap({ pluginA: pluginAContract }));

      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA')).resolves.toBe(
        pluginAContract
      );
      expect(engine.waitUntilAvailable).toHaveBeenCalledWith('pluginA');
    });

    it('waits first and reads the contract second, so a lazy contract published post-boot is found', async () => {
      // The post-boot shape: the boot loop finished without the lazy plugin's contract (its
      // `start()` has not run), and the contract only appears while the engine is being awaited,
      // published by the deferred runner right before the engine reports `available`.
      const engine = createEngineMock();
      engine.waitUntilAvailable.mockImplementation(async () => {
        resolver.notifyStartContractAvailable('pluginA', pluginAContract);
      });
      resolver.setDeferredInitEngine(engine);
      resolver.setLazyPluginNames(new Set(['pluginA']));
      resolver.resolveStartRequests(toMap({}));

      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA')).resolves.toBe(
        pluginAContract
      );
    });

    it('rejects if the engine ultimately fails to become available', async () => {
      const engine = createEngineMock();
      const deferredInitError = new Error('deferred init failed');
      engine.waitUntilAvailable.mockRejectedValue(deferredInitError);
      resolver.setDeferredInitEngine(engine);
      resolver.setLazyPluginNames(new Set(['pluginA']));
      resolver.resolveStartRequests(toMap({ pluginA: pluginAContract }));

      await expect(resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA')).rejects.toBe(
        deferredInitError
      );
    });

    it('resolves once the dependency is notified, without waiting for resolveStartRequests', async () => {
      // Regression test for a deadlock: a plugin calling `loadPluginContract` on an
      // already-started dependency from inside its OWN `start()` must not have to wait for
      // `resolveStartRequests`, since that's only called after the whole `startPlugins` loop --
      // including this very `start()` call -- has finished.
      const handler = jest.fn();
      resolver.loadPluginContract(SOURCE_PLUGIN, 'pluginA').then(handler);

      await fewTicks();
      expect(handler).not.toHaveBeenCalled();

      resolver.notifyStartContractAvailable('pluginA', pluginAContract);
      await fewTicks();

      expect(handler).toHaveBeenCalledWith(pluginAContract);
    });
  });

  describe('lazyInit contract', () => {
    let state$: BehaviorSubject<InitState>;
    let engine: jest.Mocked<DeferredInitEngine>;

    beforeEach(() => {
      state$ = new BehaviorSubject<InitState>('idle');
      engine = createEngineMock(state$);
      resolver.setDeferredInitEngine(engine);
      // `pluginA` is a lazy dependency of the source plugin; the source plugin is lazy itself.
      resolver.setLazyPluginNames(new Set(['pluginA', SOURCE_PLUGIN]));
    });

    describe('trigger', () => {
      it('runs the calling plugin via the engine and resolves once available', async () => {
        engine.waitUntilAvailable.mockResolvedValue(undefined);

        await expect(resolver.trigger(SOURCE_PLUGIN)).resolves.toBeUndefined();
        expect(engine.waitUntilAvailable).toHaveBeenCalledWith(SOURCE_PLUGIN);
      });

      it('rejects for a plugin that did not opt into lazy initialization', async () => {
        await expect(resolver.trigger('pluginB')).rejects.toThrow(
          /did not opt into lazy initialization/
        );
        expect(engine.waitUntilAvailable).not.toHaveBeenCalled();
      });

      it('propagates the engine rejection', async () => {
        const failure = new Error('boom');
        engine.waitUntilAvailable.mockRejectedValue(failure);

        await expect(resolver.trigger(SOURCE_PLUGIN)).rejects.toBe(failure);
      });
    });

    describe('getLazyInitStatus', () => {
      it('reads the engine state for the calling plugin itself', () => {
        state$.next('initializing');
        expect(resolver.getLazyInitStatus(SOURCE_PLUGIN, SOURCE_PLUGIN)).toBe('initializing');
      });

      it('reads the engine state for a declared lazy dependency, without triggering it', () => {
        expect(resolver.getLazyInitStatus(SOURCE_PLUGIN, 'pluginA')).toBe('idle');
        expect(engine.waitUntilAvailable).not.toHaveBeenCalled();
      });

      it('throws for an undeclared dependency', () => {
        expect(() => resolver.getLazyInitStatus(SOURCE_PLUGIN, 'undeclared')).toThrowError(
          /Undeclared dependencies: undeclared/
        );
      });

      it('throws for a declared dependency that is not lazy', () => {
        expect(() => resolver.getLazyInitStatus(SOURCE_PLUGIN, 'pluginB')).toThrowError(
          /"pluginB" did not/
        );
      });
    });

    describe('lazyInitStatus$', () => {
      it('replays the current state and follows transitions', () => {
        const seen: InitState[] = [];
        resolver.lazyInitStatus$(SOURCE_PLUGIN, 'pluginA').subscribe((state) => seen.push(state));
        state$.next('initializing');
        state$.next('available');

        expect(seen).toEqual(['idle', 'initializing', 'available']);
        expect(engine.waitUntilAvailable).not.toHaveBeenCalled();
      });
    });

    describe('onLazyStartService', () => {
      it('fires once with the published contract when the plugin becomes available, without triggering it', () => {
        const callback = jest.fn();
        resolver.onLazyStartService(SOURCE_PLUGIN, 'pluginA', callback);

        state$.next('initializing');
        expect(callback).not.toHaveBeenCalled();

        // The deferred runner publishes the contract right before the engine flips the state.
        resolver.notifyStartContractAvailable('pluginA', pluginAContract);
        state$.next('available');

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(pluginAContract);
        expect(engine.waitUntilAvailable).not.toHaveBeenCalled();
      });

      it('fires immediately if the plugin has already started', () => {
        resolver.notifyStartContractAvailable('pluginA', pluginAContract);
        state$.next('available');

        const callback = jest.fn();
        resolver.onLazyStartService(SOURCE_PLUGIN, 'pluginA', callback);

        expect(callback).toHaveBeenCalledWith(pluginAContract);
      });

      it('logs a throwing callback instead of propagating it', () => {
        resolver.onLazyStartService(SOURCE_PLUGIN, 'pluginA', () => {
          throw new Error('callback boom');
        });

        expect(() => {
          resolver.notifyStartContractAvailable('pluginA', pluginAContract);
          state$.next('available');
        }).not.toThrow();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('callback boom'));
      });

      it('throws for a target that is not a lazy plugin', () => {
        expect(() => resolver.onLazyStartService(SOURCE_PLUGIN, 'pluginB', jest.fn())).toThrowError(
          /"pluginB" did not/
        );
      });
    });
  });
});
