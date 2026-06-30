/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { THREAT_REPORTS_INDEX_PATTERN } from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from '../lib/space_filter';
import { IOC_NOISE_DOMAINS } from '../data/ioc_noise_domains';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnchorIoc {
  type: string;
  value: string;
}

export interface AnchorSet {
  iocs?: AnchorIoc[];
  ioc_set_hash?: string | null;
  actors?: string[];
  technique_ids?: string[];
}

export interface SearchByAnchorsParams {
  /** Explicit anchor set. Mutually exclusive with source_report_id. */
  anchors?: AnchorSet;
  /**
   * Source report _id. Service fetches the stored `extracted.*` anchor fields
   * and uses them as the search input. Mutually exclusive with anchors.
   * The source report is excluded from the result set.
   */
  source_report_id?: string;
  /** Maximum hits to return. Default 20, cap 50. */
  size?: number;
}

export interface AnchorMatchBreakdown {
  /** Hash IOC values (sha256/md5/sha1) shared with this report. */
  ioc_hash_hits: string[];
  /** Network IOC values (ip/domain/url) shared with this report — boost signal only. */
  ioc_network_hits: string[];
  /** True when the report's ioc_set_hash is an exact match for the anchor set's hash. */
  ioc_set_hash_match: boolean;
  /** Threat actor names shared with this report. */
  actor_hits: string[];
  /** MITRE technique IDs shared with this report — boost signal only. */
  technique_hits: string[];
  /**
   * Number of distinct discriminating signals that fired:
   * hash ioc match (1) + ioc_set_hash match (1) + actor match (1).
   * Always ≥1 for any returned hit (enforced by the filter gate).
   */
  discriminating_match_count: number;
}

export interface AnchorHit {
  report_id: string;
  score: number | null;
  title: string;
  severity: string;
  source_type: string;
  extracted_at: string;
  match_breakdown: AnchorMatchBreakdown;
}

export interface SearchByAnchorsResult {
  hits: AnchorHit[];
  total: number;
  anchor_summary: {
    hash_ioc_count: number;
    network_ioc_count: number;
    ioc_set_hash: string | null;
    actor_count: number;
    technique_count: number;
    /** Number of discriminating anchor types present (hash/ioc_set_hash/actor). */
    discriminating_anchor_count: number;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const HASH_IOC_TYPE = 'hash' as const;
const NETWORK_IOC_TYPES = new Set(['ip', 'domain', 'url']);
const DEFAULT_SIZE = 20;
const MAX_SIZE = 50;

/**
 * Splits IOC anchors into hash (discriminating) and network (boost-only) buckets.
 * Network IOC values that appear in the noise-domain denylist are dropped — they
 * are security-tooling / vendor / reference domains and would produce false
 * "related" matches between unrelated reports.
 */
const splitIocs = (iocs: AnchorIoc[]): { hashValues: string[]; networkValues: string[] } => {
  const hashValues = new Set<string>();
  const networkValues = new Set<string>();

  for (const { type, value } of iocs) {
    if (!value) {
      // skip — empty value cannot be an anchor
    } else if (type === HASH_IOC_TYPE) {
      hashValues.add(value.toLowerCase());
    } else if (NETWORK_IOC_TYPES.has(type)) {
      const lower = value.toLowerCase();
      if (!IOC_NOISE_DOMAINS.has(lower)) {
        networkValues.add(lower);
      }
    }
  }

  return { hashValues: [...hashValues], networkValues: [...networkValues] };
};

interface StoredReportSource {
  '@timestamp'?: string;
  content?: { title?: string };
  source?: { type?: string };
  severity?: { level?: string };
  provenance?: { extracted_at?: string };
  extracted?: {
    iocs?: Array<{ type?: string; value?: string }>;
    ioc_set_hash?: string;
    threat_actors?: string[];
    ttps?: { techniques?: string[] };
  };
}

const SOURCE_FIELDS = [
  '@timestamp',
  'content.title',
  'source.type',
  'severity.level',
  'provenance.extracted_at',
  'extracted.iocs',
  'extracted.ioc_set_hash',
  'extracted.threat_actors',
  'extracted.ttps.techniques',
] as const;

/**
 * Fetches anchor fields from a stored report.
 * Returns null when the report is not found.
 *
 * Uses esClient.search (term query on _id) rather than esClient.get because the
 * index target is a data stream pattern (.kibana-threat-reports*) and ES rejects
 * wildcard expressions on the GET-by-id action.
 */
const fetchSourceAnchors = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  sourceReportId: string
): Promise<AnchorSet | null> => {
  const response = await esClient.search<StoredReportSource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: 1,
    query: {
      bool: { filter: [buildSpaceFilterTerms(spaceId), { term: { _id: sourceReportId } }] },
    },
    _source: [...SOURCE_FIELDS],
  });

  const hit = response.hits.hits[0];
  if (!hit?._source) return null;

  const { extracted } = hit._source;
  return {
    iocs: (extracted?.iocs ?? []).filter(
      (ioc): ioc is { type: string; value: string } => !!ioc.type && !!ioc.value
    ),
    ioc_set_hash: extracted?.ioc_set_hash ?? null,
    actors: extracted?.threat_actors ?? [],
    technique_ids: extracted?.ttps?.techniques ?? [],
  };
};

/**
 * Computes the per-anchor match breakdown for a single hit by testing the
 * hit's stored anchor fields against the caller's anchor set.
 */
const buildMatchBreakdown = (
  source: StoredReportSource | undefined,
  hashValues: string[],
  networkValues: string[],
  iocSetHash: string | null,
  actors: string[],
  techniqueIds: string[]
): AnchorMatchBreakdown => {
  const storedIocs = source?.extracted?.iocs ?? [];
  const storedActors = source?.extracted?.threat_actors ?? [];
  const storedTechniques = source?.extracted?.ttps?.techniques ?? [];
  const storedIocSetHash = source?.extracted?.ioc_set_hash;

  const hashSet = new Set(hashValues);
  const networkSet = new Set(networkValues);
  const actorSet = new Set(actors);
  const techniqueSet = new Set(techniqueIds);

  const iocHashHits = [
    ...new Set(
      storedIocs
        .filter(
          (ioc): ioc is { type: string; value: string } =>
            ioc.type === HASH_IOC_TYPE &&
            typeof ioc.value === 'string' &&
            hashSet.has(ioc.value.toLowerCase())
        )
        .map((ioc) => ioc.value)
    ),
  ];

  const iocNetworkHits = [
    ...new Set(
      storedIocs
        .filter(
          (ioc): ioc is { type: string; value: string } =>
            typeof ioc.type === 'string' &&
            NETWORK_IOC_TYPES.has(ioc.type) &&
            typeof ioc.value === 'string' &&
            networkSet.has(ioc.value.toLowerCase())
        )
        .map((ioc) => ioc.value)
    ),
  ];

  const iocSetHashMatch = !!(iocSetHash && storedIocSetHash === iocSetHash);
  const actorHits = storedActors.filter((a) => actorSet.has(a));
  const techniqueHits = storedTechniques.filter((t) => techniqueSet.has(t));

  const discriminatingMatchCount =
    (iocHashHits.length > 0 ? 1 : 0) + (iocSetHashMatch ? 1 : 0) + (actorHits.length > 0 ? 1 : 0);

  return {
    ioc_hash_hits: iocHashHits,
    ioc_network_hits: iocNetworkHits,
    ioc_set_hash_match: iocSetHashMatch,
    actor_hits: actorHits,
    technique_hits: techniqueHits,
    discriminating_match_count: discriminatingMatchCount,
  };
};

const mapHit = (
  hit: { _id: string; _score?: number | null; _source?: StoredReportSource },
  hashValues: string[],
  networkValues: string[],
  iocSetHash: string | null,
  actors: string[],
  techniqueIds: string[]
): AnchorHit => {
  const source = hit._source;
  return {
    report_id: hit._id,
    score: hit._score ?? null,
    title: source?.content?.title?.trim() ?? hit._id,
    severity: source?.severity?.level ?? 'unknown',
    source_type: source?.source?.type ?? 'unknown',
    extracted_at: source?.provenance?.extracted_at ?? source?.['@timestamp'] ?? '',
    match_breakdown: buildMatchBreakdown(
      source,
      hashValues,
      networkValues,
      iocSetHash,
      actors,
      techniqueIds
    ),
  };
};

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

/**
 * Builds a nested IOC value query scoped to a specific IOC type or type set.
 * Uses constant_score so the boost is applied uniformly regardless of term
 * frequency — consistent scoring across reports of different sizes.
 */
const nestedIocConstantScore = (
  types: string | string[],
  values: string[],
  boost: number
): Record<string, unknown> => ({
  constant_score: {
    filter: {
      nested: {
        path: 'extracted.iocs',
        query: {
          bool: {
            must: [
              Array.isArray(types)
                ? { terms: { 'extracted.iocs.type': types } }
                : { term: { 'extracted.iocs.type': types } },
              { terms: { 'extracted.iocs.value': values } },
            ],
          },
        },
      },
    },
    boost,
  },
});

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Exact-anchor correlation search against the threat-reports data stream.
 *
 * Discriminating gate (filter — ≥1 required for a hit to qualify):
 *   - shared file-hash IOC value (ioc.type === 'hash')
 *   - exact ioc_set_hash match (infrastructure fingerprint)
 *   - shared threat actor name
 *
 * Boost-only (should — never alone-qualifying):
 *   - shared network IOC (ip/domain/url), noise-domain filtered
 *   - shared MITRE technique ID
 *
 * A lone shared domain, IP, or technique cannot make two reports "related" —
 * at least one hash/ioc_set_hash/actor anchor must fire.
 *
 * Returns a `match_breakdown` per hit so the caller can explain WHY two
 * reports correlated.
 */
export const searchByAnchors = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  spaceId: string,
  params: SearchByAnchorsParams
): Promise<SearchByAnchorsResult> => {
  const { source_report_id: sourceReportId } = params;
  const size = Math.min(params.size ?? DEFAULT_SIZE, MAX_SIZE);

  let anchors = params.anchors;

  if (sourceReportId && !anchors) {
    const fetched = await fetchSourceAnchors(esClient, spaceId, sourceReportId);
    if (!fetched) {
      logger.warn(`search_by_anchors: source report "${sourceReportId}" not found`);
      return emptyResult(null, 0, 0, 0, 0);
    }
    anchors = fetched;
  }

  const {
    iocs = [],
    ioc_set_hash: iocSetHash = null,
    actors = [],
    technique_ids: techniqueIds = [],
  } = anchors ?? {};

  const { hashValues, networkValues } = splitIocs(iocs);
  const cleanActors = actors.filter(Boolean);
  const cleanTechniques = techniqueIds.filter(Boolean);

  const anchorSummary = {
    hash_ioc_count: hashValues.length,
    network_ioc_count: networkValues.length,
    ioc_set_hash: iocSetHash ?? null,
    actor_count: cleanActors.length,
    technique_count: cleanTechniques.length,
    discriminating_anchor_count:
      (hashValues.length > 0 ? 1 : 0) + (iocSetHash ? 1 : 0) + (cleanActors.length > 0 ? 1 : 0),
  };

  if (anchorSummary.discriminating_anchor_count === 0) {
    logger.debug(
      `search_by_anchors: no discriminating anchors (hash/ioc_set_hash/actor) in space="${spaceId}"; skipping query`
    );
    return { hits: [], total: 0, anchor_summary: anchorSummary };
  }

  // Discriminating filter gate — ≥1 clause must match.
  const gateDisc: Array<Record<string, unknown>> = [];
  if (hashValues.length > 0) {
    gateDisc.push({
      nested: {
        path: 'extracted.iocs',
        query: {
          bool: {
            must: [
              { term: { 'extracted.iocs.type': HASH_IOC_TYPE } },
              { terms: { 'extracted.iocs.value': hashValues } },
            ],
          },
        },
      },
    });
  }
  if (iocSetHash) {
    gateDisc.push({ term: { 'extracted.ioc_set_hash': iocSetHash } });
  }
  if (cleanActors.length > 0) {
    gateDisc.push({ terms: { 'extracted.threat_actors': cleanActors } });
  }

  // Scoring should-clauses with explicit boosts via constant_score.
  //   ioc_set_hash = 5 (identical infrastructure clone — highest signal)
  //   hash ioc     = 4 (specific artefact match)
  //   actor        = 3 (named adversary overlap)
  //   network ioc  = 1.5 (infrastructure overlap, boost-only)
  //   technique    = 1.0 (TTP overlap, boost-only)
  const shouldClauses: Array<Record<string, unknown>> = [];

  if (hashValues.length > 0) {
    shouldClauses.push(nestedIocConstantScore(HASH_IOC_TYPE, hashValues, 4.0));
  }
  if (iocSetHash) {
    shouldClauses.push({
      constant_score: { filter: { term: { 'extracted.ioc_set_hash': iocSetHash } }, boost: 5.0 },
    });
  }
  if (cleanActors.length > 0) {
    shouldClauses.push({
      constant_score: { filter: { terms: { 'extracted.threat_actors': cleanActors } }, boost: 3.0 },
    });
  }
  if (networkValues.length > 0) {
    shouldClauses.push(nestedIocConstantScore([...NETWORK_IOC_TYPES], networkValues, 1.5));
  }
  if (cleanTechniques.length > 0) {
    shouldClauses.push({
      constant_score: {
        filter: { terms: { 'extracted.ttps.techniques': cleanTechniques } },
        boost: 1.0,
      },
    });
  }

  const filterClauses: Array<Record<string, unknown>> = [
    buildSpaceFilterTerms(spaceId),
    { bool: { should: gateDisc, minimum_should_match: 1 } },
  ];

  const mustNotClauses: Array<Record<string, unknown>> = [];
  if (sourceReportId) {
    mustNotClauses.push({ term: { _id: sourceReportId } });
  }

  const response = await esClient.search({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size,
    track_total_hits: true,
    _source: [...SOURCE_FIELDS],
    ignore_unavailable: true,
    query: {
      bool: {
        filter: filterClauses,
        should: shouldClauses,
        minimum_should_match: 0,
        ...(mustNotClauses.length > 0 ? { must_not: mustNotClauses } : {}),
      },
    },
    sort: [{ _score: { order: 'desc' } }, { 'severity.score': { order: 'desc', missing: 0 } }],
  } as Parameters<typeof esClient.search>[0]);

  const hits = (response.hits.hits ?? []).map((hit) =>
    mapHit(
      hit as { _id: string; _score?: number | null; _source?: StoredReportSource },
      hashValues,
      networkValues,
      iocSetHash ?? null,
      cleanActors,
      cleanTechniques
    )
  );

  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? hits.length;

  logger.debug(
    `search_by_anchors: ${hits.length} hits (total=${total}) in space="${spaceId}" ` +
      `discriminating_count=${anchorSummary.discriminating_anchor_count}`
  );

  return { hits, total, anchor_summary: anchorSummary };
};

const emptyResult = (
  iocSetHash: string | null,
  hashCount: number,
  networkCount: number,
  actorCount: number,
  techniqueCount: number
): SearchByAnchorsResult => ({
  hits: [],
  total: 0,
  anchor_summary: {
    hash_ioc_count: hashCount,
    network_ioc_count: networkCount,
    ioc_set_hash: iocSetHash,
    actor_count: actorCount,
    technique_count: techniqueCount,
    discriminating_anchor_count: 0,
  },
});
