/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  THREAT_REPORTS_INDEX,
  THREAT_REPORTS_INDEX_PATTERN,
  THREAT_INTEL_SOURCES_INDEX,
  THREAT_INTEL_INDICATORS_INDEX,
  DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
  MAX_URL_LENGTH,
} from '../../../common/threat_intel';
import { HIDDEN_INDEX_SEARCH_OPTIONS } from '../lib/es_options';

// Identifies our templates in Elasticsearch `_meta`. Not an upgrade counter —
// existing-index upgrades are field-presence migrations + REQUIRED_*_FIELDS.
const TEMPLATE_META = { managed_by: 'threat_intel' };

/**
 * These are plugin-owned indices, not user data: they must not show up in index
 * patterns, `_cat` output, or `*` searches. Anything reading them by wildcard has
 * to opt in with `expand_wildcards: ['open', 'hidden']`.
 */
const HIDDEN_INDEX_SETTINGS = { 'index.hidden': true } as const;

/**
 * Every keyword field that carries feed-controlled text gets this. A keyword term
 * over 32,766 bytes is a hard Elasticsearch error, and on the indicators index an
 * item-level error is permanent, so without a bound one very long URL is a write
 * failure rather than merely a long value. Over the bound the value stays in
 * `_source` and only loses its index entry, which is strictly better than losing
 * the document.
 *
 * 2048 is `MAX_URL_LENGTH`, the bound the source and report APIs already enforce,
 * so anything the pipeline will accept stays searchable.
 */
const FEED_TEXT_IGNORE_ABOVE = MAX_URL_LENGTH;

/**
 * Nested-objects ceiling for the indicators index. The promote task caps
 * `sources[]` well under this (see `MAX_SOURCE_CITATIONS`); the setting is here so
 * the two bounds are visible together and cannot drift into each other.
 */
const MAX_NESTED_OBJECTS = 10000;

const threatReportsTemplate = {
  index_patterns: [THREAT_REPORTS_INDEX_PATTERN],
  priority: 200,
  _meta: TEMPLATE_META,
  template: {
    settings: {
      ...HIDDEN_INDEX_SETTINGS,
      'index.mapping.total_fields.limit': 5000,
    },
    mappings: {
      dynamic: 'strict' as const,
      properties: {
        '@timestamp': { type: 'date' as const },
        content_fingerprint: { type: 'keyword' as const },
        // Application-layer space filter tag (`'*'` = all spaces). Kibana routes
        // scope reads to the current space plus `'*'`. This is not an Elasticsearch
        // authorization boundary on the hidden reports index while supply is disabled.
        space_id: { type: 'keyword' as const },
        // Monotonic hunt-relevant revision. Init 1 on create/ingest; bump on enrich.
        revision: { type: 'integer' as const },
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
            language: { type: 'keyword' as const },
          },
        },
        severity: {
          properties: {
            level: { type: 'keyword' as const },
            score: { type: 'float' as const },
          },
        },
        // Multiplicative composite of severity.score * extracted.relevance,
        // written by enrich_threat_report's capture_ranking_signals step.
        rank_score: { type: 'float' as const },
        extracted: {
          properties: {
            iocs: {
              type: 'nested' as const,
              properties: {
                type: { type: 'keyword' as const },
                // Feed-controlled and, for a URL, effectively unbounded. A keyword
                // term over 32,766 bytes is a hard error that rejects the whole
                // report document, which leaves the report stuck `pending` and
                // retried on every enrichment run. `extract_iocs` already drops
                // values over MAX_URL_LENGTH; this is the backstop.
                value: { type: 'keyword' as const, ignore_above: FEED_TEXT_IGNORE_ABOVE },
                defanged: { type: 'keyword' as const, ignore_above: FEED_TEXT_IGNORE_ABOVE },
                severity: { type: 'keyword' as const },
                // IOC tier fields (v15). Distinct from source.tier (integer).
                // tier = active assignment; tier_heuristic = deterministic rule output;
                // tier_basis = rule name for tuning/observability.
                tier: { type: 'keyword' as const },
                tier_heuristic: { type: 'keyword' as const },
                tier_basis: { type: 'keyword' as const },
                // Port from socket extraction (v17): ip:port / domain:port → integer.
                port: { type: 'integer' as const },
                // Per-IOC nearest-ref URL from Maltrail trail files (v19). The promote_threat_indicators
                // task copies this into sources[].reference for the indicators companion index.
                reference: { type: 'keyword' as const, ignore_above: FEED_TEXT_IGNORE_ABOVE },
                // Index of the Maltrail block this IOC belongs to (v19). Used by the sync task
                // to associate each IOC with its source reference URL.
                block_index: { type: 'integer' as const },
              },
            },
            ioc_set_hash: { type: 'keyword' as const },
            // LLM-emitted "how useful is this report for writing a
            // detection rule?" score in `[0, 1]`. Populated by the
            // stage-2 enrichment in `enrich_threat_report`.
            // Multiplied with `severity.score` to derive `rank_score`.
            // A neutral 0.5 baseline is written if the enrichment step
            // fails (best-effort) so reports still get a usable rank.
            relevance: { type: 'float' as const },
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
            // enrichment in `enrich_threat_report`. See
            // `THREAT_CATEGORIES` in `common/constants.ts` for the allowed
            // values.
            categories: { type: 'keyword' as const },
            // Diamond Model extraction — populated by extract_diamond for
            // threat-positive reports (gated on enrich_taxonomy actionability).
            diamond: {
              properties: {
                adversary: {
                  properties: {
                    // HIGH = specific named actor; PARTIAL = vague/unattributed; NONE = absent.
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
                    },
                  },
                },
                capability: {
                  properties: {
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
                    },
                  },
                },
                infrastructure: {
                  properties: {
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
                    },
                  },
                },
                victim: {
                  properties: {
                    signal: { type: 'keyword' as const },
                    summary: {
                      type: 'semantic_text' as const,
                      inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
                    },
                  },
                },
                // Count of vertices with signal != NONE (0..4). Cheap filter
                // for "how much diamond structure did we extract from this report?"
                signal_count: { type: 'integer' as const },
                // Connector/model that produced the extraction — for audit trail.
                model_id: { type: 'keyword' as const },
                extracted_at: { type: 'date' as const },
                // 'single_call' (normal path) | 'per_vertex_fallback' (context-overflow fallback).
                extraction_mode: { type: 'keyword' as const },
                // Whether extract_diamond considered this report suitable (observability).
                suitable: { type: 'boolean' as const },
              },
            },
            // assess_relevance gate verdict — persisted on every enrichment run.
            gate: {
              properties: {
                is_intelligence: { type: 'boolean' as const },
                quality_class: { type: 'keyword' as const },
                evidence_tier: { type: 'keyword' as const },
                needs_render: { type: 'boolean' as const },
                has_original_commentary: { type: 'boolean' as const },
                reason: { type: 'text' as const, index: false },
                assessed_at: { type: 'date' as const },
              },
            },
            // Structured vulnerability fields from the kev adapter (keyword/date, aggregatable).
            vulnerability: {
              properties: {
                cve_id: { type: 'keyword' as const },
                vendor: { type: 'keyword' as const },
                product: { type: 'keyword' as const },
                name: { type: 'keyword' as const },
                cwes: { type: 'keyword' as const },
                date_added: { type: 'date' as const },
                due_date: { type: 'date' as const },
                ransomware_use: { type: 'keyword' as const },
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
        lineage: {
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
            // Set once the retention task drops the untrusted report body. Also
            // the idempotency marker that keeps the task from re-scrubbing.
            content_scrubbed_at: { type: 'date' as const },
          },
        },
        // Per-space environment evidence: alert-matching hits from the
        // Attribute Alerts task (hourly) and hunt outcomes from Hunt Watch's
        // writer (per hunt run, not yet landed), one element per space. Nested +
        // `space_id` so a global (`*`) report can carry every space's element
        // without clobber — merged from the former separate `attribution` and
        // `feedback` fields since both are per-space evidence about the same
        // report and neither's fields overlapped. No migration: `object` ->
        // `nested` cannot be applied in place; pre-GA / flag-off means
        // drop+recreate. `REQUIRED_REPORT_FIELDS` makes a stale index fail loudly.
        evidence: {
          type: 'nested' as const,
          properties: {
            space_id: { type: 'keyword' as const },
            // Attribute Alerts task (hourly, Detection Engine alert matching).
            alert_hits_total: { type: 'integer' as const },
            alert_hits: {
              properties: {
                window: { type: 'keyword' as const },
                computed_at: { type: 'date' as const },
                ioc_match_hits: { type: 'integer' as const },
                technique_overlap_hits: { type: 'integer' as const },
              },
            },
            // Hunt Watch's writer (per hunt run; no writer lands in this branch).
            last_hunted_at: { type: 'date' as const },
            // Report.revision echoed at hunt time so continuous_threat_hunt can
            // bypass the time cooldown when enrich bumps revision. Reserved
            // mapping only until the hunt_feedback route lands.
            last_hunted_revision: { type: 'integer' as const },
            // Latest targeted hunt status echo (keyword for mapping stability).
            last_hunt_status: { type: 'keyword' as const },
            last_hunt_run_id: { type: 'keyword' as const },
            last_hunt_event_hit_count: { type: 'integer' as const },
            // rank_score * a boost derived from hunt feedback. Reserved mapping
            // only: no writer or reader exists yet, Hunt Watch's writer owns it.
            corroborated_rank_score: { type: 'float' as const },
          },
        },
      },
    },
  },
};

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
        settings: { ...HIDDEN_INDEX_SETTINGS },
        mappings: {
          dynamic: 'strict',
          properties: {
            adapter_type: { type: 'keyword' },
            name: { type: 'keyword' },
            enabled: { type: 'boolean' },
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
    name: `${THREAT_INTEL_INDICATORS_INDEX}-template`,
    body: {
      name: `${THREAT_INTEL_INDICATORS_INDEX}-template`,
      index_patterns: [THREAT_INTEL_INDICATORS_INDEX],
      priority: 200,
      _meta: TEMPLATE_META,
      template: {
        settings: {
          ...HIDDEN_INDEX_SETTINGS,
          // Stated rather than left at the 10,000 default so the promote task's
          // sources[] cap has something explicit to sit under. A frequently-cited
          // IOC that crossed the limit used to make every later scripted update to
          // that document fail, which is a permanent rejection.
          'index.mapping.nested_objects.limit': MAX_NESTED_OBJECTS,
        },
        mappings: {
          // ECS-aligned `threat.indicator.*` shape so Detection Engine's
          // Indicator Match rule type can query this index with its default
          // field mapping. The `indicator.reference` field carries
          // `threat-report:<report_id>` for alert-to-report joins.
          dynamic: 'strict',
          properties: {
            '@timestamp': { type: 'date' },
            threat: {
              properties: {
                indicator: {
                  properties: {
                    type: { type: 'keyword' },
                    provider: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                    reference: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                    description: { type: 'text', index: false },
                    confidence: { type: 'keyword' },
                    first_seen: { type: 'date' },
                    last_seen: { type: 'date' },
                    ip: { type: 'ip' },
                    url: {
                      properties: {
                        full: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                        domain: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                      },
                    },
                    file: {
                      properties: {
                        hash: {
                          properties: {
                            md5: { type: 'keyword' },
                            sha1: { type: 'keyword' },
                            sha256: { type: 'keyword' },
                            sha512: { type: 'keyword' },
                          },
                        },
                      },
                    },
                    // One field per remaining `IOC_TYPES` entry. `dynamic:
                    // 'strict'` rejects the whole document otherwise, so any
                    // type `ecsIndicatorPayload` can emit needs a mapping here.
                    email: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                    network: {
                      properties: {
                        cidr: { type: 'keyword' },
                      },
                    },
                    cryptocurrency: {
                      properties: {
                        address: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                      },
                    },
                  },
                },
              },
            },
            // Per-report citation accumulator (v19). Nested so each entry's
            // fields are associated correctly in multi-field queries. Dedup key
            // within the array is `report_id` — scripted upsert in
            // `tasks/promote_threat_indicators.ts` guards against duplicates.
            sources: {
              type: 'nested',
              properties: {
                report_id: { type: 'keyword' },
                provider: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                trail: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                reference: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                first_seen: { type: 'date' },
              },
            },
            // Set by the promote task once sources[] reaches MAX_SOURCE_CITATIONS.
            // Without it the cap would be a silent truncation of provenance.
            sources_truncated: { type: 'boolean' },
            // Owning space of the citing reports. Indicators are keyed
            // `<space_id>:<type>:<value>` so a value seen in two spaces stays two
            // isolated docs and sources[] never merges across space boundaries.
            //
            // CONSUMER CONTRACT: the key prefix is not an authorization boundary.
            // Elasticsearch does not apply Spaces filtering, so anything querying
            // this index must filter `space_id` itself or a rule in one space will
            // match another space's private intelligence.
            space_id: { type: 'keyword' },
            // Legacy single-source fields; sources[] is authoritative for citations.
            source_report_id: { type: 'keyword' },
            source_report_url: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
            severity: { type: 'keyword' },
            // The extract_iocs tier this row was promoted with. Always present.
            //
            // CONSUMER CONTRACT: this index is the full set of candidate
            // indicators, not a vetted set. `uncertain` is stored deliberately, so
            // a consumer that wants precision must filter
            // `ioc_tier: [discriminating, contextual]`. Detection rules should
            // point at the filtered alias rather than this index directly.
            ioc_tier: { type: 'keyword' },
          },
        },
      },
    },
  },
];

/**
 * Concrete report indices to patch. Reports live in a regular index (they are
 * updated in place by enrich and evidence), so there is no data
 * stream to ask for backing indices — resolving the pattern is the only way to
 * find them.
 */
const resolveReportIndices = async (
  esClient: ElasticsearchClient,
  log: Logger
): Promise<string[]> => {
  // Deliberately not caught. `ignore: [404]` plus `ignore_unavailable` and
  // `allow_no_indices` already turn "there are no report indices yet" into an empty
  // response, so anything that still throws here is a real request failure: a
  // timeout, an authorization error, a 5xx.
  //
  // Swallowing those returned `[]`, which skipped every report migration *and* left
  // `assertMigratedSchemaIsUsable` with nothing to check, so the install reported
  // success and bootstrap advertised readiness over possibly stale strict mappings.
  // Letting it propagate puts it back in `withElasticsearchRetry`.
  const response = await esClient.indices.get(
    { index: THREAT_REPORTS_INDEX_PATTERN, ...HIDDEN_INDEX_SEARCH_OPTIONS },
    { ignore: [404] }
  );
  const indices = Object.keys(response ?? {});
  if (indices.length === 0) {
    log.debug('no report indices exist yet — skipping report migrations');
  }
  return indices;
};

const migrateExistingDiamondMappings = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('diamond-mapping-migration');

  for (const indexName of reportIndices) {
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
                          inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
                        },
                      },
                    },
                    capability: {
                      properties: {
                        signal: { type: 'keyword' },
                        summary: {
                          type: 'semantic_text',
                          inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
                        },
                      },
                    },
                    infrastructure: {
                      properties: {
                        signal: { type: 'keyword' },
                        summary: {
                          type: 'semantic_text',
                          inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
                        },
                      },
                    },
                    victim: {
                      properties: {
                        signal: { type: 'keyword' },
                        summary: {
                          type: 'semantic_text',
                          inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
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
          `extract_diamond writes will fail on documents in this index until the mapping is updated manually: ` +
          `PUT ${indexName}/_mapping { "properties": { "extracted": { "properties": { "diamond": { ... } } } } }`
      );
    }
  }
};

const migrateExistingIocTierMappings = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('ioc-tier-mapping-migration');

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const iocProps = (
        (
          indexMappings?.mappings?.properties as
            | Record<
                string,
                { properties?: Record<string, { properties?: Record<string, unknown> }> }
              >
            | undefined
        )?.extracted?.properties?.iocs as { properties?: Record<string, unknown> } | undefined
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

const migrateExistingIocPortMapping = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('ioc-port-mapping-migration');

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const iocProps = (
        (
          indexMappings?.mappings?.properties as
            | Record<
                string,
                { properties?: Record<string, { properties?: Record<string, unknown> }> }
              >
            | undefined
        )?.extracted?.properties?.iocs as { properties?: Record<string, unknown> } | undefined
      )?.properties;

      if (!iocProps?.port) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            extracted: {
              properties: {
                iocs: {
                  type: 'nested',
                  properties: {
                    port: { type: 'integer' },
                  },
                },
              },
            },
          },
        });
        log.info(`Migrated ioc port mapping on ${indexName} (v17 backfill)`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate ioc port mapping on ${indexName}: ${(err as Error).message}. ` +
          `The extracted.iocs port field will be rejected by dynamic: strict until the ` +
          `mapping is updated manually.`
      );
    }
  }
};

const migrateExistingIocReferenceMappings = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('ioc-reference-mapping-migration');

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const iocProps = (
        (
          indexMappings?.mappings?.properties as
            | Record<
                string,
                { properties?: Record<string, { properties?: Record<string, unknown> }> }
              >
            | undefined
        )?.extracted?.properties?.iocs as { properties?: Record<string, unknown> } | undefined
      )?.properties;

      if (!iocProps?.reference || !iocProps?.block_index) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            extracted: {
              properties: {
                iocs: {
                  type: 'nested',
                  properties: {
                    reference: { type: 'keyword' },
                    block_index: { type: 'integer' },
                  },
                },
              },
            },
          },
        });
        log.info(`Migrated ioc reference/block_index mappings on ${indexName} (v19 backfill)`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate ioc reference mappings on ${indexName}: ${(err as Error).message}. ` +
          `The extracted.iocs reference/block_index fields will be rejected by dynamic: strict ` +
          `until the mapping is updated manually.`
      );
    }
  }
};

const migrateExistingGateMappings = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('gate-mapping-migration');

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const extractedProps = (
        indexMappings?.mappings?.properties as
          | Record<string, { properties?: Record<string, unknown> }>
          | undefined
      )?.extracted?.properties;

      if (!extractedProps?.gate) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            extracted: {
              properties: {
                gate: {
                  properties: {
                    is_intelligence: { type: 'boolean' },
                    quality_class: { type: 'keyword' },
                    evidence_tier: { type: 'keyword' },
                    needs_render: { type: 'boolean' },
                    has_original_commentary: { type: 'boolean' },
                    reason: { type: 'text', index: false },
                    assessed_at: { type: 'date' },
                  },
                },
              },
            },
          },
        });
        log.info(`Migrated gate mappings on ${indexName} (v16 backfill)`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate gate mappings on ${indexName}: ${(err as Error).message}. ` +
          `The extracted.gate fields will be rejected by dynamic: strict until the ` +
          `mapping is updated manually.`
      );
    }
  }
};

const migrateExistingIndicatorSourcesMapping = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> => {
  const log = logger.get('indicator-sources-mapping-migration');

  try {
    const exists = await esClient.indices.exists({ index: THREAT_INTEL_INDICATORS_INDEX });
    if (!exists) {
      log.debug(`indicator-sources-mapping-migration: index not found — skipping`);
      return;
    }

    const { [THREAT_INTEL_INDICATORS_INDEX]: indexMappings } = await esClient.indices.getMapping({
      index: THREAT_INTEL_INDICATORS_INDEX,
    });
    const topLevelProps = indexMappings?.mappings?.properties as
      | Record<string, unknown>
      | undefined;

    if (!topLevelProps?.sources) {
      await esClient.indices.putMapping({
        index: THREAT_INTEL_INDICATORS_INDEX,
        properties: {
          sources: {
            type: 'nested',
            properties: {
              report_id: { type: 'keyword' },
              provider: { type: 'keyword' },
              trail: { type: 'keyword' },
              reference: { type: 'keyword' },
              first_seen: { type: 'date' },
            },
          },
        },
      });
      log.info(`Migrated sources[] mapping on ${THREAT_INTEL_INDICATORS_INDEX} (v19 backfill)`);
    }
  } catch (err) {
    log.error(
      `Failed to migrate sources[] mapping on ${THREAT_INTEL_INDICATORS_INDEX}: ${
        (err as Error).message
      }. ` +
        `The sources[] field will be rejected by dynamic: strict until the mapping is updated manually.`
    );
  }
};

/** `revision` (v28) for clusters created before read-API revision tracking. */
const migrateExistingRevisionMapping = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('revision-mapping-migration');

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const props = indexMappings?.mappings?.properties as Record<string, unknown> | undefined;

      if (!props?.revision) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            revision: { type: 'integer' },
          },
        });
        log.info(`Migrated revision mapping on ${indexName} (v28)`);
      }

      // Existing reports need revision: 1 so the usable bar and Dark consumers
      // treat them as first-revision docs rather than missing the field.
      const updateResult = await esClient.updateByQuery({
        index: indexName,
        conflicts: 'proceed',
        refresh: false,
        query: {
          bool: {
            must_not: [{ exists: { field: 'revision' } }],
          },
        },
        script: {
          lang: 'painless',
          source: 'ctx._source.revision = 1',
        },
      });
      const updated = updateResult.updated ?? 0;
      if (updated > 0) {
        log.info(`Backfilled revision: 1 on ${updated} report(s) in ${indexName}`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate revision on ${indexName}: ${(err as Error).message}. ` +
          `Reports without revision will fail the usable bar until this succeeds.`
      );
    }
  }
};

/** `lineage.content_scrubbed_at` (v23) for clusters created before retention existed. */
const migrateExistingContentScrubbedMapping = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('content-scrubbed-mapping-migration');

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const lineageProps = (
        (
          indexMappings?.mappings?.properties as
            | Record<string, { properties?: Record<string, unknown> }>
            | undefined
        )?.lineage as { properties?: Record<string, unknown> } | undefined
      )?.properties;

      if (!lineageProps?.content_scrubbed_at) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            lineage: { properties: { content_scrubbed_at: { type: 'date' } } },
          },
        });
        log.info(`Migrated lineage.content_scrubbed_at on ${indexName} (v23 backfill)`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate lineage.content_scrubbed_at on ${indexName}: ${
          (err as Error).message
        }. The retention task cannot mark scrubbed reports until the mapping is updated.`
      );
    }
  }
};

/**
 * Index templates only apply at creation time, so clusters that created these
 * indices before `index.hidden` was set still expose them to index patterns and
 * `*` searches. Settings updates are cheap and idempotent.
 */
const migrateExistingIndicesToHidden = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('hidden-index-migration');
  const targets = [...reportIndices, THREAT_INTEL_SOURCES_INDEX, THREAT_INTEL_INDICATORS_INDEX];

  for (const index of targets) {
    try {
      const settings = await esClient.indices.getSettings({ index }, { ignore: [404] });
      const current = settings?.[index]?.settings?.index?.hidden;
      // Elasticsearch reports this as the string 'true' or a boolean.
      if (current !== true && current !== 'true') {
        await esClient.indices.putSettings({ index, settings: HIDDEN_INDEX_SETTINGS });
        log.info(`Marked ${index} as hidden`);
      }
    } catch (err) {
      log.warn(
        `Could not mark ${index} as hidden: ${(err as Error).message}. It stays visible to ` +
          `index patterns and wildcard searches until this succeeds.`
      );
    }
  }
};

/**
 * Adds the `threat.indicator` fields for the `email`, `cidr`, and `wallet` IOC
 * types (plus `sha512`). Without them `dynamic: 'strict'` rejects every bulk
 * upsert for those types, and the promote task only logs a warning, so the
 * indicators were dropped silently.
 */
const migrateExistingIndicatorTypeMappings = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> => {
  const log = logger.get('indicator-type-mapping-migration');

  try {
    const exists = await esClient.indices.exists({ index: THREAT_INTEL_INDICATORS_INDEX });
    if (!exists) {
      log.debug('indicator-type-mapping-migration: index not found — skipping');
      return;
    }

    const { [THREAT_INTEL_INDICATORS_INDEX]: indexMappings } = await esClient.indices.getMapping({
      index: THREAT_INTEL_INDICATORS_INDEX,
    });
    const indicatorProps = (
      (
        indexMappings?.mappings?.properties as
          | Record<
              string,
              { properties?: Record<string, { properties?: Record<string, unknown> }> }
            >
          | undefined
      )?.threat?.properties?.indicator as { properties?: Record<string, unknown> } | undefined
    )?.properties;

    const topLevelProps = indexMappings?.mappings?.properties as
      | Record<string, unknown>
      | undefined;

    // Leaf paths, not parents. A parent object can exist while the leaf this
    // migration writes does not, and `network`/`cryptocurrency` are objects whose
    // presence proved nothing about `network.cidr` or `cryptocurrency.address`.
    // `file.hash.sha512` was not checked at all.
    const leaf = (parent: unknown, name: string) =>
      (parent as { properties?: Record<string, unknown> } | undefined)?.properties?.[name];
    if (
      indicatorProps?.email &&
      leaf(indicatorProps?.network, 'cidr') &&
      leaf(indicatorProps?.cryptocurrency, 'address') &&
      leaf(leaf(indicatorProps?.file, 'hash'), 'sha512') &&
      topLevelProps?.ioc_tier
    ) {
      return;
    }

    await esClient.indices.putMapping({
      index: THREAT_INTEL_INDICATORS_INDEX,
      properties: {
        ioc_tier: { type: 'keyword' },
        threat: {
          properties: {
            indicator: {
              properties: {
                email: { type: 'keyword' },
                network: { properties: { cidr: { type: 'keyword' } } },
                cryptocurrency: { properties: { address: { type: 'keyword' } } },
                file: { properties: { hash: { properties: { sha512: { type: 'keyword' } } } } },
              },
            },
          },
        },
      },
    });
    log.info(
      `Migrated email / cidr / wallet indicator mappings on ${THREAT_INTEL_INDICATORS_INDEX} (v23 backfill)`
    );
  } catch (err) {
    log.error(
      `Failed to migrate indicator type mappings on ${THREAT_INTEL_INDICATORS_INDEX}: ${
        (err as Error).message
      }. Email, CIDR, and wallet indicators will be rejected by dynamic: strict ` +
        `until the mapping is updated manually.`
    );
  }
};

/**
 * Adds the top-level `space_id` keyword to the indicators index (v24). Indicators
 * are keyed `<space_id>:<type>:<value>` so a value cited by reports in different
 * spaces stays in separate docs and sources[] never merges across space
 * boundaries. Without the mapping `dynamic: 'strict'` rejects every upsert once
 * the promote task starts stamping `space_id`.
 */
const migrateExistingIndicatorSpaceIdMapping = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> => {
  const log = logger.get('indicator-space-id-mapping-migration');

  try {
    const exists = await esClient.indices.exists({ index: THREAT_INTEL_INDICATORS_INDEX });
    if (!exists) {
      log.debug('indicator-space-id-mapping-migration: index not found — skipping');
      return;
    }

    const { [THREAT_INTEL_INDICATORS_INDEX]: indexMappings } = await esClient.indices.getMapping({
      index: THREAT_INTEL_INDICATORS_INDEX,
    });
    const topLevelProps = indexMappings?.mappings?.properties as
      | Record<string, unknown>
      | undefined;

    if (topLevelProps?.space_id) return;

    await esClient.indices.putMapping({
      index: THREAT_INTEL_INDICATORS_INDEX,
      properties: {
        space_id: { type: 'keyword' },
      },
    });
    log.info(`Migrated space_id mapping on ${THREAT_INTEL_INDICATORS_INDEX} (v24 backfill)`);
  } catch (err) {
    log.error(
      `Failed to migrate space_id mapping on ${THREAT_INTEL_INDICATORS_INDEX}: ${
        (err as Error).message
      }. Indicators will be rejected by dynamic: strict until the mapping is updated manually.`
    );
  }
};

/**
 * Bounds the feed-controlled keyword fields on an existing indicators index and
 * adds `sources_truncated` (v25).
 *
 * A keyword term over 32,766 bytes is a hard error, and on this index an
 * item-level error is permanent: the same document fails on every promote run.
 * Before the sync learned to distinguish permanent from transient rejections that
 * pinned the checkpoint and stopped promotion for every space, so this is the
 * mapping half of that fix. `ignore_above` is an updatable parameter, so this
 * applies to newly indexed documents without a reindex.
 */
/**
 * Bounds the feed-controlled keyword fields on one report index (v26).
 *
 * `extracted.iocs.value` is the one that matters. A URL IOC can be as long as the
 * report body, and a keyword term over 32,766 bytes is a hard Elasticsearch error
 * that rejects the entire report document rather than just the field. The report
 * then stays `pending` and every enrichment run retries it forever.
 *
 * `extract_iocs` now drops values over MAX_URL_LENGTH, so this is the backstop for
 * anything already stored and for the citation URLs that come straight from feeds.
 * `ignore_above` is an updatable mapping parameter, so no reindex is needed.
 */
const migrateOneReportKeywordBounds = async (
  esClient: ElasticsearchClient,
  indexName: string,
  log: Logger
): Promise<void> => {
  try {
    const { [indexName]: indexMappings } = await esClient.indices.getMapping({ index: indexName });
    const iocProps = ((
      (indexMappings?.mappings?.properties?.extracted as { properties?: Record<string, unknown> })
        ?.properties?.iocs as { properties?: Record<string, unknown> }
    )?.properties ?? {}) as Record<string, { ignore_above?: number }>;

    if (
      iocProps.value?.ignore_above === FEED_TEXT_IGNORE_ABOVE &&
      iocProps.defanged?.ignore_above === FEED_TEXT_IGNORE_ABOVE &&
      iocProps.reference?.ignore_above === FEED_TEXT_IGNORE_ABOVE
    ) {
      return;
    }

    await esClient.indices.putMapping({
      index: indexName,
      properties: {
        extracted: {
          properties: {
            iocs: {
              type: 'nested',
              properties: {
                value: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                defanged: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                reference: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
              },
            },
          },
        },
      },
    });
    log.info(`Migrated keyword bounds on ${indexName} (v26 backfill)`);
  } catch (err) {
    log.error(
      `Failed to migrate keyword bounds on ${indexName}: ${(err as Error).message}. ` +
        `A report carrying an IOC value over 32,766 bytes will be rejected in full until ` +
        `the mapping is updated manually.`
    );
  }
};

const migrateExistingReportKeywordBounds = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('report-keyword-bounds-migration');
  for (const indexName of reportIndices) {
    await migrateOneReportKeywordBounds(esClient, indexName, log);
  }
};

/**
 * Applies the nested-objects ceiling, independently of the mapping half of the same
 * migration. Separate request, separate failure mode, so it gets its own check.
 */
const ensureIndicatorNestedLimit = async (
  esClient: ElasticsearchClient,
  log: Logger
): Promise<void> => {
  try {
    const settings = await esClient.indices.getSettings(
      { index: THREAT_INTEL_INDICATORS_INDEX },
      { ignore: [404] }
    );
    const current =
      settings?.[THREAT_INTEL_INDICATORS_INDEX]?.settings?.index?.mapping?.nested_objects?.limit;
    if (Number(current) === MAX_NESTED_OBJECTS) return;

    await esClient.indices.putSettings({
      index: THREAT_INTEL_INDICATORS_INDEX,
      settings: { 'index.mapping.nested_objects.limit': MAX_NESTED_OBJECTS },
    });
    log.info(`Set nested_objects.limit on ${THREAT_INTEL_INDICATORS_INDEX}`);
  } catch (err) {
    log.error(
      `Failed to set nested_objects.limit on ${THREAT_INTEL_INDICATORS_INDEX}: ${
        (err as Error).message
      }. A widely-cited indicator will start rejecting updates once sources[] crosses ` +
        `the default limit.`
    );
  }
};

const migrateExistingIndicatorKeywordBounds = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<void> => {
  const log = logger.get('indicator-keyword-bounds-migration');

  try {
    const exists = await esClient.indices.exists({ index: THREAT_INTEL_INDICATORS_INDEX });
    if (!exists) {
      log.debug('indicator-keyword-bounds-migration: index not found — skipping');
      return;
    }

    const { [THREAT_INTEL_INDICATORS_INDEX]: indexMappings } = await esClient.indices.getMapping({
      index: THREAT_INTEL_INDICATORS_INDEX,
    });
    const topLevelProps = indexMappings?.mappings?.properties as
      | Record<string, unknown>
      | undefined;

    // The mapping and the nested-object limit are two separate Elasticsearch
    // requests, so one marker cannot speak for both. Keyed only to the mapping, a
    // transient `putSettings` failure was unrecoverable: the retry saw
    // `sources_truncated` present, returned early, and the nested limit stayed at the
    // old value until a restart, after which indicator updates start failing once
    // `sources[]` crosses it. Each half is now checked and applied independently.
    const mappingDone = Boolean(topLevelProps?.sources_truncated);
    if (mappingDone) {
      await ensureIndicatorNestedLimit(esClient, log);
      return;
    }

    await esClient.indices.putMapping({
      index: THREAT_INTEL_INDICATORS_INDEX,
      properties: {
        sources_truncated: { type: 'boolean' },
        source_report_url: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
        threat: {
          properties: {
            indicator: {
              properties: {
                provider: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                reference: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                email: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                url: {
                  properties: {
                    full: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                    domain: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                  },
                },
                cryptocurrency: {
                  properties: {
                    address: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
                  },
                },
              },
            },
          },
        },
        sources: {
          type: 'nested',
          properties: {
            provider: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
            trail: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
            reference: { type: 'keyword', ignore_above: FEED_TEXT_IGNORE_ABOVE },
          },
        },
      },
    });

    // Separate request from the mapping above, so it has its own check and its own
    // failure handling rather than riding on the mapping's marker.
    await ensureIndicatorNestedLimit(esClient, log);

    log.info(
      `Migrated keyword bounds and nested limit on ${THREAT_INTEL_INDICATORS_INDEX} (v25 backfill)`
    );
  } catch (err) {
    log.error(
      `Failed to migrate keyword bounds on ${THREAT_INTEL_INDICATORS_INDEX}: ${
        (err as Error).message
      }. Indicators carrying a keyword value over 32,766 bytes will be rejected until the ` +
        `mapping is updated manually.`
    );
  }
};

const migrateExistingVulnerabilityMappings = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  logger: Logger
): Promise<void> => {
  const log = logger.get('vulnerability-mapping-migration');

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: indexMappings } = await esClient.indices.getMapping({
        index: indexName,
      });
      const extractedProps = (
        indexMappings?.mappings?.properties as
          | Record<string, { properties?: Record<string, unknown> }>
          | undefined
      )?.extracted?.properties;

      if (!extractedProps?.vulnerability) {
        await esClient.indices.putMapping({
          index: indexName,
          properties: {
            extracted: {
              properties: {
                vulnerability: {
                  properties: {
                    cve_id: { type: 'keyword' },
                    vendor: { type: 'keyword' },
                    product: { type: 'keyword' },
                    name: { type: 'keyword' },
                    cwes: { type: 'keyword' },
                    date_added: { type: 'date' },
                    due_date: { type: 'date' },
                    ransomware_use: { type: 'keyword' },
                  },
                },
              },
            },
          },
        });
        log.info(`Migrated extracted.vulnerability mappings on ${indexName} (v20 backfill)`);
      }
    } catch (err) {
      log.error(
        `Failed to migrate vulnerability mappings on ${indexName}: ${(err as Error).message}. ` +
          `The extracted.vulnerability fields will be rejected by dynamic: strict until the ` +
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
    // Only the concurrent-creation race is safe to swallow. Matching on the
    // 400 status alone also hid real failures such as
    // cluster_shard_limit_exceeded: boot would succeed, the index would not
    // exist, and every later write to it would fail with no obvious cause.
    const errorType = (err as { body?: { error?: { type?: string } } })?.body?.error?.type;
    if (errorType === 'resource_already_exists_exception') return;
    throw err;
  }
};

/**
 * What a migration is responsible for leaving behind.
 *
 * `path` alone is not enough for every entry. The v26 migration changes a *parameter*
 * (`ignore_above`) on paths that already exist on a pre-v26 index, so an
 * existence-only check cannot tell a migrated index from an unmigrated one. Entries
 * that name `ignoreAbove` are verified by value.
 */
interface RequiredMapping {
  path: string;
  ignoreAbove?: number;
}

const REQUIRED_REPORT_FIELDS: readonly RequiredMapping[] = [
  { path: 'extracted.diamond' },
  { path: 'extracted.gate' },
  { path: 'extracted.vulnerability' },
  { path: 'extracted.iocs.tier' },
  { path: 'extracted.iocs.port' },
  // v19 writes `reference` and `block_index` (Maltrail chunking) in one putMapping, so
  // this leaf is checked on its own: a failed v19 followed by a successful v26
  // keyword-bounds putMapping re-adds `reference` but not `block_index`, so verifying
  // `reference` alone would pass while `dynamic: strict` rejects Maltrail reports that
  // carry `block_index`. Maltrail ships enabled by default, so this is a live path.
  { path: 'extracted.iocs.block_index' },
  { path: 'lineage.content_scrubbed_at' },
  // v30: attribution/feedback merged into evidence, object -> nested. Not
  // putMapping-able; without this leaf a stale index rejects writes under
  // dynamic:strict and the workflow swallows it.
  { path: 'evidence.space_id' },
  { path: 'extracted.iocs.value', ignoreAbove: FEED_TEXT_IGNORE_ABOVE },
  { path: 'extracted.iocs.defanged', ignoreAbove: FEED_TEXT_IGNORE_ABOVE },
  { path: 'extracted.iocs.reference', ignoreAbove: FEED_TEXT_IGNORE_ABOVE },
];

const REQUIRED_INDICATOR_FIELDS: readonly RequiredMapping[] = [
  { path: 'space_id' },
  { path: 'sources' },
  // Leaves, not just the parent: `migrateExistingIndicatorSourcesMapping` writes
  // these onto the nested `sources` object, but a failed run followed by a successful
  // keyword-bounds putMapping recreates `sources` with only provider/trail/reference,
  // so the parent exists while these stay unmapped and `dynamic: strict` rejects the
  // scripted upserts that set `report_id`/`first_seen`.
  { path: 'sources.report_id' },
  { path: 'sources.first_seen' },
  { path: 'sources_truncated' },
  { path: 'ioc_tier' },
  { path: 'threat.indicator.email', ignoreAbove: FEED_TEXT_IGNORE_ABOVE },
  // Leaves, not parents: the v23 migration writes these, and a parent object can
  // exist without them.
  { path: 'threat.indicator.network.cidr' },
  { path: 'threat.indicator.cryptocurrency.address' },
  { path: 'threat.indicator.file.hash.sha512' },
  { path: 'threat.indicator.url.full', ignoreAbove: FEED_TEXT_IGNORE_ABOVE },
  { path: 'threat.indicator.provider', ignoreAbove: FEED_TEXT_IGNORE_ABOVE },
  { path: 'source_report_url', ignoreAbove: FEED_TEXT_IGNORE_ABOVE },
];

/** Resolves a dotted path through an Elasticsearch `properties` tree. */
const getMappedField = (
  mappings: MappingTypeMapping | undefined,
  path: string
): Record<string, unknown> | undefined => {
  let node = mappings?.properties as Record<string, unknown> | undefined;
  const segments = path.split('.');
  for (const [index, segment] of segments.entries()) {
    const next = node?.[segment] as
      | (Record<string, unknown> & { properties?: Record<string, unknown> })
      | undefined;
    if (!next) return undefined;
    if (index === segments.length - 1) return next;
    node = next.properties;
  }
  return undefined;
};

/** Returns a description of what is wrong with a required mapping, or undefined. */
const checkRequiredMapping = (
  mappings: MappingTypeMapping | undefined,
  required: RequiredMapping
): string | undefined => {
  const field = getMappedField(mappings, required.path);
  if (!field) return required.path;
  if (required.ignoreAbove !== undefined && field.ignore_above !== required.ignoreAbove) {
    return `${required.path} (ignore_above ${String(field.ignore_above)}, expected ${
      required.ignoreAbove
    })`;
  }
  return undefined;
};

/**
 * Confirms the migrations actually left a usable schema.
 *
 * Every migration catches and logs its own failure, which is deliberate: one index
 * failing should not stop the others. The consequence was that `installIndexTemplates`
 * always looked successful, so `withElasticsearchRetry` never retried and the
 * readiness promise resolved even though `dynamic: strict` would reject later writes.
 * Routes then accept a report and fail on write, which surfaces much later as an
 * unexplained write error.
 *
 * This checks the outcome rather than each step's return value, which also catches a
 * migration that ran without error but took a wrong branch and skipped its field.
 * Throwing here puts bootstrap back into its retry loop and keeps readiness unresolved.
 */
const assertMigratedSchemaIsUsable = async (
  esClient: ElasticsearchClient,
  reportIndices: readonly string[],
  log: Logger
): Promise<void> => {
  const missing: string[] = [];

  for (const indexName of reportIndices) {
    try {
      const { [indexName]: m } = await esClient.indices.getMapping({ index: indexName });
      for (const required of REQUIRED_REPORT_FIELDS) {
        const problem = checkRequiredMapping(m?.mappings, required);
        if (problem) missing.push(`${indexName}:${problem}`);
      }
    } catch (err) {
      missing.push(`${indexName}:<mapping unreadable: ${(err as Error).message}>`);
    }
  }

  try {
    const exists = await esClient.indices.exists({ index: THREAT_INTEL_INDICATORS_INDEX });
    if (exists) {
      const { [THREAT_INTEL_INDICATORS_INDEX]: m } = await esClient.indices.getMapping({
        index: THREAT_INTEL_INDICATORS_INDEX,
      });
      for (const required of REQUIRED_INDICATOR_FIELDS) {
        const problem = checkRequiredMapping(m?.mappings, required);
        if (problem) missing.push(`${THREAT_INTEL_INDICATORS_INDEX}:${problem}`);
      }
    }
  } catch (err) {
    missing.push(
      `${THREAT_INTEL_INDICATORS_INDEX}:<mapping unreadable: ${(err as Error).message}>`
    );
  }

  // The nested ceiling is set by a separate request from the mapping that marks its
  // migration done, so verify it separately too. Without this, a transient
  // putSettings failure left the old lower limit in place and indicator updates
  // started failing once sources[] crossed it.
  try {
    const indicatorSettings = await esClient.indices.getSettings(
      { index: THREAT_INTEL_INDICATORS_INDEX },
      { ignore: [404] }
    );
    const entry = indicatorSettings?.[THREAT_INTEL_INDICATORS_INDEX];
    if (entry) {
      const limit = entry.settings?.index?.mapping?.nested_objects?.limit;
      if (Number(limit) !== MAX_NESTED_OBJECTS) {
        missing.push(`${THREAT_INTEL_INDICATORS_INDEX}:<nested_objects.limit is ${String(limit)}>`);
      }
    }
  } catch (err) {
    missing.push(
      `${THREAT_INTEL_INDICATORS_INDEX}:<settings unreadable: ${(err as Error).message}>`
    );
  }

  // The hidden-index migration also catches its own failures, and mappings-only
  // verification let a transient putSettings failure through: pre-existing report,
  // source, and indicator indices stay visible to ordinary wildcard searches and
  // index-pattern discovery, against the hidden-index contract, and it is only retried
  // after another restart.
  for (const indexName of [
    ...reportIndices,
    THREAT_INTEL_SOURCES_INDEX,
    THREAT_INTEL_INDICATORS_INDEX,
  ]) {
    try {
      const settings = await esClient.indices.getSettings({ index: indexName }, { ignore: [404] });
      // An absent entry means the index does not exist, which is not a failure.
      const hidden = settings?.[indexName]?.settings?.index?.hidden;
      if (settings?.[indexName] && hidden !== true && hidden !== 'true') {
        missing.push(`${indexName}:<index.hidden is ${String(hidden)}>`);
      }
    } catch (err) {
      missing.push(`${indexName}:<settings unreadable: ${(err as Error).message}>`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Threat intelligence mapping migration left ${missing.length} field(s) missing, so ` +
        `dynamic: strict will reject writes that use them: ${missing.slice(0, 20).join(', ')}` +
        `${missing.length > 20 ? ', …' : ''}. Bootstrap is not ready.`
    );
  }

  log.debug('Migrated schema verified: every migration-owned field is present');
};

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
    // Derived from the reports index constant so the template name stays in lockstep.
    name: `${THREAT_REPORTS_INDEX}-template`,
    ...threatReportsTemplate,
  });

  for (const template of COMPANION_INDEX_TEMPLATES) {
    await esClient.indices.putIndexTemplate(template.body);
  }

  // Reports are a regular hidden index (enrich/evidence update by id),
  // not a data stream. Companions are sources + indicators only.
  await ensureCompanionIndex(esClient, THREAT_REPORTS_INDEX, log);
  await ensureCompanionIndex(esClient, THREAT_INTEL_SOURCES_INDEX, log);
  await ensureCompanionIndex(esClient, THREAT_INTEL_INDICATORS_INDEX, log);

  // Patch mapping fields onto pre-template reports indices. Safe to re-run.
  // The report-targeting migrations all operate on the same set, so resolve the
  // pattern once here instead of issuing an identical indices.get per migration.
  const reportIndices = await resolveReportIndices(esClient, log);

  await migrateExistingDiamondMappings(esClient, reportIndices, log);
  await migrateExistingIocTierMappings(esClient, reportIndices, log);
  await migrateExistingGateMappings(esClient, reportIndices, log);
  await migrateExistingIocPortMapping(esClient, reportIndices, log);
  await migrateExistingIocReferenceMappings(esClient, reportIndices, log);
  await migrateExistingIndicatorSourcesMapping(esClient, log);
  await migrateExistingIndicatorTypeMappings(esClient, log);
  await migrateExistingIndicatorSpaceIdMapping(esClient, log);
  await migrateExistingIndicatorKeywordBounds(esClient, log);
  await migrateExistingReportKeywordBounds(esClient, reportIndices, log);
  await migrateExistingVulnerabilityMappings(esClient, reportIndices, log);
  await migrateExistingContentScrubbedMapping(esClient, reportIndices, log);
  await migrateExistingRevisionMapping(esClient, reportIndices, log);
  await migrateExistingIndicesToHidden(esClient, reportIndices, log);

  // Fails the install (and therefore bootstrap readiness) when a migration left the
  // schema unusable. Must come after every migration.
  await assertMigratedSchemaIsUsable(esClient, reportIndices, log);

  log.info('Threat intelligence index templates installed');
};
