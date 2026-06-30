/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { fetchSourceStepCommonDefinition } from '../../../../../common/threat_intelligence/workflows/step_types/fetch_source/fetch_source_common';
import { runAdapter, UnknownAdapterError } from '../../../adapters';
import type { AdapterRunContext, ScopedActionsClient, SourceHit } from '../../../adapters';

export interface BuildFetchSourceStepDeps {
  logger: Logger;
  /**
   * Lazy resolver for the actions plugin's start contract. Step
   * registration runs at `setup()` time but execution runs after
   * `start()`, so we accept a thunk that resolves on first call (the
   * usual `core.getStartServices()` pattern).
   *
   * Optional so the step can register cleanly in environments where the
   * actions plugin isn't installed (e.g. some FTR configurations).
   * Adapters that require a connector throw a clear error when the
   * factory is absent — see `fetchViaConnector` in the TAXII adapter.
   */
  getActionsStart?: () => Promise<ActionsPluginStartContract | undefined>;
}

/**
 * Build the `threat_intel.fetch_source` step definition.
 *
 * Wraps a step-scoped logger from the host plugin so the adapter run
 * context's `logger.get(<adapter-name>)` chains end up under
 * `securitySolution.threatIntelligence.fetch_source.<adapter>` in the
 * Kibana logs — that path is what operators grep when a feed misbehaves.
 *
 * Also wires a request-scoped `ActionsClient` factory into the adapter
 * run context so adapters can invoke Connectors v2 connectors when a
 * source's `config.connector_id` is set. Currently only the TAXII
 * adapter consumes it; vendor_api will follow once vendor connectors
 * land.
 */
export const buildFetchSourceStepDefinition = (deps: BuildFetchSourceStepDeps) =>
  createServerStepDefinition({
    ...fetchSourceStepCommonDefinition,
    handler: async (context) => {
      // The handler is called with the rendered `with` payload as `input`.
      // Cast through the inferred input shape from the common schema —
      // the Zod runtime parsing is the engine's responsibility (see
      // `CustomStepImpl.createHandlerContext`); we re-narrow on access
      // here so the adapter contract sees a `SourceHit`.
      const { source } = context.input as { source: SourceHit };
      const stepLogger = deps.logger.get(
        'threatIntelligence',
        'fetch_source',
        source._source.adapter_type
      );

      // Capture the resolver in a local so the closure below doesn't
      // need a non-null assertion on `deps.getActionsStart` — keeps the
      // arrow body within the rules' "no non-null assertion" policy.
      const resolveActionsStart = deps.getActionsStart;
      const getActionsClient = resolveActionsStart
        ? async (): Promise<ScopedActionsClient | undefined> => {
            const actionsStart = await resolveActionsStart();
            if (!actionsStart) return undefined;
            // The workflow engine surfaces a synthetic request via
            // `getFakeRequest()`; that's the only request-shaped value
            // available inside a step handler and matches what the
            // actions plugin expects from background callers.
            const fakeRequest = context.contextManager.getFakeRequest();
            return actionsStart.getActionsClientWithRequest(fakeRequest);
          }
        : undefined;

      const runContext: AdapterRunContext = {
        esClient: context.contextManager.getScopedEsClient(),
        logger: stepLogger,
        abortSignal: context.abortSignal,
        now: () => new Date(),
        getActionsClient,
      };

      try {
        const reports = await runAdapter(source, runContext);
        return {
          output: {
            adapter_type: source._source.adapter_type,
            source_id: source._id,
            total_fetched: reports.length,
            reports,
          },
        };
      } catch (err) {
        // Engine convention: a returned `error` is still a step
        // failure (see `BaseAtomicNodeImplementation`), but it lets us
        // attach a structured message instead of the raw stack. The
        // workflow's per-step `on-failure: continue: true` catches
        // these so a single misbehaving feed doesn't abort the run.
        const message = err instanceof Error ? err.message : String(err);
        stepLogger.warn(`Adapter failed for source ${source._id}: ${message}`);
        return {
          error:
            err instanceof UnknownAdapterError
              ? err
              : new Error(`Failed to fetch threat intelligence source ${source._id}: ${message}`),
        };
      }
    },
  });
