/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { SEVERITY_LEVELS, SOURCE_TYPES } from '../../../hub/constants';

/**
 * Step type id for the threat-intelligence source-ingestion fetch step.
 *
 * Replaces the per-adapter `http` + parse + fingerprint chain that used to
 * live inline in `workflows/source_ingestion.yaml`. The step takes a single
 * `.kibana-threat-intel-sources` hit, resolves the right server-side
 * adapter from `_source.adapter_type`, and returns an array of normalized
 * `.kibana-threat-reports` documents that the workflow can dedup-and-write
 * one at a time.
 *
 * Namespace mirrors `THREAT_INTEL_TOOL_IDS` in `hub/constants.ts` —
 * `threat_intel.<verb>` for every threat-intelligence-owned engine
 * extension. Anything starting with `elasticsearch.` or `kibana.` is
 * routed by the engine to its built-in step impls before custom
 * extensions are consulted, so we MUST stay outside those prefixes.
 */
export const FETCH_SOURCE_STEP_TYPE = 'threat_intel.fetch_source' as const;

/**
 * Subset of an Elasticsearch hit that the step needs.
 *
 * The `foreach` step in `source_ingestion.yaml` iterates over
 * `steps.load_sources.output.hits.hits`, so each `foreach.item` is a hit
 * envelope with `_id`, optional `_index`, and a `_source` body matching
 * the `.kibana-threat-intel-sources` mapping (see
 * `setup/index_templates.ts`). Anything inside `config` is opaque to the
 * step itself — adapter implementations decide what they need.
 */
export const sourceHitSchema = z.object({
  _id: z.string(),
  _index: z.string().optional(),
  _source: z.object({
    adapter_type: z.enum(SOURCE_TYPES),
    name: z.string(),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()),
    tags: z.array(z.string()).optional(),
    space_id: z.string().optional(),
  }),
});

export const fetchSourceInputSchema = z.object({
  /**
   * The full `.kibana-threat-intel-sources` hit for the source being
   * fetched. The workflow passes `{{ foreach.item }}` so the step has
   * access to the source `_id` (used in `source.adapter_id`) and the
   * `_source.config` payload (URL, vendor, paging cursor, etc.).
   *
   * Accepts either a literal hit object or a Liquid-template string
   * (e.g. `"{{ foreach.item }}"`). Mirrors the approach already used by
   * the built-in `foreach` step (`foreach: string | array`) so the YAML
   * editor's strict-schema validator stops flagging the templated form
   * as a type mismatch — runtime templating in `WorkflowEngine` resolves
   * the string back to the object before the server step receives it.
   */
  source: z.union([z.string(), sourceHitSchema]),
});

/**
 * Normalized report shape. Mirrors the strict mapping at
 * `setup/index_templates.ts` — every property declared here is also a
 * declared field on the `.kibana-threat-reports` data stream so direct
 * `op_type: create` writes from the workflow succeed against
 * `dynamic: 'strict'`.
 *
 * Adapter-only fields (anything not yet populated until the
 * `nl_extraction_behavioral` workflow runs) are intentionally omitted:
 * `extracted.*`, `geography.*`, `feedback.*`, `rank_score`,
 * `corroborated_rank_score`. Setting them at ingestion time would either
 * pollute the index with `extraction_method: 'pending'` rows that
 * already look "extracted", or fail the strict mapping.
 */
export const normalizedReportSchema = z.object({
  '@timestamp': z.string().describe('ISO-8601 ingestion wall-clock'),
  content_fingerprint: z
    .string()
    .describe(
      'SHA-256 hex digest used as the dedup key by the workflow. Each adapter is responsible for picking a stable seed (typically `<source.url>:<item.id>:<item.modified>`) so re-fetches collapse to one row.'
    ),
  space_id: z.string().describe('Either the source.space_id or the global "*" sentinel'),
  source: z.object({
    type: z.enum(SOURCE_TYPES),
    name: z.string(),
    url: z.string(),
    adapter_id: z.string().describe('`<adapter_type>:<source._id>`'),
  }),
  content: z.object({
    title: z.string(),
    body_text: z.string(),
    body_html: z.string().optional(),
    language: z.string().default('en'),
  }),
  severity: z.object({
    level: z.enum(SEVERITY_LEVELS),
    score: z.number(),
  }),
  provenance: z.object({
    ingested_at: z.string(),
    /**
     * Always `'pending'` at ingestion time. The
     * `nl_extraction_behavioral` workflow finds rows by this exact
     * filter, runs IOC + behavioral extraction against them, and then
     * stamps the row's `provenance.extraction_method` to the actual
     * extractor name (e.g. `'regex+llm'`). Any other value here would
     * silently exclude the report from extraction.
     */
    extraction_method: z.literal('pending'),
    /**
     * Optional pointer back to the upstream item. `index` is a free-form
     * descriptor of the upstream container ("rss:feed", "stix:bundle",
     * "taxii:collection:<id>"); `id` is the upstream item / SDO id. Used
     * by the dashboard's "View source" affordance and by future re-fetch
     * jobs that want to skip items they already wrote.
     */
    source_doc_ref: z
      .object({
        index: z.string(),
        id: z.string(),
      })
      .optional(),
  }),
});

export type NormalizedReport = z.infer<typeof normalizedReportSchema>;

export const fetchSourceOutputSchema = z.object({
  /** Echoes `source._source.adapter_type` so downstream steps don't have to re-parse it. */
  adapter_type: z.enum(SOURCE_TYPES),
  /** Echoes `source._id` for log/metric correlation. */
  source_id: z.string(),
  /**
   * Number of normalized reports the adapter produced. Equal to
   * `reports.length`; surfaced as its own field so YAML conditions can
   * branch on "did the adapter return anything?" without touching the
   * full array. A zero here means the adapter ran successfully but the
   * upstream feed had nothing new — distinct from `error: true` (which
   * surfaces as a step failure handled by `on-failure: continue: true`).
   */
  total_fetched: z.number(),
  /**
   * The normalized documents to write. Each element is a complete
   * `.kibana-threat-reports` document, including a per-item
   * `content_fingerprint` precomputed by the adapter. The workflow's
   * inner `foreach` runs the dedup-search-and-write pattern against
   * each one independently.
   */
  reports: z.array(normalizedReportSchema),
});

export type FetchSourceInput = z.infer<typeof fetchSourceInputSchema>;
export type FetchSourceOutput = z.infer<typeof fetchSourceOutputSchema>;

export const fetchSourceStepCommonDefinition: BaseStepDefinition<
  typeof fetchSourceInputSchema,
  typeof fetchSourceOutputSchema
> = {
  id: FETCH_SOURCE_STEP_TYPE,
  label: i18n.translate('xpack.securitySolution.workflows.steps.threatIntelFetchSource.label', {
    defaultMessage: 'Threat Intelligence — Fetch Source',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.threatIntelFetchSource.description',
    {
      defaultMessage:
        'Fetch a single threat-intelligence source by adapter type (rss/stix/taxii/vendor_api) and return one normalized report per upstream item, ready to dedup-and-write into the .kibana-threat-reports data stream.',
    }
  ),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: fetchSourceInputSchema,
  outputSchema: fetchSourceOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.threatIntelFetchSource.documentation.details',
      {
        defaultMessage:
          "Resolves the right server-side adapter from `source._source.adapter_type` and runs it against the source. Each adapter is responsible for: HTTP fetching (with redirects, gzip, abort, response-size caps), format-specific parsing (XML for RSS/Atom, JSON bundles for STIX, paged collection envelopes for TAXII, vendor-shaped JSON for vendor_api), per-item normalization to the threat-reports document shape, and stable per-item fingerprinting so the workflow's downstream dedup search collapses re-fetches.",
      }
    ),
    examples: [
      `## Fetch one source and emit per-item reports
\`\`\`yaml
- name: dispatch_each_source
  type: foreach
  foreach: "{{ steps.load_sources.output.hits.hits }}"
  steps:
    - name: fetch
      type: threat_intel.fetch_source
      with:
        source: "{{ foreach.item }}"
      on-failure:
        continue: true

    - name: emit_reports
      type: foreach
      foreach: "{{ steps.fetch.output.reports }}"
      steps:
        - name: check_dedup
          type: elasticsearch.search
          with:
            index: .kibana-threat-reports
            size: 0
            track_total_hits: true
            query:
              bool:
                filter:
                  - term:
                      content_fingerprint: "{{ foreach.item.content_fingerprint }}"
                  - range:
                      "@timestamp":
                        gte: "now-90d"

        - name: skip_if_seen
          type: loop.continue
          if: "steps.check_dedup.output.hits.total.value > 0"

        - name: write_report
          type: elasticsearch.index
          with:
            index: .kibana-threat-reports
            op_type: create
            document: "{{ foreach.item }}"
          on-failure:
            continue: true
\`\`\``,
    ],
  },
};
