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
  ElasticsearchClient,
} from '@kbn/core/server';
import type { DeferredInitExampleDependencyStartContract } from '@kbn/deferred-init-example-dependency-plugin/server';
import {
  INDEX_NAME,
  DATA_ROUTE,
  INSTANCE_STATE_ROUTE,
  DOC_ID,
  MIGRATIONS_DELAY_MS,
} from '../common/constants';
import type { DeferredInitExampleConfig } from './config';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface DeferredInitExampleDoc {
  message: string;
  greeting: string;
  initializedAt: string;
  /**
   * UUID of the instance whose `lazyInitialize` last wrote this document. The document is
   * cluster-side, so it is shared by the whole deployment and every instance rewrites it; this
   * field is what makes "each instance runs the work" visible in the data itself.
   */
  initializedBy: string;
}

/**
 * State `lazyInitialize` produces in the memory of the instance it runs on: nothing persists it,
 * and a peer instance's run does not populate it here.
 *
 * Core runs `lazyInitialize()` and then `start()` on every instance, in that order, so `start()`
 * reads this once and closes over it. Nothing downstream needs a readiness check.
 */
export interface DeferredInitExampleInstanceState {
  /** UUID of the instance that produced this state, i.e. the one serving the request. */
  instanceUuid: string;
  initializedAt: string;
  /** Deferred phases this instance ran, in completion order. */
  completedPhases: readonly string[];
}

/** The start contracts core injects into this plugin's `lazyInitialize()` and `start()`. */
export interface DeferredInitExampleStartDeps {
  deferredInitExampleDependency: DeferredInitExampleDependencyStartContract;
}

/**
 * `deferredInitExample`'s start contract. It does not exist until this instance has run
 * `lazyInitialize()` and `start()`, so every holder of it is downstream of both. Other plugins
 * reach it via `core.plugins.loadPluginContract('deferredInitExample')` (or
 * `context.loadPluginContract` in a route handler), which triggers those phases and waits, or via
 * `core.plugins.lazyInit.onLazyStartService('deferredInitExample', cb)`, which only waits. See the
 * `deferred_init_example_consumer` demo plugin.
 *
 * Core never injects this contract into a dependent's `setup()`/`start()` arguments: a lazy plugin
 * may not be declared under `requiredPlugins`/`optionalPlugins` at all.
 */
export interface DeferredInitExampleStartContract {
  /** Reads the cluster-side document written by whichever instance last ran `lazyInitialize`. */
  getDoc(): Promise<DeferredInitExampleDoc>;
  /** Reads the state this instance's own `lazyInitialize` produced. Synchronous, no check. */
  getInstanceState(): DeferredInitExampleInstanceState;
}

export class DeferredInitExampleServerPlugin
  implements
    Plugin<
      object,
      DeferredInitExampleStartContract,
      Record<string, never>,
      DeferredInitExampleStartDeps
    >
{
  private readonly logger: Logger;
  private readonly config: DeferredInitExampleConfig;
  private readonly instanceUuid: string;
  // Produced by `lazyInitialize`, consumed by `start`. Core guarantees that order on this instance.
  private instanceState?: DeferredInitExampleInstanceState;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.config = initializerContext.config.get<DeferredInitExampleConfig>();
    this.instanceUuid = initializerContext.env.instanceUuid;
  }

  /**
   * Runs at boot, like every plugin's `setup()`. Registration only: routes here are gated by
   * core, so their handlers only ever run after `lazyInitialize()` and `start()` have completed
   * on this instance. That is why `getStartServices()` inside them resolves immediately with the
   * contract `start()` built, and why nothing here does any Elasticsearch work of its own.
   */
  public setup(
    core: CoreSetup<DeferredInitExampleStartDeps, DeferredInitExampleStartContract>
  ): object {
    this.logger.debug('deferredInitExample: Setup');

    const router = core.http.createRouter();

    router.get(
      {
        path: DATA_ROUTE,
        security: {
          authz: {
            enabled: false,
            reason: 'Demo/dev route; exercises lazy initialization.',
          },
        },
        validate: false,
      },
      async (_context, _request, response) => {
        const [, , self] = await core.getStartServices();
        return response.ok({ body: await self.getDoc() });
      }
    );

    router.get(
      {
        path: INSTANCE_STATE_ROUTE,
        security: {
          authz: {
            enabled: false,
            reason: 'Demo/dev route; exercises lazy initialization.',
          },
        },
        validate: false,
      },
      async (_context, _request, response) => {
        const [, , self] = await core.getStartServices();
        return response.ok({ body: self.getInstanceState() });
      }
    );

    return {};
  }

  /**
   * The costly, retriable phase. Runs on this instance's first trigger, never at boot, with the
   * same arguments `start()` receives: `core` is the real `CoreStart`, and `plugins` carries the
   * injected start contracts of this plugin's ordinary dependencies.
   */
  public async lazyInitialize(
    core: CoreStart,
    plugins: DeferredInitExampleStartDeps
  ): Promise<void> {
    const { logger } = this;
    logger.info(
      '[deferredInitExample] lazyInitialize: running deferred Elasticsearch initialization'
    );

    const completedPhases: string[] = [];

    // Phase 1: stand-in for slow saved-object migrations (fake await, no real migration).
    logger.info('[deferredInitExample] step: running saved object migrations');
    await delay(MIGRATIONS_DELAY_MS);
    completedPhases.push('savedObjectMigrations');

    if (this.config.forceFailure) {
      throw new Error('[deferredInitExample] forced failure (config forceFailure=true)');
    }

    // Phase 2: stand-in for additional per-project default-state initialization.
    logger.info('[deferredInitExample] step: initializing default state');
    await delay(this.config.initDelayMs);
    completedPhases.push('defaultState');

    // Phase 3: use an ordinary dependency's start contract. It is injected here exactly as it
    // would be into `start()`, because every non-lazy dependency has started long before this
    // runs. No accessor, no captured `core`, no waiting.
    logger.info('[deferredInitExample] step: reading deferredInitExampleDependency greeting');
    const greeting = plugins.deferredInitExampleDependency.getGreeting();
    completedPhases.push('readDependencyGreeting');

    // Phase 4: real direct ES write (create index + mapping, write the default document).
    logger.info('[deferredInitExample] step: creating index and writing default document');
    const client = core.elasticsearch.client.asInternalUser;

    // `lazyInitialize` runs once per Kibana instance, so several instances can reach this point
    // concurrently against the same cluster: tolerate a peer having created the index between the
    // check and the create, rather than failing the whole run on the loser of that race.
    try {
      await client.indices.create({
        index: INDEX_NAME,
        mappings: {
          properties: {
            message: { type: 'text' },
            greeting: { type: 'text' },
            initializedAt: { type: 'date' },
            initializedBy: { type: 'keyword' },
          },
        },
      });
    } catch (error) {
      if (error?.meta?.body?.error?.type !== 'resource_already_exists_exception') {
        throw error;
      }
      logger.debug('[deferredInitExample] index already exists; continuing');
    }

    const initializedAt = new Date().toISOString();
    // Idempotent by construction: a fixed document id, so a peer instance running this same
    // phase concurrently overwrites rather than duplicates.
    await client.index({
      index: INDEX_NAME,
      id: DOC_ID,
      document: {
        message: 'Initialized by deferred lazyInitialize',
        greeting,
        initializedAt,
        initializedBy: this.instanceUuid,
      },
      refresh: true,
    });
    completedPhases.push('wroteDefaultDocument');

    // Phase 5: hand the result to `start()`. Assigned once, at the end, so a run that throws
    // earlier leaves nothing half-built behind. Core re-runs this whole method on this instance
    // when it retries, rather than resuming it.
    this.instanceState = {
      instanceUuid: this.instanceUuid,
      initializedAt,
      completedPhases,
    };

    logger.info('[deferredInitExample] lazyInitialize: deferred initialization complete');
  }

  /**
   * Deferred: core calls this only after `lazyInitialize()` succeeded on this instance, so the
   * contract is built over initialized state and its methods need no readiness checks. If
   * `lazyInitialize()` threw, this never runs; core retries the failed phase instead.
   */
  public start(core: CoreStart): DeferredInitExampleStartContract {
    this.logger.debug('deferredInitExample: Started');

    const { instanceState } = this;
    if (!instanceState) {
      // Core's ordering guarantee makes this unreachable; a throw here is a core bug, not a state
      // callers are expected to handle.
      throw new Error('[deferredInitExample] start() ran before lazyInitialize() completed');
    }

    const client = core.elasticsearch.client.asInternalUser;
    return {
      getDoc: () => this.getDocFrom(client),
      getInstanceState: () => instanceState,
    };
  }

  private async getDocFrom(client: ElasticsearchClient): Promise<DeferredInitExampleDoc> {
    const result = await client.get<DeferredInitExampleDoc>({
      index: INDEX_NAME,
      id: DOC_ID,
    });
    return result._source!;
  }

  public stop(): void {}
}
