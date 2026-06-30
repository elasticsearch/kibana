/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SourceType } from '../../../common/threat_intelligence/hub';
import { rssAdapter } from './rss/rss_adapter';
import { stixAdapter } from './stix/stix_adapter';
import { taxiiAdapter } from './taxii/taxii_adapter';
import { vendorApiAdapter } from './vendor_api/vendor_api_adapter';
import type { AdapterRunContext, FetchAdapter, NormalizedReport, SourceHit } from './types';

/**
 * Static registry of built-in adapters. Adapter modules are pure (no
 * side effects on import) so this map can live at module scope safely.
 *
 * `email`, `manual`, and `telemetry` source types are intentionally not
 * routed here — those values exist in the closed-set `SOURCE_TYPES`
 * enum for ingestion-pipeline provenance (manual analyst paste,
 * generalize-from-telemetry synthetic reports, future email ingestion)
 * and are written into `.kibana-threat-reports` via different code
 * paths (`services/ingest_report.ts`, `services/generalize_from_telemetry.ts`).
 * The source-ingestion workflow only handles network-pulled feeds.
 */
const ADAPTERS: Partial<Record<SourceType, FetchAdapter>> = {
  rss: rssAdapter,
  stix: stixAdapter,
  taxii: taxiiAdapter,
  vendor_api: vendorApiAdapter,
};

/**
 * Thrown by `runAdapter` when the source's `adapter_type` has no
 * registered handler. Surfaced as a step error so the workflow's
 * `on-failure: continue: true` skips the source — same behavior the old
 * YAML `default` branch's `data.set` warning step had, just without
 * losing the diagnostic that an unknown type slipped past the source
 * catalog's validation.
 */
export class UnknownAdapterError extends Error {
  constructor(public readonly adapterType: string, public readonly sourceId: string) {
    super(
      `No adapter registered for source ${sourceId} (adapter_type=${adapterType}). ` +
        `Known adapter types: ${Object.keys(ADAPTERS).join(', ')}.`
    );
    this.name = 'UnknownAdapterError';
  }
}

/**
 * Resolve and run the adapter for a given source.
 *
 * Errors thrown by an adapter propagate up — the step handler converts
 * them to `StepHandlerResult.error`, which the workflow engine then
 * routes through the per-step `on-failure: continue: true` so a single
 * misbehaving source can't break the rest of the run. Adapters that
 * succeed but produce no reports return `[]`; the step output's
 * `total_fetched: 0` is the signal for "ran cleanly, nothing new".
 */
export const runAdapter = async (
  source: SourceHit,
  context: AdapterRunContext
): Promise<NormalizedReport[]> => {
  const adapter = ADAPTERS[source._source.adapter_type];
  if (!adapter) {
    throw new UnknownAdapterError(source._source.adapter_type, source._id);
  }
  return adapter.run(source, context);
};

/** Test helper — exposes the registry without forcing tests to import each adapter module. */
export const __getRegisteredAdapterTypesForTest = (): SourceType[] =>
  Object.keys(ADAPTERS) as SourceType[];
