/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  HUNT_FOR_THREAT_INDEX_PATTERNS,
  THREAT_REPORTS_INDEX_PATTERN,
  type IocType,
} from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from '../lib/space_filter';

/**
 * Domain capability module for the `hunt_for_threat` action.
 *
 * Active forward hunt for a report's IOCs (and optional ATT&CK technique
 * IDs) across the customer environment. Resolves a `report_id` to its
 * extracted artifacts before issuing the multi-index search, then returns
 * the top matching documents alongside an `affected_assets` aggregation.
 *
 * Same shape is used by the internal HTTP route and the Agent Builder
 * tool wrapper.
 *
 * @implements
 * Conforms to the cross-team `TelemetryProbe` contract defined in
 * `common/threat_intelligence/hub/telemetry_probe.ts` (the Tier 1 /
 * atomic-lookup variant). See
 * `docs/rfcs/0001_streams_layer3_grounded_hypothesis_flow.md` for the
 * full mapping — `HuntForThreatResult` is a structural superset of
 * `TelemetryProbeResult` so we don't construct an adapter at the
 * boundary, only at the future Streams-registry registration site.
 */

export interface HuntIoc {
  type: IocType;
  value: string;
}

export interface HuntForThreatParams {
  report_id?: string;
  iocs?: HuntIoc[];
  techniques?: string[];
  time_range?: { from: string; to: string };
  size?: number;
  max_assets?: number;
  spaceId: string;
}

export interface HuntForThreatHit {
  index: string;
  id: string;
  score: number | null;
  [key: string]: unknown;
}

export interface AffectedAsset {
  name: string;
  hit_count: number;
}

export type HuntForThreatStatus =
  | 'no_searchable_input'
  | 'no_searchable_terms'
  | 'no_environment_hits'
  | 'environment_hits_found';

export interface HuntForThreatResult {
  status: HuntForThreatStatus;
  report_id?: string;
  searched_iocs: number;
  searched_techniques: number;
  /**
   * The resolved IOC set the hunt actually executed against. Populated
   * from `params.iocs` when supplied or fetched from `extracted.iocs`
   * when only `report_id` is given. Surfaced on the result so the
   * orchestrator's atomic-rule proposal step (see
   * `common/threat_intelligence/hub/rule_export.ts`) can emit one ES|QL
   * proposal per IOC without re-resolving from the report. Optional —
   * legacy callers that only inspect `searched_iocs` (the count) keep
   * working unchanged.
   */
  resolved_iocs?: HuntIoc[];
  /** Same shape as `resolved_iocs`, for the ATT&CK technique list. */
  resolved_techniques?: string[];
  time_range?: { from: string; to: string };
  counts: {
    total_hits: number;
    returned_hits: number;
    affected_hosts: number;
    affected_users: number;
  };
  hits: HuntForThreatHit[];
  affected_assets: { hosts: AffectedAsset[]; users: AffectedAsset[] };
  per_index: Array<{ index: string; hit_count: number }>;
  message?: string;
  next_step: string;
}

const DEFAULT_LOOKBACK_DAYS = 30;

const termClause = (field: string, value: string): Record<string, unknown> => ({
  term: { [field]: value },
});

/**
 * Build the per-IOC `should` clause. Each IOC value is searched across the
 * ECS fields where it might reasonably appear in event/alert data — we do
 * not narrow by event source because the same IOC type can land in several
 * different ECS slots depending on which integration produced the document.
 */
const buildIocShould = (iocs: HuntIoc[]): Array<Record<string, unknown>> => {
  const clauses: Array<Record<string, unknown>> = [];
  for (const { type, value } of iocs) {
    switch (type) {
      case 'ip':
        clauses.push(
          termClause('source.ip', value),
          termClause('destination.ip', value),
          termClause('host.ip', value),
          termClause('client.ip', value),
          termClause('server.ip', value)
        );
        break;
      case 'domain':
        clauses.push(
          termClause('dns.question.name', value),
          termClause('destination.domain', value),
          termClause('url.domain', value)
        );
        break;
      case 'url':
        clauses.push(termClause('url.full', value), termClause('url.original', value));
        break;
      case 'hash': {
        const hashLen = value.length;
        const field =
          hashLen === 32
            ? 'file.hash.md5'
            : hashLen === 40
            ? 'file.hash.sha1'
            : hashLen === 64
            ? 'file.hash.sha256'
            : null;
        if (field) {
          clauses.push(
            termClause(field, value),
            termClause(field.replace('file.', 'process.'), value),
            termClause(field.replace('file.', 'dll.'), value)
          );
        }
        break;
      }
      default:
        break;
    }
  }
  return clauses;
};

const buildTechniqueShould = (techniques: string[]): Array<Record<string, unknown>> =>
  techniques.length === 0
    ? []
    : [{ terms: { 'kibana.alert.rule.threat.technique.id': techniques } }];

export const huntForThreat = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  params: HuntForThreatParams
): Promise<HuntForThreatResult> => {
  const {
    report_id: reportId,
    iocs: explicitIocs,
    techniques: explicitTechniques,
    time_range: timeRange,
    size = 25,
    max_assets: maxAssets = 50,
    spaceId,
  } = params;

  let resolvedIocs: HuntIoc[] = explicitIocs ?? [];
  let resolvedTechniques: string[] = explicitTechniques ?? [];

  if (reportId && (resolvedIocs.length === 0 || resolvedTechniques.length === 0)) {
    try {
      const reportResponse = await esClient.search({
        index: THREAT_REPORTS_INDEX_PATTERN,
        size: 1,
        query: {
          bool: { filter: [buildSpaceFilterTerms(spaceId), { ids: { values: [reportId] } }] },
        },
        _source: ['extracted.iocs', 'extracted.ttps.techniques', 'extracted.behaviors'],
      });
      const reportSource = reportResponse.hits.hits[0]?._source as
        | {
            extracted?: {
              iocs?: HuntIoc[];
              ttps?: { techniques?: string[] };
              behaviors?: Array<{ technique_id?: string }>;
            };
          }
        | undefined;

      if (resolvedIocs.length === 0 && reportSource?.extracted?.iocs) {
        resolvedIocs = reportSource.extracted.iocs;
      }
      if (resolvedTechniques.length === 0) {
        const ttpTechniques = reportSource?.extracted?.ttps?.techniques ?? [];
        const behaviorTechniques = (reportSource?.extracted?.behaviors ?? [])
          .map((b) => b.technique_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        resolvedTechniques = Array.from(new Set([...ttpTechniques, ...behaviorTechniques]));
      }
    } catch (err) {
      logger.warn(`hunt_for_threat report lookup failed: ${(err as Error).message}`);
    }
  }

  const emptyResult = (
    status: HuntForThreatStatus,
    message: string,
    nextStep: string
  ): HuntForThreatResult => ({
    status,
    report_id: reportId,
    searched_iocs: resolvedIocs.length,
    searched_techniques: resolvedTechniques.length,
    resolved_iocs: resolvedIocs,
    resolved_techniques: resolvedTechniques,
    counts: { total_hits: 0, returned_hits: 0, affected_hosts: 0, affected_users: 0 },
    hits: [],
    affected_assets: { hosts: [], users: [] },
    per_index: [],
    message,
    next_step: nextStep,
  });

  if (resolvedIocs.length === 0 && resolvedTechniques.length === 0) {
    return emptyResult(
      'no_searchable_input',
      'No IOCs or ATT&CK technique IDs to hunt against. Pass `iocs[]` or `techniques[]` ' +
        'explicitly, or pass a `report_id` whose extraction has already run ' +
        '(extracted.iocs / extracted.ttps.techniques).',
      'Re-run with explicit IOCs / techniques or a report whose extraction has completed.'
    );
  }

  const iocShould = buildIocShould(resolvedIocs);
  const techniqueShould = buildTechniqueShould(resolvedTechniques);
  const should = [...iocShould, ...techniqueShould];

  if (should.length === 0) {
    return emptyResult(
      'no_searchable_terms',
      'IOCs were present but none mapped to a known ECS field (e.g. hashes with ' +
        'non-standard lengths). Re-extract or pass a normalized set and retry.',
      'Re-extract IOCs to canonical lengths/encodings and retry.'
    );
  }

  const from =
    timeRange?.from ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const to = timeRange?.to ?? new Date().toISOString();

  const response = await esClient.search({
    index: [...HUNT_FOR_THREAT_INDEX_PATTERNS],
    ignore_unavailable: true,
    allow_no_indices: true,
    size,
    track_total_hits: true,
    sort: [{ '@timestamp': { order: 'desc' } }],
    _source: [
      '@timestamp',
      'event.dataset',
      'event.module',
      'host.name',
      'host.os.family',
      'user.name',
      'source.ip',
      'destination.ip',
      'url.full',
      'kibana.alert.rule.name',
      'kibana.alert.rule.threat.technique',
    ],
    query: {
      bool: {
        filter: [{ range: { '@timestamp': { gte: from, lte: to } } }],
        should,
        minimum_should_match: 1,
      },
    },
    aggs: {
      per_index: {
        terms: { field: '_index', size: HUNT_FOR_THREAT_INDEX_PATTERNS.length * 4 },
      },
      affected_hosts: {
        terms: { field: 'host.name', size: maxAssets },
      },
      affected_users: {
        terms: { field: 'user.name', size: maxAssets },
      },
    },
  });

  interface HuntAggregations {
    per_index?: { buckets: Array<{ key: string; doc_count: number }> };
    affected_hosts?: { buckets: Array<{ key: string; doc_count: number }> };
    affected_users?: { buckets: Array<{ key: string; doc_count: number }> };
  }
  const aggs = response.aggregations as HuntAggregations | undefined;

  const total =
    typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value ?? 0;
  const hits = (response.hits.hits ?? []).map(
    (hit): HuntForThreatHit => ({
      index: hit._index,
      id: hit._id ?? '',
      score: hit._score ?? null,
      ...(hit._source as Record<string, unknown>),
    })
  );

  const hosts = (aggs?.affected_hosts?.buckets ?? []).map((b) => ({
    name: b.key,
    hit_count: b.doc_count,
  }));
  const users = (aggs?.affected_users?.buckets ?? []).map((b) => ({
    name: b.key,
    hit_count: b.doc_count,
  }));
  const perIndex = (aggs?.per_index?.buckets ?? []).map((b) => ({
    index: b.key,
    hit_count: b.doc_count,
  }));

  return {
    status: total === 0 ? 'no_environment_hits' : 'environment_hits_found',
    report_id: reportId,
    searched_iocs: resolvedIocs.length,
    searched_techniques: resolvedTechniques.length,
    resolved_iocs: resolvedIocs,
    resolved_techniques: resolvedTechniques,
    time_range: { from, to },
    counts: {
      total_hits: total,
      returned_hits: hits.length,
      affected_hosts: hosts.length,
      affected_users: users.length,
    },
    hits,
    affected_assets: { hosts, users },
    per_index: perIndex,
    next_step:
      total === 0
        ? 'No environment matches in the searched time range. Consider widening the ' +
          'window via `time_range`, or pivot to `threat_intel.hunt_behavior` to propose ' +
          'durable rules for future detections.'
        : 'Render the affected_assets block as a short prose summary and, if helpful, ' +
          'open a Case via the `cases` registry tool with the report_id + top assets ' +
          'for tracking.',
  };
};
