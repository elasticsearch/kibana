/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  THREAT_REPORTS_DATA_STREAM,
  THREAT_REPORTS_INDEX_PATTERN,
  THREAT_INTEL_SOURCES_INDEX,
  THREAT_INTEL_SUBSCRIPTIONS_INDEX,
  THREAT_INTEL_DIGESTS_INDEX,
  THREAT_INTEL_INDICATORS_INDEX,
  THREAT_INTEL_ADVISORIES_INDEX,
  DIAMOND_INFERENCE_ENDPOINT_ID,
} from '../../../common/threat_intelligence/hub';

/**
 * Bumps when an index template's mapping changes in a backwards-compatible
 * way. Adding fields is fine; removing or retyping is not without a
 * reindex strategy.
 *
 * v2: adds `extracted.ioc_set_hash` (keyword) and
 * `provenance.related_reports*` (keyword + integer) to support the
 * Workflow 2 cross-report correlation pass, and adds `template_id` to
 * the subscriptions companion index for pre-staged template provenance.
 *
 * v3: adds `provenance.environment_hits` (object — per-layer counts +
 * computed_at timestamp) and `provenance.environment_hits_total` (integer)
 * for the Workflow 4 hit-provenance-backfill loop, and introduces the
 * indicators companion index template for the IOC indicator sync Task
 * Manager job.
 *
 * v4: adds `delivery.connector_id` to the subscriptions companion index so
 * the `digest_delivery` workflow can dispatch through a configured Kibana
 * actions connector (email / slack) instead of the previous `data.set`
 * placeholder.
 *
 * v5: adds the `extracted.categories` keyword array and the
 * `geography.regions` macro-region keyword array to the threat-reports
 * data stream. Both fields are populated by the stage-2 LLM enrichment
 * step in `nl_extraction_behavioral` and consumed by the visual
 * dashboard's category-breakdown / "Affects You" panels and by
 * `search_reports`'s new `categories[]` / `regions[]` filters. Both
 * arrays are closed enums (see `THREAT_CATEGORIES` / `THREAT_REGIONS` in
 * `common/constants.ts`).
 *
 * v6: adds `space_id` (keyword) to the threat-reports data stream and to
 * each companion index. Single global index, logical per-space isolation:
 * routes filter by `request.getSpaceId()` and writes tag the current
 * space. The sentinel `'*'` means "all spaces" and is reserved for
 * built-ins (seeded sources, global subscriptions) so default content
 * stays visible regardless of which space the request originated from.
 *
 * v7: relocates every plugin-owned index under the `.kibana-threat-*`
 * prefix (data stream + four companion indices + their templates). The
 * mappings are unchanged from v6. The rename is required because the
 * `kibana_system` reserved role only grants access to Kibana-owned
 * patterns (`.kibana*`, `.fleet*`, etc.) — the previous `threat-reports`
 * data stream and `.threat-intel-*` companion indices fell outside that
 * envelope and so creation and read calls from the internal user failed
 * with `security_exception`. There is no in-place migration: previously
 * created `threat-reports` / `.threat-intel-*` resources (none of which
 * could have been written to in any environment that didn't elevate
 * `kibana_system`) are abandoned. See
 * `dev_docs/key_concepts/kibana_system_user.mdx`.
 *
 * v8: adds the tradecraft-style ranking signals to the threat-reports
 * data stream:
 *   - `extracted.relevance` (float 0..1) — LLM-emitted "how actionable
 *     is this report for detection?" score, populated by the stage-2
 *     enrichment in `nl_extraction_behavioral`.
 *   - `extracted.detection_actionability` (keyword) — closed-set
 *     classifier (`informational` / `iocs_only` / `ttps_present` /
 *     `rule_candidate`). See `DETECTION_ACTIONABILITY_LEVELS` in
 *     `common/threat_intelligence/hub/constants.ts`.
 *   - `rank_score` (float) — multiplicative composite of
 *     `severity.score * extracted.relevance` computed at extraction
 *     time. Consumed by `search_reports` when `sort_by: 'rank'` and
 *     by the dashboard's "Top reports" panel. Reports missing this
 *     field (e.g. legacy or pending docs) tie-break to 0 via the
 *     `missing` sort parameter on the read side.
 *
 * v9: closes the hunt → ranking feedback loop. Adds:
 *   - `feedback` (object) — per-report aggregate of the latest
 *     orchestrated-hunt outcome:
 *       * `ioc_hit_count` / `ttp_hit_count` (long) — Tier 1 hit counts.
 *       * `affected_host_count` / `affected_user_count` (long) —
 *         Tier 1 affected-asset cardinality.
 *       * `last_hunted_at` (date) — wall-clock of the latest hunt.
 *       * `last_hunt_status` (keyword) — `HuntForThreatStatus` echo so
 *         downstream consumers can distinguish "no hits in this window"
 *         from "no searchable input" without rerunning the hunt.
 *     Written by `services/write_hunt_feedback.ts` from the orchestrator
 *     after every Tier 1 invocation against a known `report_id`.
 *   - `corroborated_rank_score` (float) — `rank_score * (1 + boost)`
 *     where `boost` is a log-based, monotone, clamped function of the
 *     IOC and TTP hit counts. See the formula in
 *     `services/write_hunt_feedback.ts`. `search_reports` sort_by='rank'
 *     prefers this field over the static `rank_score` so reports
 *     corroborated by environment activity float to the top of digests,
 *     dashboard "Top reports" panel, and any future top-N gating. Bound
 *     to `[rank_score, 1.5 * rank_score]` so a noisy report can never
 *     dominate a clean high-relevance one outright; the boost is
 *     idempotent across reruns of the same hunt window.
 *
 * v10: introduces the advisories companion index template
 * (`.kibana-threat-intel-advisories`) for cross-report LLM-synthesised
 * advisories produced by `services/synthesize_advisory.ts`. One row
 * per advisory carrying the rendered narrative, the recommended actions
 * list, and the report ids that fed the synthesis. No changes to the
 * threat-reports data stream mapping in this bump — companion index
 * additions are always backwards-compatible.
 *
 * v12: adds `copy_to` on `content.title` and `content.body_text` so the
 * `content.title_bm25` / `content.body_text_bm25` siblings are populated at
 * index time (the mapping declared these fields in v1 but omitted copy_to,
 * which made `search_reports` field-sorted modes return zero hits).
 *
 * v13: fixes `copy_to` targets to use full paths (`content.title_bm25`,
 * `content.body_text_bm25`). Relative targets (`title_bm25`) copy to the
 * document root under `dynamic: strict`, which rejected every
 * `source_ingestion` write with `strict_dynamic_mapping_exception`.
 *
 * v11: adds `advisory_id` (keyword) to the digests companion index
 * (`.kibana-threat-intel-digests`). Populated by `digest_delivery` when
 * the agent calls `threat_intel.synthesize_advisory` (with
 * `persist: true`) at the top of the per-subscription render step and
 * weaves the resulting executive summary into the digest markdown.
 * Lets the dashboard cross-link each archived digest back to the
 * advisory row it cites — and lets the per-subscription history pane
 * render "this digest is built around the <theme_title> advisory"
 * without re-running the synthesis. Companion-index addition; the
 * mapping is `dynamic: 'strict'` so the field MUST be declared up-front
 * before any write attempts it.
 *
 * v15: adds IOC tier fields to the `extracted.iocs` nested block:
 *   - `tier`          (keyword) — active tier assignment (heuristic for now; LLM override in B2).
 *   - `tier_heuristic`(keyword) — the deterministic heuristic's assignment (preserved for tuning).
 *   - `tier_basis`    (keyword) — the rule name that fired (e.g. defanged_source, hash_high_entropy).
 * These fields are DISTINCT from `source.tier` (integer feed-quality snapshot at line ~214).
 * All three are `dynamic: 'strict'`-safe keyword additions; additive, no data loss.
 * A `migrateExistingIocTierMappings` call patches pre-v15 backing indices at startup.
 *
 * v14: adds Diamond Model extraction fields and source-snapshot fields to the
 * threat-reports data stream. Diamond fields under `extracted.diamond.*`:
 *   - Four vertices (adversary / capability / infrastructure / victim), each with:
 *     * `signal`  (keyword)       — HIGH | PARTIAL | NONE
 *     * `summary` (semantic_text, inference_id: DIAMOND_INFERENCE_ENDPOINT_ID) —
 *       1-3 sentence factual summary; empty when signal is NONE.
 *   - `signal_count`    (integer) — non-NONE vertex count (0..4).
 *   - `model_id`        (keyword) — connector/model that produced the extraction.
 *   - `extracted_at`    (date)    — wall-clock of the extraction run.
 *   - `extraction_mode` (keyword) — 'single_call' | 'per_vertex_fallback'.
 * Source-snapshot fields on `source.*`:
 *   - `admiralty_rating` (keyword) — NATO-style source reliability rating (A–F).
 *   - `tier`             (integer) — feed tier snapshot at ingest.
 * ES validates the `summary` inference_id at document-index time (not at
 * template PUT or rollover). `bootstrap_threat_intelligence` logs an error at
 * startup if the endpoint is absent so operators catch the gap before data flows.
 */
const TEMPLATE_VERSION = 15;

/** Keyword sentinel meaning "visible from every space". */
export const SPACE_ID_GLOBAL = '*' as const;

const TEMPLATE_META = { managed_by: 'threat_intelligence', version: TEMPLATE_VERSION };

/**
 * Source-agnostic threat reports data stream.
 *
 * Mappings notes:
 * - `content.title` and `content.body_text` are `semantic_text`. We deliberately
 *   omit `inference_id` so Elasticsearch inherits the cluster default at index
 *   creation time (typically Jina v5 on EIS, then ELSER-on-EIS, then ELSER, then
 *   multilingual-e5). This matches Streams' pattern in `storage_settings.ts` and
 *   makes the plugin work transparently across deployments.
 * - `content.title_bm25` and `content.body_text_bm25` are sibling `text` fields
 *   populated via `copy_to` from the `semantic_text` siblings. The
 *   `threat_intel.search_reports` tool uses an RRF retriever over both paths so
 *   semantic search degrades gracefully when inference is unavailable.
 * - `content_fingerprint` is the SHA-256 of the normalized `body_text`. It is
 *   the dedup key against RSS-syndicated copies and is a forward-compat slot
 *   for Phase C alert/telemetry traceback (`provenance.duplicate_of`).
 * - `source.type: 'telemetry'` is reserved for Phase C
 *   (`threat_intel.generalize_from_telemetry`); leaving the enum value in the
 *   keyword field requires no migration when the tool lands.
 */
const threatReportsTemplate = {
  index_patterns: [THREAT_REPORTS_INDEX_PATTERN],
  data_stream: {},
  priority: 200,
  _meta: TEMPLATE_META,
  template: {
    settings: {
      'index.lifecycle.name': undefined,
      'index.mapping.total_fields.limit': 5000,
      'index.default_pipeline': undefined,
    },
    mappings: {
      dynamic: 'strict' as const,
      properties: {
        '@timestamp': { type: 'date' as const },
        content_fingerprint: { type: 'keyword' as const },
        // Logical per-space isolation tag. `'*'` = visible from every
        // space. Routes filter by current space + `'*'`.
        space_id: { type: 'keyword' as const },
        source: {
          properties: {
            type: { type: 'keyword' as const },
            name: { type: 'keyword' as const },
            url: { type: 'keyword' as const },
            adapter_id: { type: 'keyword' as const },
            // Snapshot fields written at ingest time (not extracted by the LLM).
            // `admiralty_rating` mirrors the NATO/military source reliability scale
            // (A = completely reliable … F = reliability cannot be judged).
            // `tier` is the feed tier snapshot so consumers can filter by source
            // quality without joining back to `.kibana-threat-intel-sources`.
            admiralty_rating: { type: 'keyword' as const },
            tier: { type: 'integer' as const },
          },
        },
        content: {
          properties: {
            title: {
              type: 'semantic_text' as const,
              // intentionally no inference_id — inherit cluster default
              copy_to: ['content.title_bm25'],
            },
            title_bm25: { type: 'text' as const },
            body_text: {
              type: 'semantic_text' as const,
              copy_to: ['content.body_text_bm25'],
            },
            body_text_bm25: { type: 'text' as const },
            body_html: { type: 'text' as const, index: false },
            language: { type: 'keyword' as const },
          },
        },
        severity: {
          properties: {
            level: { type: 'keyword' as const },
            score: { type: 'float' as const },
          },
        },
        // Multiplicative composite of `severity.score * extracted.relevance`
        // computed at extraction time. Populated by the
        // `nl_extraction_behavioral` workflow's `capture_ranking_signals`
        // step so downstream consumers (`search_reports` sort_by='rank',
        // dashboard "Top reports" panel, digest top-N gating) can rank
        // reports by detection actionability rather than recency or
        // severity alone. See the v8 doc comment above and tradecraft's
        // severity × relevance scoring model.
        rank_score: { type: 'float' as const },
        // Hunt-feedback-corroborated derivative of `rank_score`. Equal to
        // `rank_score * (1 + boost)` where `boost ∈ [0, 0.5]` is a
        // log-based function of `feedback.ioc_hit_count` and
        // `feedback.ttp_hit_count`. Written by
        // `services/write_hunt_feedback.ts` after every orchestrated
        // hunt; `search_reports` sort_by='rank' uses this as the
        // primary sort key with `rank_score` and `severity.score` as
        // tie-breakers (so legacy or never-hunted reports still rank
        // sensibly). See the v9 doc comment above.
        corroborated_rank_score: { type: 'float' as const },
        extracted: {
          properties: {
            iocs: {
              type: 'nested' as const,
              properties: {
                type: { type: 'keyword' as const },
                value: { type: 'keyword' as const },
                defanged: { type: 'keyword' as const },
                severity: { type: 'keyword' as const },
                // IOC tier fields (v15). Distinct from source.tier (integer).
                // tier = active assignment; tier_heuristic = deterministic rule output;
                // tier_basis = rule name for tuning/observability.
                tier: { type: 'keyword' as const },
                tier_heuristic: { type: 'keyword' as const },
                tier_basis: { type: 'keyword' as const },
              },
            },
            ioc_set_hash: { type: 'keyword' as const },
            // LLM-emitted "how actionable is this report for writing a
            // detection rule?" score in `[0, 1]`. Populated by the
            // stage-2 enrichment in `nl_extraction_behavioral`.
            // Multiplied with `severity.score` to derive `rank_score`.
            // A neutral 0.5 baseline is written if the enrichment step
            // fails (best-effort) so reports still get a usable rank.
            relevance: { type: 'float' as const },
            // Closed-set classifier — see `DETECTION_ACTIONABILITY_LEVELS`
            // in `common/threat_intelligence/hub/constants.ts`. Allows
            // operators to filter the digest / dashboard to only
            // `rule_candidate` reports without thresholding the float
            // `relevance` field.
            detection_actionability: { type: 'keyword' as const },
            ttps: {
              properties: {
                tactics: { type: 'keyword' as const },
                techniques: { type: 'keyword' as const },
              },
            },
            behaviors: {
              type: 'nested' as const,
              properties: {
                id: { type: 'keyword' as const },
                technique_id: { type: 'keyword' as const },
                description: { type: 'text' as const },
                telemetry_targets: { type: 'keyword' as const },
                llm_confidence: { type: 'float' as const },
                confidence: { type: 'float' as const },
              },
            },
            threat_actors: { type: 'keyword' as const },
            target_sectors: { type: 'keyword' as const },
            // Closed-set 15-category taxonomy. Populated by the stage-2
            // enrichment in `nl_extraction_behavioral`. See
            // `THREAT_CATEGORIES` in `common/constants.ts` for the allowed
            // values.
            categories: { type: 'keyword' as const },
            // Diamond Model extraction fields — populated by `extract_diamond`
            // for threat-positive reports (gated on `enrich_taxonomy`'s
            // `detection_actionability` signal). See Phase 1 design.
            diamond: {
              properties: {
                adversary: {
                  properties: {
                    // HIGH = specific named actor; PARTIAL = vague/unattributed; NONE = absent.
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                    },
                  },
                },
                capability: {
                  properties: {
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                    },
                  },
                },
                infrastructure: {
                  properties: {
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                    },
                  },
                },
                victim: {
                  properties: {
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                    },
                  },
                },
                // Count of vertices with signal != NONE (0..4). Cheap filter
                // for "how much diamond structure did we extract from this report?"
                signal_count: { type: 'integer' as const },
                // Connector/model that produced the extraction — for provenance.
                model_id: { type: 'keyword' as const },
                extracted_at: { type: 'date' as const },
                // 'single_call' (normal path) | 'per_vertex_fallback' (context-overflow fallback).
                extraction_mode: { type: 'keyword' as const },
                // Gate result written for EVERY report (true+false) by persist_extractions and
                // backfill_diamond_fields. Queryable for observability + future dry_run estimation
                // using real measured fraction rather than the documented constant estimate.
                suitable: { type: 'boolean' as const },
              },
            },
          },
        },
        // Closed-set geographic macro-region taxonomy. Populated by the
        // same stage-2 enrichment as `extracted.categories`. See
        // `THREAT_REGIONS` in `common/constants.ts` for the allowed values.
        geography: {
          properties: {
            regions: { type: 'keyword' as const },
          },
        },
        provenance: {
          properties: {
            ingested_at: { type: 'date' as const },
            extracted_at: { type: 'date' as const },
            extraction_method: { type: 'keyword' as const },
            source_doc_ref: {
              properties: {
                index: { type: 'keyword' as const },
                id: { type: 'keyword' as const },
              },
            },
            duplicate_of: { type: 'keyword' as const },
            related_reports: { type: 'keyword' as const },
            related_reports_count: { type: 'integer' as const },
            environment_hits: {
              properties: {
                window: { type: 'keyword' as const },
                computed_at: { type: 'date' as const },
                layer_1_ioc_match: { type: 'integer' as const },
                layer_2_behavioral: { type: 'integer' as const },
              },
            },
            environment_hits_total: { type: 'integer' as const },
          },
        },
        // Hunt-feedback aggregate, refreshed by `write_hunt_feedback`
        // after every orchestrated hunt against a known `report_id`.
        // Distinct from `provenance.environment_hits` (which is the
        // hourly cross-rule backfill from `hit_provenance_backfill`):
        // `feedback` reflects the latest *targeted* hunt's outcome and
        // feeds `corroborated_rank_score`; the provenance block reflects
        // ambient Detection Engine alert volume. The two coexist
        // deliberately so the digest can show both "what this report's
        // IOCs hit in the targeted hunt" and "what alerts have fired
        // referencing this report in the last 7d".
        feedback: {
          properties: {
            ioc_hit_count: { type: 'long' as const },
            ttp_hit_count: { type: 'long' as const },
            affected_host_count: { type: 'long' as const },
            affected_user_count: { type: 'long' as const },
            last_hunted_at: { type: 'date' as const },
            // `HuntForThreatStatus` echo — see
            // `services/hunt_for_threat.ts`. Closed enum but typed as
            // keyword so a future enum extension does not require a
            // mapping migration.
            last_hunt_status: { type: 'keyword' as const },
            // Wall-clock window of the hunt that produced these counts,
            // ISO-8601 stringified. Lets readers tell "no hits because
            // not hunted recently" from "no hits in the searched window".
            last_hunt_window: {
              properties: {
                from: { type: 'date' as const },
                to: { type: 'date' as const },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Companion regular indices. Smaller, low-volume; no rollover needed.
 * One template per index with `index_patterns: [exactName]`.
 */
const COMPANION_INDEX_TEMPLATES: Array<{
  name: string;
  body: Parameters<ElasticsearchClient['indices']['putIndexTemplate']>[0];
}> = [
  {
    name: `${THREAT_INTEL_SOURCES_INDEX}-template`,
    body: {
      name: `${THREAT_INTEL_SOURCES_INDEX}-template`,
      index_patterns: [THREAT_INTEL_SOURCES_INDEX],
      priority: 200,
      _meta: TEMPLATE_META,
      template: {
        mappings: {
          dynamic: 'strict',
          properties: {
            adapter_type: { type: 'keyword' },
            name: { type: 'keyword' },
            enabled: { type: 'boolean' },
            config: { type: 'object', enabled: false },
            tags: { type: 'keyword' },
            space_id: { type: 'keyword' },
            created_at: { type: 'date' },
            updated_at: { type: 'date' },
          },
        },
      },
    },
  },
  {
    name: `${THREAT_INTEL_SUBSCRIPTIONS_INDEX}-template`,
    body: {
      name: `${THREAT_INTEL_SUBSCRIPTIONS_INDEX}-template`,
      index_patterns: [THREAT_INTEL_SUBSCRIPTIONS_INDEX],
      priority: 200,
      _meta: TEMPLATE_META,
      template: {
        mappings: {
          dynamic: 'strict',
          properties: {
            owner: { type: 'keyword' },
            tags: { type: 'keyword' },
            severity_threshold: { type: 'keyword' },
            schedule_rrule: { type: 'keyword' },
            delivery: {
              properties: {
                type: { type: 'keyword' },
                target: { type: 'keyword' },
                // Configured Kibana actions connector instance id. Required
                // for the `digest_delivery` workflow to dispatch through the
                // actions plugin (the connector type is implied by
                // `delivery.type`: `.email` for `email`, `.slack` for `slack`).
                connector_id: { type: 'keyword' },
              },
            },
            workflow_id: { type: 'keyword' },
            human_summary: { type: 'text' },
            template_id: { type: 'keyword' },
            space_id: { type: 'keyword' },
            created_at: { type: 'date' },
            updated_at: { type: 'date' },
          },
        },
      },
    },
  },
  {
    name: `${THREAT_INTEL_INDICATORS_INDEX}-template`,
    body: {
      name: `${THREAT_INTEL_INDICATORS_INDEX}-template`,
      index_patterns: [THREAT_INTEL_INDICATORS_INDEX],
      priority: 200,
      _meta: TEMPLATE_META,
      template: {
        mappings: {
          // ECS-aligned `threat.indicator.*` shape so Detection Engine's
          // Indicator Match rule type can query this index with its default
          // field mapping. The `indicator.reference` field carries
          // `threat-report:<report_id>` for the Workflow 4 hit backfill.
          dynamic: 'strict',
          properties: {
            '@timestamp': { type: 'date' },
            threat: {
              properties: {
                indicator: {
                  properties: {
                    type: { type: 'keyword' },
                    provider: { type: 'keyword' },
                    reference: { type: 'keyword' },
                    description: { type: 'text', index: false },
                    confidence: { type: 'keyword' },
                    first_seen: { type: 'date' },
                    last_seen: { type: 'date' },
                    ip: { type: 'ip' },
                    url: {
                      properties: {
                        full: { type: 'keyword' },
                        domain: { type: 'keyword' },
                      },
                    },
                    file: {
                      properties: {
                        hash: {
                          properties: {
                            md5: { type: 'keyword' },
                            sha1: { type: 'keyword' },
                            sha256: { type: 'keyword' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            // Sync bookkeeping — used by the Task Manager runner to
            // decide whether to refresh an existing row or write a new one.
            source_report_id: { type: 'keyword' },
            source_report_url: { type: 'keyword' },
            severity: { type: 'keyword' },
          },
        },
      },
    },
  },
  {
    name: `${THREAT_INTEL_DIGESTS_INDEX}-template`,
    body: {
      name: `${THREAT_INTEL_DIGESTS_INDEX}-template`,
      index_patterns: [THREAT_INTEL_DIGESTS_INDEX],
      priority: 200,
      _meta: TEMPLATE_META,
      template: {
        mappings: {
          dynamic: 'strict',
          properties: {
            '@timestamp': { type: 'date' },
            subscription_id: { type: 'keyword' },
            time_range: {
              properties: {
                from: { type: 'date' },
                to: { type: 'date' },
              },
            },
            content_markdown: { type: 'text' },
            report_ids: { type: 'keyword' },
            // `_id` of the row in `.kibana-threat-intel-advisories` the
            // agent cited as the executive summary for this digest.
            // Optional — absent when `synthesize_advisory` returned
            // `no_reports` / `no_inference` (graceful-degradation paths
            // documented in `services/synthesize_advisory.ts`). See
            // `workflows/digest_delivery.yaml`'s `archive_digest` step
            // for how it's populated.
            advisory_id: { type: 'keyword' },
            delivered: { type: 'boolean' },
            delivery_error: { type: 'text', index: false },
            space_id: { type: 'keyword' },
          },
        },
      },
    },
  },
  {
    // Advisories companion — LLM-synthesised cross-report narratives. See
    // `services/synthesize_advisory.ts`. One row per advisory; rows are
    // append-only (no in-place edits) so re-runs over the same window
    // produce a new row, letting the UI render an audit trail of
    // synthesis attempts. Indexed by `theme_id` (a stable digest of the
    // input report-id set) so the de-dup logic can filter at query time.
    name: `${THREAT_INTEL_ADVISORIES_INDEX}-template`,
    body: {
      name: `${THREAT_INTEL_ADVISORIES_INDEX}-template`,
      index_patterns: [THREAT_INTEL_ADVISORIES_INDEX],
      priority: 200,
      _meta: TEMPLATE_META,
      template: {
        mappings: {
          dynamic: 'strict',
          properties: {
            '@timestamp': { type: 'date' },
            // Stable digest of the input set — used to detect duplicate
            // synthesis runs over the same window + report selection.
            theme_id: { type: 'keyword' },
            time_range: {
              properties: {
                from: { type: 'date' },
                to: { type: 'date' },
              },
            },
            // Filter inputs that produced the advisory, persisted so the
            // dashboard can render "synthesised from X reports in CATEGORY
            // over the past 7 days" without recomputing.
            filters: {
              properties: {
                tags: { type: 'keyword' },
                categories: { type: 'keyword' },
                regions: { type: 'keyword' },
                min_severity: { type: 'keyword' },
              },
            },
            // LLM-produced narrative. `theme_title` is the short headline,
            // `narrative_markdown` is the 2-3 paragraph body. Both are
            // text-only (no inference / semantic_text) — advisories are
            // read by humans, not searched.
            theme_title: { type: 'text' },
            narrative_markdown: { type: 'text' },
            // Recommended actions — short imperative bullets, parsed by
            // the UI into a checkbox list and a "Open a Case" button.
            recommended_actions: { type: 'keyword' },
            // Provenance — the report ids the advisory was synthesised
            // from. Lets the UI render "View source reports" drill-downs
            // and powers the "advisory coverage" panel on the dashboard.
            report_ids: { type: 'keyword' },
            // Threat actor / category aggregations the LLM was given as
            // a prompt anchor. Persisted so a later re-render of the
            // advisory does not have to re-compute them.
            grouping: {
              properties: {
                threat_actors: { type: 'keyword' },
                categories: { type: 'keyword' },
                regions: { type: 'keyword' },
              },
            },
            generated_by: { type: 'keyword' },
            space_id: { type: 'keyword' },
          },
        },
      },
    },
  },
];

/**
 * Patches the `extracted.diamond.*` field mappings onto any existing
 * `.ds-.kibana-threat-reports-*` backing indices that were created before the
 * v14 template deployed. The v14 template adds these fields automatically to
 * new rollovers, but pre-existing backing indices keep their original (v13)
 * mapping until explicitly updated.
 *
 * Safe to re-run on every plugin start: if `extracted.diamond.suitable`
 * already exists the backing index is skipped; ES PUT-mapping for additive
 * fields is otherwise a no-op for fields that already match.
 *
 * Without this migration the `backfill_diamond_fields` task would silently
 * fail all ES updates with `strict_dynamic_mapping_exception` because
 * `dynamic: 'strict'` rejects unknown fields.
 */
const migrateExistingDiamondMappings = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> => {
  const log = logger.get('diamond-mapping-migration');

  let backingIndices: string[];
  try {
    const streamInfo = await esClient.indices.getDataStream(
      { name: THREAT_REPORTS_DATA_STREAM },
      { ignore: [404] }
    );
    backingIndices = (streamInfo.data_streams ?? []).flatMap((ds) =>
      (ds.indices ?? []).map((i) => i.index_name)
    );
  } catch (err) {
    log.debug(
      `diamond-mapping-migration: data stream not found — skipping (${(err as Error).message})`
    );
    return;
  }

  for (const indexName of backingIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const extractedProps = (
        indexMappings?.mappings?.properties as
          | Record<string, { properties?: Record<string, unknown> }>
          | undefined
      )?.extracted?.properties;

      if (!extractedProps?.diamond) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            extracted: {
              properties: {
                diamond: {
                  properties: {
                    suitable: { type: 'boolean' },
                    signal_count: { type: 'integer' },
                    model_id: { type: 'keyword' },
                    extracted_at: { type: 'date' },
                    extraction_mode: { type: 'keyword' },
                    adversary: {
                      properties: {
                        signal: { type: 'keyword' },
                        summary: {
                          type: 'semantic_text',
                          inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                        },
                      },
                    },
                    capability: {
                      properties: {
                        signal: { type: 'keyword' },
                        summary: {
                          type: 'semantic_text',
                          inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                        },
                      },
                    },
                    infrastructure: {
                      properties: {
                        signal: { type: 'keyword' },
                        summary: {
                          type: 'semantic_text',
                          inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                        },
                      },
                    },
                    victim: {
                      properties: {
                        signal: { type: 'keyword' },
                        summary: {
                          type: 'semantic_text',
                          inference_id: DIAMOND_INFERENCE_ENDPOINT_ID,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        log.info(`Migrated diamond mappings on ${indexName} (v14 backfill)`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate diamond mappings on ${indexName}: ${(err as Error).message}. ` +
          `The backfill_diamond_fields task will be unable to write diamond fields to ` +
          `documents in this index until the mapping is updated manually: ` +
          `PUT ${indexName}/_mapping { "properties": { "extracted": { "properties": { "diamond": { ... } } } } }`
      );
    }
  }
};

/**
 * Patches the `extracted.iocs[].tier*` keyword fields onto any existing
 * `.ds-.kibana-threat-reports-*` backing indices created before the v15 template.
 * The v15 template adds these fields automatically to new rollovers; pre-existing
 * backing indices keep their original (v14) mapping until explicitly updated.
 *
 * Safe to re-run on every plugin start: PUT mapping is idempotent for additive
 * keyword fields. Without this, writes to pre-v15 indices fail with
 * `strict_dynamic_mapping_exception` because the iocs nested object is
 * `dynamic: strict` via the parent mapping.
 */
const migrateExistingIocTierMappings = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> => {
  const log = logger.get('ioc-tier-mapping-migration');

  let backingIndices: string[];
  try {
    const streamInfo = await esClient.indices.getDataStream(
      { name: THREAT_REPORTS_DATA_STREAM },
      { ignore: [404] }
    );
    backingIndices = (streamInfo.data_streams ?? []).flatMap((ds) =>
      (ds.indices ?? []).map((i) => i.index_name)
    );
  } catch (err) {
    log.debug(
      `ioc-tier-mapping-migration: data stream not found — skipping (${(err as Error).message})`
    );
    return;
  }

  for (const indexName of backingIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const iocProps = (
        (
          indexMappings?.mappings?.properties as
            | Record<string, { properties?: Record<string, { properties?: Record<string, unknown> }> }>
            | undefined
        )?.extracted?.properties?.iocs as
          | { properties?: Record<string, unknown> }
          | undefined
      )?.properties;

      if (!iocProps?.tier) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            extracted: {
              properties: {
                iocs: {
                  type: 'nested',
                  properties: {
                    tier: { type: 'keyword' },
                    tier_heuristic: { type: 'keyword' },
                    tier_basis: { type: 'keyword' },
                  },
                },
              },
            },
          },
        });
        log.info(`Migrated ioc tier mappings on ${indexName} (v15 backfill)`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate ioc tier mappings on ${indexName}: ${(err as Error).message}. ` +
          `The extracted.iocs tier fields will be rejected by dynamic: strict until the ` +
          `mapping is updated manually.`
      );
    }
  }
};

const ensureCompanionIndex = async (
  esClient: ElasticsearchClient,
  indexName: string,
  logger: Logger
): Promise<void> => {
  const exists = await esClient.indices.exists({ index: indexName });
  if (exists) return;
  try {
    await esClient.indices.create({ index: indexName });
    logger.debug(`Created companion index ${indexName}`);
  } catch (err) {
    // Concurrent creation race — ignore the conflict.
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 400) return;
    throw err;
  }
};

const ensureDataStream = async (
  esClient: ElasticsearchClient,
  dataStreamName: string,
  logger: Logger
): Promise<void> => {
  const existing = await esClient.indices.getDataStream(
    { name: dataStreamName },
    { ignore: [404] }
  );
  if (existing.data_streams && existing.data_streams.length > 0) return;
  try {
    await esClient.indices.createDataStream({ name: dataStreamName });
    logger.debug(`Created data stream ${dataStreamName}`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 400) return;
    throw err;
  }
};

/**
 * Idempotently registers all index templates and creates the data stream and
 * companion indices. Safe to call on every plugin start; only writes when
 * something is missing or out of date.
 */
export const installIndexTemplates = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<void> => {
  const log = logger.get('index-templates');
  log.info('Installing threat intelligence index templates');

  await esClient.indices.putIndexTemplate({
    // Derived from the data-stream constant so the template name stays in
    // lockstep with the data-stream name and never drifts (e.g. on the v7
    // `.kibana-threat-*` rename).
    name: `${THREAT_REPORTS_DATA_STREAM}-template`,
    ...threatReportsTemplate,
  });

  for (const template of COMPANION_INDEX_TEMPLATES) {
    await esClient.indices.putIndexTemplate(template.body);
  }

  await ensureDataStream(esClient, THREAT_REPORTS_DATA_STREAM, log);
  await ensureCompanionIndex(esClient, THREAT_INTEL_SOURCES_INDEX, log);
  await ensureCompanionIndex(esClient, THREAT_INTEL_SUBSCRIPTIONS_INDEX, log);
  await ensureCompanionIndex(esClient, THREAT_INTEL_DIGESTS_INDEX, log);
  await ensureCompanionIndex(esClient, THREAT_INTEL_INDICATORS_INDEX, log);
  await ensureCompanionIndex(esClient, THREAT_INTEL_ADVISORIES_INDEX, log);

  // Patch diamond fields onto any pre-v14 backing indices. Safe to re-run.
  await migrateExistingDiamondMappings(esClient, log);
  // Patch ioc tier fields onto any pre-v15 backing indices. Safe to re-run.
  await migrateExistingIocTierMappings(esClient, log);

  log.info('Threat intelligence index templates installed');
};
