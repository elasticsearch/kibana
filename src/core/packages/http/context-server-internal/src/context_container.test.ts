/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginOpaqueId } from '@kbn/core-base-common';
import type {
  RequestHandlerContextBase,
  KibanaRequest,
  KibanaResponseFactory,
} from '@kbn/core-http-server';
import { ContextContainer } from './context_container';

const pluginA = Symbol('pluginA');
const pluginB = Symbol('pluginB');
const pluginC = Symbol('pluginC');
const pluginD = Symbol('pluginD');
const plugins: ReadonlyMap<PluginOpaqueId, PluginOpaqueId[]> = new Map([
  [pluginA, []],
  [pluginB, [pluginA]],
  [pluginC, [pluginA, pluginB]],
  [pluginD, []],
]);
const coreId = Symbol();

interface MyContext extends RequestHandlerContextBase {
  core: any;
  core1: string;
  core2: number;
  ctxFromA: string;
  ctxFromB: number;
  ctxFromC: boolean;
  ctxFromD: object;
}

type TestContext<T> = T & RequestHandlerContextBase;

const createKibanaRequest = (): KibanaRequest => {
  return {} as unknown as KibanaRequest;
};
const createKibanaResponseFactory = (): KibanaResponseFactory => {
  return {} as unknown as KibanaResponseFactory;
};

describe('ContextContainer', () => {
  describe('registerContext', () => {
    it('throws an error if the same context is registered twice', () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
        coreId,
        'ctxFromA',
        () => 'aString'
      );

      expect(() =>
        contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
          coreId,
          'ctxFromA',
          () => 'aString'
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Context provider for ctxFromA has already been registered."`
      );
    });

    it('throws an error if a `resolve` context is registered', () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      expect(() =>
        contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
          coreId,
          // @ts-expect-error protected with typing too
          'resolve',
          () => 'aString'
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Cannot register a provider for resolve, it is a reserved keyword."`
      );
    });

    it('throws error if called with `loadPluginContract` as a context name', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);

      expect(() =>
        contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
          coreId,
          // @ts-expect-error protected with typing too
          'loadPluginContract',
          () => 'aString'
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Cannot register a provider for loadPluginContract, it is a reserved keyword."`
      );
    });

    it('throws error if called with an unknown symbol', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      await expect(() =>
        contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
          Symbol('unknown'),
          'ctxFromA',
          jest.fn()
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Cannot register context for unknown plugin: Symbol(unknown)"`
      );
    });

    it('reports a TS error if returned contract does not satisfy the Context interface', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      await expect(() =>
        contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
          pluginA,
          'ctxFromA',
          // @ts-expect-error expected string, returned number
          async () => 1
        )
      ).not.toThrow();
    });

    it('reports a TS error if registers a context for unknown property name', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      await expect(() =>
        // @ts-expect-error expects ctxFromB, but given ctxFromC
        contextContainer.registerContext<TestContext<{ ctxFromB: string; core: any }>, 'ctxFromC'>(
          pluginB,
          'ctxFromC',
          async () => 1
        )
      ).not.toThrow();
    });
  });

  describe('context building', () => {
    const resolveAllContexts = async (ctx: Record<string, any>): Promise<unknown> => {
      const resolved = {} as Record<string, any>;
      for (const key of Object.getOwnPropertyNames(ctx)) {
        // Context-level utilities that every built context carries, not registered context parts.
        if (key === 'resolve' || key === 'loadPluginContract') {
          continue;
        }
        resolved[key] = await ctx[key];
      }
      return resolved;
    };

    it('lazily loads the providers when accessed', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);

      const core1provider = jest.fn().mockReturnValue('core1');
      const ctxFromAProvider = jest.fn().mockReturnValue('ctxFromA');

      contextContainer.registerContext<TestContext<{ core1: string; core: any }>, 'core1'>(
        coreId,
        'core1',
        core1provider
      );

      contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
        pluginA,
        'ctxFromA',
        ctxFromAProvider
      );

      let context: any;
      const rawHandler1 = jest.fn((ctx) => {
        context = ctx;
        return 'rawHandler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginC, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      await handler1(request, response);

      expect(core1provider).not.toHaveBeenCalled();
      expect(ctxFromAProvider).not.toHaveBeenCalled();

      await context!.core1;

      expect(core1provider).toHaveBeenCalledTimes(1);
      expect(ctxFromAProvider).not.toHaveBeenCalled();

      await context!.ctxFromA;

      expect(core1provider).toHaveBeenCalledTimes(1);
      expect(ctxFromAProvider).toHaveBeenCalledTimes(1);
    });

    it(`does not eagerly loads a provider's dependencies`, async () => {
      const contextContainer = new ContextContainer(plugins, coreId);

      const core1provider = jest.fn().mockReturnValue('core1');
      const ctxFromAProvider = jest.fn().mockReturnValue('ctxFromA');

      contextContainer.registerContext<TestContext<{ core1: string; core: any }>, 'core1'>(
        coreId,
        'core1',
        core1provider
      );

      contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
        pluginA,
        'ctxFromA',
        ctxFromAProvider
      );

      let context: any;
      const rawHandler1 = jest.fn((ctx) => {
        context = ctx;
        return 'rawHandler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginC, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      await handler1(request, response);

      expect(core1provider).not.toHaveBeenCalled();
      expect(ctxFromAProvider).not.toHaveBeenCalled();

      await context!.ctxFromA;

      expect(core1provider).not.toHaveBeenCalled();
      expect(ctxFromAProvider).toHaveBeenCalledTimes(1);
    });

    it(`allows to load a dependency from a provider`, async () => {
      const contextContainer = new ContextContainer(plugins, coreId);

      const core1provider = jest.fn().mockReturnValue('core1');
      const ctxFromAProvider = jest.fn().mockImplementation(async (ctx: any) => {
        const core1 = await ctx.core1;
        return `${core1}-ctxFromA`;
      });

      contextContainer.registerContext<TestContext<{ core1: string; core: any }>, 'core1'>(
        coreId,
        'core1',
        core1provider
      );

      contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
        pluginA,
        'ctxFromA',
        ctxFromAProvider
      );

      let context: any;
      const rawHandler1 = jest.fn((ctx) => {
        context = ctx;
        return 'rawHandler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginC, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      await handler1(request, response);

      expect(core1provider).not.toHaveBeenCalled();
      expect(ctxFromAProvider).not.toHaveBeenCalled();

      const contextValue = await context!.ctxFromA;

      expect(contextValue).toEqual('core1-ctxFromA');
      expect(core1provider).toHaveBeenCalledTimes(1);
      expect(ctxFromAProvider).toHaveBeenCalledTimes(1);
    });

    it(`only calls a provider once and caches the returned value`, async () => {
      const contextContainer = new ContextContainer(plugins, coreId);

      const core1provider = jest.fn().mockReturnValue('core1');
      const ctxFromAProvider = jest.fn().mockImplementation(async (ctx: any) => {
        const core1 = await ctx.core1;
        return `${core1}-ctxFromA`;
      });

      contextContainer.registerContext<TestContext<{ core1: string; core: any }>, 'core1'>(
        coreId,
        'core1',
        core1provider
      );

      contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
        pluginA,
        'ctxFromA',
        ctxFromAProvider
      );

      let context: any;
      const rawHandler1 = jest.fn((ctx) => {
        context = ctx;
        return 'rawHandler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginC, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      await handler1(request, response);

      expect(core1provider).not.toHaveBeenCalled();
      expect(ctxFromAProvider).not.toHaveBeenCalled();

      await context!.core1;
      await context!.ctxFromA;
      await context!.core1;

      expect(core1provider).toHaveBeenCalledTimes(1);
      expect(ctxFromAProvider).toHaveBeenCalledTimes(1);
    });

    it('resolves dependencies', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      expect.assertions(10);
      contextContainer.registerContext<TestContext<{ core1: string; core: any }>, 'core1'>(
        coreId,
        'core1',
        async (context) => {
          expect(await resolveAllContexts(context)).toEqual({});
          return 'core';
        }
      );

      contextContainer.registerContext<TestContext<{ ctxFromA: string; core: any }>, 'ctxFromA'>(
        pluginA,
        'ctxFromA',
        async (context) => {
          expect(await resolveAllContexts(context)).toEqual({ core1: 'core' });
          return 'aString';
        }
      );
      contextContainer.registerContext<TestContext<{ ctxFromB: number; core: any }>, 'ctxFromB'>(
        pluginB,
        'ctxFromB',
        async (context) => {
          expect(await resolveAllContexts(context)).toEqual({ core1: 'core', ctxFromA: 'aString' });
          return 299;
        }
      );
      contextContainer.registerContext<TestContext<{ ctxFromC: boolean; core: any }>, 'ctxFromC'>(
        pluginC,
        'ctxFromC',
        async (context) => {
          expect(await resolveAllContexts(context)).toEqual({
            core1: 'core',
            ctxFromA: 'aString',
            ctxFromB: 299,
          });
          return false;
        }
      );
      contextContainer.registerContext<TestContext<{ ctxFromD: {}; core: any }>, 'ctxFromD'>(
        pluginD,
        'ctxFromD',
        async (context) => {
          expect(await resolveAllContexts(context)).toEqual({ core1: 'core' });
          return {};
        }
      );

      const rawHandler1 = jest.fn(async (context) => {
        expect(await resolveAllContexts(context)).toEqual({
          core1: 'core',
          ctxFromA: 'aString',
          ctxFromB: 299,
          ctxFromC: false,
        });
        return 'handler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginC, rawHandler1);

      const rawHandler2 = jest.fn(async (context) => {
        expect(await resolveAllContexts(context)).toEqual({
          core1: 'core',
          ctxFromD: {},
        });
        return 'handler2' as any;
      });

      const handler2 = contextContainer.createHandler(pluginD, rawHandler2);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();

      await handler1(request, response);
      await handler2(request, response);

      // Should have context from pluginC, its deps, and core
      expect(rawHandler1).toHaveBeenCalledWith(expect.any(Object), request, response);

      // Should have context from pluginD, and core
      expect(rawHandler2).toHaveBeenCalledWith(expect.any(Object), request, response);
    });

    it('exposes all core context to all providers regardless of registration order', async () => {
      expect.assertions(5);

      const contextContainer = new ContextContainer(plugins, coreId);
      contextContainer
        .registerContext<MyContext, 'ctxFromA'>(pluginA, 'ctxFromA', async (context) => {
          expect(await resolveAllContexts(context)).toEqual({ core1: 'core', core2: 101 });
          return `aString ${await context.core1} ${await context.core2}`;
        })
        .registerContext<MyContext, 'core1'>(coreId, 'core1', () => 'core')
        .registerContext<MyContext, 'core2'>(coreId, 'core2', () => 101)
        .registerContext<MyContext, 'ctxFromB'>(pluginB, 'ctxFromB', async (context) => {
          expect(await resolveAllContexts(context)).toEqual({
            core1: 'core',
            core2: 101,
            ctxFromA: 'aString core 101',
          });
          return 277;
        });

      const rawHandler1 = jest.fn(async (context) => {
        expect(await resolveAllContexts(context)).toEqual({
          core1: 'core',
          core2: 101,
          ctxFromA: 'aString core 101',
          ctxFromB: 277,
        });
        return 'handler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginB, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      expect(await handler1(request, response)).toEqual('handler1');

      expect(rawHandler1).toHaveBeenCalledWith(expect.any(Object), request, response);
    });

    it('exposes all core context to core providers', async () => {
      expect.assertions(5);
      const contextContainer = new ContextContainer(plugins, coreId);

      contextContainer
        .registerContext<MyContext, 'core1'>(coreId, 'core1', async (context) => {
          expect(await resolveAllContexts(context)).toEqual({});
          return 'core';
        })
        .registerContext<MyContext, 'core2'>(coreId, 'core2', async (context) => {
          expect(await resolveAllContexts(context)).toEqual({ core1: 'core' });
          return 101;
        });

      const rawHandler1 = jest.fn(async (context) => {
        expect(await resolveAllContexts(context)).toEqual({
          core1: 'core',
          core2: 101,
        });
        return 'handler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginA, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      expect(await handler1(request, response)).toEqual('handler1');

      // If no context is registered for pluginA, only core contexts should be exposed
      expect(rawHandler1).toHaveBeenCalledWith(expect.any(Object), request, response);
    });

    it('does not expose plugin contexts to core handler', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);

      contextContainer
        .registerContext<MyContext, 'core1'>(coreId, 'core1', (context) => 'core')
        .registerContext<MyContext, 'ctxFromA'>(pluginA, 'ctxFromA', (context) => 'aString');

      const rawHandler1 = jest.fn(async (context) => {
        // pluginA context should not be present in a core handler
        expect(await resolveAllContexts(context)).toEqual({
          core1: 'core',
        });
        return 'handler1' as any;
      });
      const handler1 = contextContainer.createHandler(coreId, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      expect(await handler1(request, response)).toEqual('handler1');

      expect(rawHandler1).toHaveBeenCalledWith(expect.any(Object), request, response);
    });

    it('passes additional arguments to providers', async () => {
      expect.assertions(7);
      const contextContainer = new ContextContainer(plugins, coreId);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      contextContainer.registerContext<MyContext, 'core1'>(coreId, 'core1', (context, req, res) => {
        expect(req).toBe(request);
        expect(res).toBe(response);
        return 'core';
      });

      contextContainer.registerContext<MyContext, 'ctxFromB'>(
        pluginD,
        'ctxFromB',
        (context, req, res) => {
          expect(req).toBe(request);
          expect(res).toBe(response);
          return 77;
        }
      );

      const rawHandler1 = jest.fn(async (context) => {
        expect(await resolveAllContexts(context)).toEqual({
          core1: 'core',
          ctxFromB: 77,
        });
        return 'handler1' as any;
      });
      const handler1 = contextContainer.createHandler(pluginD, rawHandler1);

      expect(await handler1(request, response)).toEqual('handler1');

      expect(rawHandler1).toHaveBeenCalledWith(expect.any(Object), request, response);
    });

    describe('#resolve', () => {
      it('resolves dependencies', async () => {
        const contextContainer = new ContextContainer(plugins, coreId);
        expect.assertions(10);
        contextContainer.registerContext<MyContext, 'core1'>(coreId, 'core1', async (context) => {
          expect(await context.resolve([])).toEqual({});
          return 'core';
        });

        contextContainer.registerContext<MyContext, 'ctxFromA'>(
          pluginA,
          'ctxFromA',
          async (context) => {
            expect(await context.resolve(['core1'])).toEqual({ core1: 'core' });
            return 'aString';
          }
        );
        contextContainer.registerContext<MyContext, 'ctxFromB'>(
          pluginB,
          'ctxFromB',
          async (context) => {
            expect(await context.resolve(['core1', 'ctxFromA'])).toEqual({
              core1: 'core',
              ctxFromA: 'aString',
            });
            return 299;
          }
        );
        contextContainer.registerContext<MyContext, 'ctxFromC'>(
          pluginC,
          'ctxFromC',
          async (context) => {
            expect(await context.resolve(['core1', 'ctxFromA', 'ctxFromB'])).toEqual({
              core1: 'core',
              ctxFromA: 'aString',
              ctxFromB: 299,
            });
            return false;
          }
        );
        contextContainer.registerContext<MyContext, 'ctxFromD'>(
          pluginD,
          'ctxFromD',
          async (context) => {
            expect(await context.resolve(['core1'])).toEqual({ core1: 'core' });
            return {};
          }
        );

        const rawHandler1 = jest.fn(async (context) => {
          expect(await context.resolve(['core1', 'ctxFromA', 'ctxFromB', 'ctxFromC'])).toEqual({
            core1: 'core',
            ctxFromA: 'aString',
            ctxFromB: 299,
            ctxFromC: false,
          });
          return 'handler1' as any;
        });
        const handler1 = contextContainer.createHandler(pluginC, rawHandler1);

        const rawHandler2 = jest.fn(async (context) => {
          expect(await context.resolve(['core1', 'ctxFromD'])).toEqual({
            core1: 'core',
            ctxFromD: {},
          });
          return 'handler2' as any;
        });

        const handler2 = contextContainer.createHandler(pluginD, rawHandler2);

        const request = createKibanaRequest();
        const response = createKibanaResponseFactory();

        await handler1(request, response);
        await handler2(request, response);

        // Should have context from pluginC, its deps, and core
        expect(rawHandler1).toHaveBeenCalledWith(expect.any(Object), request, response);

        // Should have context from pluginD, and core
        expect(rawHandler2).toHaveBeenCalledWith(expect.any(Object), request, response);
      });
    });
  });

  describe('context.loadPluginContract', () => {
    const buildContextFor = async (source: symbol, loader?: jest.Mock) => {
      const contextContainer = new ContextContainer(plugins, coreId, loader);
      const rawHandler = jest.fn((_context: unknown) => 'handler' as any);
      const handler = contextContainer.createHandler(source, rawHandler);
      await handler(createKibanaRequest(), createKibanaResponseFactory());
      return rawHandler.mock.calls[0][0] as {
        loadPluginContract: <T>(name: string) => Promise<T>;
      };
    };

    it('scopes the call to the plugin that registered the route', async () => {
      const loader = jest.fn().mockResolvedValue('theContract');
      const context = await buildContextFor(pluginA, loader);

      await expect(context.loadPluginContract('pluginB')).resolves.toBe('theContract');
      // `pluginA` -- not the requested dependency -- is what lets the loader enforce that the
      // dependency is declared in the *caller's* manifest.
      expect(loader).toHaveBeenCalledWith(pluginA, 'pluginB');
    });

    it('uses the source of the handler, not of the context provider', async () => {
      const loader = jest.fn().mockResolvedValue(undefined);
      const context = await buildContextFor(pluginB, loader);

      await context.loadPluginContract('pluginA');
      expect(loader).toHaveBeenCalledWith(pluginB, 'pluginA');
    });

    it('propagates a rejection from the loader, e.g. a failed deferred init', async () => {
      const failure = new Error('deferred init failed');
      const context = await buildContextFor(pluginA, jest.fn().mockRejectedValue(failure));

      await expect(context.loadPluginContract('pluginB')).rejects.toBe(failure);
    });

    it('rejects with a clear message when no loader was supplied, as in preboot', async () => {
      const context = await buildContextFor(pluginA);

      await expect(context.loadPluginContract('pluginB')).rejects.toThrowError(
        /only available to routes registered by a standard plugin/
      );
    });
  });

  describe('createHandler', () => {
    it('throws error if called with an unknown symbol', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      await expect(() =>
        contextContainer.createHandler(Symbol('unknown'), jest.fn())
      ).toThrowErrorMatchingInlineSnapshot(
        `"Cannot create handler for unknown plugin: Symbol(unknown)"`
      );
    });

    it('returns value from original handler', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);
      const rawHandler1 = jest.fn(() => 'handler1' as any);
      const handler1 = contextContainer.createHandler(pluginA, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      expect(await handler1(request, response)).toEqual('handler1');
    });

    it('passes additional arguments to handlers', async () => {
      const contextContainer = new ContextContainer(plugins, coreId);

      const rawHandler1 = jest.fn(() => 'handler1' as any);
      const handler1 = contextContainer.createHandler(pluginA, rawHandler1);

      const request = createKibanaRequest();
      const response = createKibanaResponseFactory();
      await handler1(request, response);
      expect(rawHandler1).toHaveBeenCalledWith(
        { resolve: expect.any(Function), loadPluginContract: expect.any(Function) },
        request,
        response
      );
    });
  });
});
