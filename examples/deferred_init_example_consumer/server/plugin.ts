/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '@kbn/core/server';
import type { DeferredInitExampleStartContract } from '@kbn/deferred-init-example-plugin/server';
import { DATA_ROUTE, LAZY_PLUGIN_ID, STATUS_ROUTE } from '../common/constants';

/**
 * Start contract of the consumer. Demonstrates the "function-in-contract" pattern: `start()`
 * returns a function that loads a lazy dependency's contract, rather than loading it during
 * `start()` itself.
 */
export interface DeferredInitExampleConsumerStartContract {
  /**
   * Resolves `deferredInitExample`'s start contract, triggering (and waiting for) its deferred
   * phases on the way.
   *
   * MUST be called post-boot (from a route handler, task runner, etc.). Core's start-cycle guard
   * rejects `loadPluginContract` for a lazy plugin during the `start()` lifecycle, so another
   * plugin must NOT call this from inside its own `start()`.
   */
  getDeferredInitExample: () => Promise<DeferredInitExampleStartContract>;
}

/** What this plugin learned about the lazy plugin without ever triggering it. */
interface ObservedLazyStart {
  /** When this instance saw `deferredInitExample` become available. */
  at: string;
  /** Read off the contract handed to the `onLazyStartService` callback. */
  instanceUuid: string;
}

export class DeferredInitExampleConsumerServerPlugin
  implements Plugin<object, DeferredInitExampleConsumerStartContract>
{
  private readonly logger: Logger;
  private observedLazyStart?: ObservedLazyStart;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup): object {
    this.logger.debug('deferredInitExampleConsumer: Setup');

    const router = core.http.createRouter();

    // Pattern 1: trigger and wait. `context.loadPluginContract` from a route handler (post-boot).
    // This plugin never touches `deferredInitExample`'s own routes, yet loading its start contract
    // here still (1) kicks its `lazyInitialize()` + `start()` on this instance if nobody has yet,
    // (2) waits for them, and (3) throws DeferredInitializationError (-> 503 via core's central
    // handler) on failure. It is scoped to this plugin, so `deferredInitExample` must be declared
    // in this plugin's manifest -- as `runtimePluginDependencies`, since a lazy plugin cannot be a
    // required/optional dependency.
    router.get(
      {
        path: DATA_ROUTE,
        security: {
          authz: {
            enabled: false,
            reason: 'Demo/dev route; exercises the triggering accessor for a lazy plugin.',
          },
        },
        validate: false,
      },
      async (context, _request, response) => {
        const deferredInitExample =
          await context.loadPluginContract<DeferredInitExampleStartContract>(LAZY_PLUGIN_ID);
        // Two reads with deliberately different guarantees. `getDoc()` hits cluster-side state,
        // which any instance's run could have written. `getInstanceState()` reads state produced
        // by *this* instance's own `lazyInitialize`, with no readiness check: the contract only
        // exists because both deferred phases ran here.
        const instanceState = deferredInitExample.getInstanceState();
        const doc = await deferredInitExample.getDoc();
        return response.ok({ body: { doc, instanceState } });
      }
    );

    // Pattern 3: observe without triggering. Fires once, on this instance, when the lazy plugin
    // has started (immediately if it already had), with its start contract. Nothing here causes it
    // to start: on a quiet node this callback simply never runs.
    core.plugins.lazyInit.onLazyStartService<DeferredInitExampleStartContract>(
      LAZY_PLUGIN_ID,
      (contract) => {
        this.observedLazyStart = {
          at: new Date().toISOString(),
          instanceUuid: contract.getInstanceState().instanceUuid,
        };
        this.logger.info(
          `[deferredInitExampleConsumer] observed ${LAZY_PLUGIN_ID} start on instance ${this.observedLazyStart.instanceUuid}`
        );
      }
    );

    // Pattern 4: a synchronous, non-triggering read. This is the shape a setup-registered callback
    // that runs on someone else's traffic (a task runner, a capabilities switcher, a usage
    // collector) uses to decide whether to no-op: it can neither wait nor trigger. This route is
    // not gated (this plugin is not lazy) and hitting it never starts `deferredInitExample`.
    router.get(
      {
        path: STATUS_ROUTE,
        security: {
          authz: {
            enabled: false,
            reason: 'Demo/dev route; exercises the non-triggering status read for a lazy plugin.',
          },
        },
        validate: false,
      },
      (_context, _request, response) =>
        response.ok({
          body: {
            status: core.plugins.lazyInit.getStatus(LAZY_PLUGIN_ID),
            observedLazyStart: this.observedLazyStart ?? null,
          },
        })
    );

    return {};
  }

  public start(core: CoreStart): DeferredInitExampleConsumerStartContract {
    this.logger.debug('deferredInitExampleConsumer: Started');

    // Pattern 2: the "function-in-contract" pattern Fleet's real dependents use to resolve things
    // like `fleetSetupCompleted()`. `start()` returns a function that loads the lazy dependency; it
    // is only ever invoked post-boot by whoever consumes this contract. Doing the
    // `loadPluginContract` call *here in `start()`* instead would be rejected by core's start-cycle
    // guard, because awaiting a lazy plugin's deferred phases blocks boot.
    return {
      getDeferredInitExample: () =>
        core.plugins.loadPluginContract<DeferredInitExampleStartContract>(LAZY_PLUGIN_ID),
    };
  }

  public stop(): void {}
}
