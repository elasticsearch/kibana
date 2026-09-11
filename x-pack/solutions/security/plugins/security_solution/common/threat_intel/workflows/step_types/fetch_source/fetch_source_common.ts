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
import { FETCH_ADAPTER_TYPES, REPORT_SOURCE_TYPES, SEVERITY_LEVELS } from '../../../constants';

/** Workflow step: fetch one source hit and return normalized threat reports. */
export const FETCH_SOURCE_STEP_TYPE = 'threat_intel.fetch_source' as const;

/**
 * Persisted catalog hit shape for the fetch_source step.
 *
 * Feed URLs are not stored on the sources index. Adapters resolve the URL from
 * the stable `_id` via `resolveCatalogSourceUrl` at fetch time.
 */
export const sourceHitSchema = z.object({
  _id: z.string(),
  _index: z.string().optional(),
  _source: z.object({
    adapter_type: z.enum(FETCH_ADAPTER_TYPES),
    name: z.string(),
    enabled: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    space_id: z.string().optional(),
  }),
});

export const fetchSourceInputSchema = z.object({
  source: z.union([z.string(), sourceHitSchema]),
});

/** Must match the `extracted.iocs` nested mapping in setup/index_templates.ts. */
export const iocEntrySchema = z.object({
  type: z.string(),
  value: z.string(),
  defanged: z.string().optional(),
  tier: z.string(),
  tier_heuristic: z.string(),
  tier_basis: z.string(),
  port: z.number().optional(),
  reference: z.string().optional(),
  block_index: z.number().optional(),
});

export type IocEntry = z.infer<typeof iocEntrySchema>;

/** Must match `.kibana-threat-reports` strict mapping in setup/index_templates.ts. */
export const normalizedReportSchema = z.object({
  '@timestamp': z.string(),
  content_fingerprint: z.string(),
  space_id: z.string(),
  revision: z.number().int().positive().default(1),
  source: z.object({
    type: z.enum(REPORT_SOURCE_TYPES),
    name: z.string(),
    url: z.string().optional(),
    adapter_id: z.string(),
  }),
  content: z.object({
    title: z.string(),
    body_text: z.string(),
    language: z.string().default('en'),
  }),
  severity: z.object({
    level: z.enum(SEVERITY_LEVELS),
    score: z.number(),
  }),
  lineage: z.object({
    ingested_at: z.string(),
    extraction_method: z.enum(['pending', 'text_indicator_list', 'kev']),
    extracted_at: z.string().optional(),
    source_doc_ref: z
      .object({
        index: z.string(),
        id: z.string(),
      })
      .optional(),
  }),
  extracted: z
    .object({
      iocs: z.array(iocEntrySchema).optional(),
      categories: z.array(z.string()).optional(),
      vulnerability: z
        .object({
          cve_id: z.string(),
          vendor: z.string(),
          product: z.string(),
          name: z.string(),
          cwes: z.array(z.string()).optional(),
          date_added: z.string(),
          due_date: z.string(),
          ransomware_use: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type NormalizedReport = z.infer<typeof normalizedReportSchema>;

export const fetchSourceOutputSchema = z.object({
  adapter_type: z.enum(FETCH_ADAPTER_TYPES),
  source_id: z.string(),
  total_fetched: z.number(),
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
    defaultMessage: 'Fetch threat intel source',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.threatIntelFetchSource.description',
    {
      defaultMessage:
        'Fetch one enabled source and return normalized reports for the ingest workflow to dedup and write.',
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
        // Braces are wrapped in single quotes so ICU MessageFormat treats them
        // as literal text instead of parsing `{{ foreach.item }}` as an argument.
        defaultMessage:
          "Runs the adapter for `source._source.adapter_type` (RSS, KEV, or text list). Pass `source` as `$'{{ foreach.item }}'` so the hit stays an object. `'{{ foreach.item }}'` stringifies it.",
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
        source: "\${{ foreach.item }}"
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
                  # Reports from every space share this index, so the dedup check
                  # has to be scoped or another space's report suppresses yours.
                  - terms:
                      space_id:
                        - "{{ variables.spaceId }}"
                        - "*"

        - name: skip_if_seen
          type: loop.continue
          if: "steps.check_dedup.output.hits.total.value > 0"

        # Best-effort dedup. The precheck is a search, so it cannot see a report
        # written in the last refresh interval, and op_type create without an
        # explicit _id lets Elasticsearch generate one, which means it does not
        # enforce uniqueness either. Two runs overlapping inside that window can
        # both write. Acceptable for a 4h schedule; supply an _id derived from
        # the fingerprint if you need the guarantee.
        - name: write_report
          type: elasticsearch.index
          with:
            index: .kibana-threat-reports
            op_type: create
            document: "\${{ foreach.item }}"
          on-failure:
            continue: true
\`\`\``,
    ],
  },
};
