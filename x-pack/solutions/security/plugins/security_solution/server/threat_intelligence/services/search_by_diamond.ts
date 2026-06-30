/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  THREAT_REPORTS_INDEX_PATTERN,
  KNN_STRONG_FLOOR,
  KNN_MID_FLOOR,
  KNN_BASE_FLOOR,
} from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from '../lib/space_filter';

// Re-export under the short names used throughout this file and its callers.
export const STRONG_FLOOR = KNN_STRONG_FLOOR;
export const MID_FLOOR = KNN_MID_FLOOR;
export const BASE_FLOOR = KNN_BASE_FLOOR;

// low cutoff to drop vector-noise tail; NOT a precision gate — triage does precision.
// Replaces the tiered qualify floors per mustard.py run_knn.
const NOISE_FLOOR = 0.7;

// Number of top-K candidates fetched per vertex query. Kept generous so the
// client-side reducer has a wide pool to qualify against.
const KNN_CANDIDATES_PER_VERTEX = 50;
const DEFAULT_SIZE = 20;
const MAX_SIZE = 50;

export const DIAMOND_VERTICES = ['adversary', 'capability', 'infrastructure', 'victim'] as const;
export type DiamondVertex = (typeof DIAMOND_VERTICES)[number];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DiamondVertexQueries {
  adversary?: string;
  capability?: string;
  infrastructure?: string;
  victim?: string;
}

export interface SearchByDiamondParams {
  /** Free-text query per vertex. Mutually exclusive with source_report_id. */
  vertex_queries?: DiamondVertexQueries;
  /**
   * Source report _id. Service fetches the report's extracted.diamond.{vertex}.summary
   * values (only for vertices whose signal != NONE) and uses them as the per-vertex
   * queries. Mutually exclusive with vertex_queries. The source report is excluded
   * from the result set.
   */
  source_report_id?: string;
  /** Maximum hits to return. Default 20, cap 50. */
  size?: number;
}

export interface DiamondVertexScore {
  adversary?: number;
  capability?: number;
  infrastructure?: number;
  victim?: number;
}

export interface DiamondHit {
  report_id: string;
  /**
   * Headline score = max per-vertex score among above-BASE-floor vertices.
   * Ties in this score are broken by the `overlap` count. Both fields are
   * returned so callers can render the same `[overlap] ADV CAP INF VIC` table
   * Mustard's compact_output displays.
   */
  score: number;
  /**
   * Count of queried vertices where this candidate scored >= NOISE_FLOOR.
   * Mirrors Mustard's `overlap = len(data["scores"])`. Vertices the source
   * didn't have (never queried) are neutral — not counted against the candidate.
   */
  overlap: number;
  title: string;
  severity: string;
  source_type: string;
  extracted_at: string;
  /**
   * Raw per-vertex similarity scores for every vertex where the candidate
   * appeared in the top-K results. Includes below-BASE-floor scores so the
   * caller can see the full picture. Vertices absent from the result set are
   * not represented (absence ≠ zero).
   */
  vertex_scores: DiamondVertexScore;
  /** Vertices that scored >= NOISE_FLOOR (the overlap set). */
  above_floor_vertices: DiamondVertex[];
}

export interface SearchByDiamondResult {
  hits: DiamondHit[];
  /** Total qualified candidates before the size cap. */
  total: number;
  /** True when the inference endpoint was unavailable and BM25 fallback was used. */
  degraded: boolean;
  query_summary: {
    vertices_queried: DiamondVertex[];
    strong_floor: number;
    mid_floor: number;
    base_floor: number;
  };
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface StoredHitSource {
  '@timestamp'?: string;
  content?: { title?: string };
  source?: { type?: string };
  severity?: { level?: string };
  provenance?: { extracted_at?: string };
}

interface StoredDiamondSource extends StoredHitSource {
  extracted?: {
    diamond?: {
      adversary?: { summary?: string; signal?: string };
      capability?: { summary?: string; signal?: string };
      infrastructure?: { summary?: string; signal?: string };
      victim?: { summary?: string; signal?: string };
    };
  };
}

interface MsearchHit {
  _id: string;
  _score?: number | null;
  _source?: StoredHitSource;
}

const SOURCE_FIELDS = [
  '@timestamp',
  'content.title',
  'source.type',
  'severity.level',
  'provenance.extracted_at',
] as const;

// BM25 mirror fields — match search_reports pattern.
const BM25_QUERY_FIELDS = ['content.title_bm25^2', 'content.body_text_bm25'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the vertex summaries of a stored report and returns them as the
 * per-vertex query input for source-report mode. Only vertices with a non-NONE
 * signal and a non-empty summary are returned — mirrors run_knn's guard in
 * mustard.py (`signal != "NONE" and summary != ""`).
 *
 * Uses esClient.search (term query on _id) rather than esClient.get because the
 * index target is a data stream pattern (.kibana-threat-reports*) and ES rejects
 * wildcard expressions on the GET-by-id action.
 */
const fetchSourceVertexQueries = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  sourceReportId: string
): Promise<DiamondVertexQueries | null> => {
  const response = await esClient.search<StoredDiamondSource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: 1,
    query: {
      bool: { filter: [buildSpaceFilterTerms(spaceId), { term: { _id: sourceReportId } }] },
    },
    _source: [
      'extracted.diamond.adversary.summary',
      'extracted.diamond.adversary.signal',
      'extracted.diamond.capability.summary',
      'extracted.diamond.capability.signal',
      'extracted.diamond.infrastructure.summary',
      'extracted.diamond.infrastructure.signal',
      'extracted.diamond.victim.summary',
      'extracted.diamond.victim.signal',
    ],
  });

  const hit = response.hits.hits[0];
  if (!hit?._source) return null;

  const diamond = hit._source.extracted?.diamond ?? {};
  const queries: DiamondVertexQueries = {};
  for (const v of DIAMOND_VERTICES) {
    const vd = diamond[v];
    if (vd?.signal && vd.signal !== 'NONE' && vd.summary?.trim()) {
      queries[v] = vd.summary.trim();
    }
  }
  return queries;
};

const qualifiesForReturn = (presentScores: number[]): boolean =>
  presentScores.some((s) => s >= NOISE_FLOOR);

/**
 * Determines whether an error indicates the inference endpoint is unavailable,
 * so the caller can degrade to BM25 rather than propagating a 500.
 */
const isInferenceUnavailableError = (err: unknown): boolean => {
  const msg = String((err as Error)?.message ?? '').toLowerCase();
  return (
    msg.includes('inference') ||
    msg.includes('service_unavailable') ||
    msg.includes('503') ||
    (err as { statusCode?: number })?.statusCode === 503
  );
};

/**
 * Resolves the per-vertex query text from either the explicit caller input or
 * the stored diamond summaries of the source report. Returns null if the source
 * report is not found; returns an empty object if the source has no usable vertices
 * (the caller will see this as zero queried_vertices and an early empty return).
 */
const resolveVertexQueries = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  spaceId: string,
  params: Pick<SearchByDiamondParams, 'vertex_queries' | 'source_report_id'>
): Promise<DiamondVertexQueries | null> => {
  if (params.vertex_queries) return params.vertex_queries;
  if (!params.source_report_id) return null;
  const fetched = await fetchSourceVertexQueries(esClient, spaceId, params.source_report_id);
  if (!fetched) {
    logger.warn(`search_by_diamond: source report "${params.source_report_id}" not found`);
  }
  return fetched;
};

const emptyResult = (verticesQueried: DiamondVertex[]): SearchByDiamondResult => ({
  hits: [],
  total: 0,
  degraded: false,
  query_summary: {
    vertices_queried: verticesQueried,
    strong_floor: STRONG_FLOOR,
    mid_floor: MID_FLOOR,
    base_floor: BASE_FLOOR,
  },
});

// ---------------------------------------------------------------------------
// Semantic msearch path
// ---------------------------------------------------------------------------

const runSemanticSearch = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  spaceId: string,
  sourceReportId: string | undefined,
  queriedVertices: DiamondVertex[],
  vertexQueries: DiamondVertexQueries,
  size: number
): Promise<SearchByDiamondResult> => {
  const filterClauses: Array<Record<string, unknown>> = [
    buildSpaceFilterTerms(spaceId),
    { term: { 'extracted.diamond.suitable': true } },
  ];
  const mustNotClauses: Array<Record<string, unknown>> = sourceReportId
    ? [{ term: { _id: sourceReportId } }]
    : [];

  // One header+body pair per queried vertex — single msearch round trip.
  const searches: Array<Record<string, unknown>> = [];
  for (const vertex of queriedVertices) {
    searches.push({ index: THREAT_REPORTS_INDEX_PATTERN, ignore_unavailable: true });
    searches.push({
      query: {
        bool: {
          must: [
            {
              semantic: {
                field: `extracted.diamond.${vertex}.summary`,
                query: vertexQueries[vertex],
              },
            },
          ],
          filter: filterClauses,
          ...(mustNotClauses.length > 0 ? { must_not: mustNotClauses } : {}),
        },
      },
      size: KNN_CANDIDATES_PER_VERTEX,
      _source: [...SOURCE_FIELDS],
    });
  }

  type ScoreMatrix = Map<
    string,
    { source: StoredHitSource; scores: Partial<Record<DiamondVertex, number>> }
  >;

  // Executes the msearch and builds the score matrix from the responses.
  // Inference-unavailable errors are thrown so the caller's try/catch can degrade to BM25.
  const runMsearchAndBuildMatrix = async (): Promise<ScoreMatrix> => {
    const msearchResponse = await esClient.msearch({ searches } as Parameters<
      typeof esClient.msearch
    >[0]);

    const matrix: ScoreMatrix = new Map();

    for (let i = 0; i < queriedVertices.length; i++) {
      const vertex = queriedVertices[i];
      const resp = msearchResponse.responses[i];

      if ('error' in resp) {
        const errMsg = JSON.stringify(resp.error).toLowerCase();
        if (errMsg.includes('inference') || errMsg.includes('service_unavailable')) {
          throw new Error(`inference_unavailable: ${JSON.stringify(resp.error)}`);
        }
        logger.warn(
          `search_by_diamond: vertex="${vertex}" sub-query error: ${JSON.stringify(resp.error)}`
        );
      } else {
        const hits = (resp.hits?.hits ?? []) as MsearchHit[];
        for (const hit of hits) {
          const id = hit._id;
          if (!matrix.has(id)) {
            matrix.set(id, { source: hit._source ?? {}, scores: {} });
          }
          const entry = matrix.get(id);
          if (entry) {
            entry.scores[vertex] = hit._score ?? 0;
          }
        }
      }
    }
    return matrix;
  };

  // Build score matrix: reportId → { source, scores: { vertex → score } }
  let scoreMatrix = await runMsearchAndBuildMatrix();

  // Cold-start guard: if the inference endpoint just started it may return 0 hits
  // for all vertices on the first request. Retry once — a second call typically
  // succeeds once the endpoint is warm. An empty result after the retry is accepted
  // as-is (the source report may genuinely have no near-neighbours).
  if (scoreMatrix.size === 0) {
    logger.debug(
      `search_by_diamond: all vertices returned 0 hits (possible cold endpoint), retrying once in space="${spaceId}"`
    );
    scoreMatrix = await runMsearchAndBuildMatrix();
  }

  // Qualify, annotate, and rank candidates.
  const candidates: DiamondHit[] = [];

  for (const [reportId, { source, scores }] of scoreMatrix) {
    // Collect scores for vertices where the candidate appeared — absent = neutral, not zero.
    const presentScores: number[] = DIAMOND_VERTICES.map((v) => scores[v]).filter(
      (s): s is number => s !== undefined
    );

    if (qualifiesForReturn(presentScores)) {
      const aboveFloorVertices: DiamondVertex[] = [];
      const aboveFloorScores: number[] = [];
      for (const v of DIAMOND_VERTICES) {
        const s = scores[v];
        if (s !== undefined && s >= NOISE_FLOOR) {
          aboveFloorVertices.push(v);
          aboveFloorScores.push(s);
        }
      }

      const overlap = aboveFloorVertices.length;
      // Headline score = max above-NOISE-floor score; ties broken by overlap in sort.
      const maxScore = aboveFloorScores.length > 0 ? Math.max(...aboveFloorScores) : 0;

      const vertexScores: DiamondVertexScore = {};
      for (const v of DIAMOND_VERTICES) {
        const s = scores[v];
        if (s !== undefined) {
          vertexScores[v] = s;
        }
      }

      candidates.push({
        report_id: reportId,
        score: maxScore,
        overlap,
        title: source?.content?.title?.trim() ?? reportId,
        severity: source?.severity?.level ?? 'unknown',
        source_type: source?.source?.type ?? 'unknown',
        extracted_at: source?.provenance?.extracted_at ?? source?.['@timestamp'] ?? '',
        vertex_scores: vertexScores,
        above_floor_vertices: aboveFloorVertices,
      });
    }
  }

  // Sort by (overlap desc, max_score desc) — mirrors Mustard's compact_output:
  //   sorted(candidates.items(), key=lambda x: (x[1]["overlap"], max(scores.values(), default=0)), reverse=True)
  candidates.sort((a, b) => (b.overlap !== a.overlap ? b.overlap - a.overlap : b.score - a.score));

  const hits = candidates.slice(0, size);

  logger.debug(
    `search_by_diamond: ${hits.length} hits (pool=${candidates.length}) in space="${spaceId}" ` +
      `queried_vertices=${queriedVertices.join(',')}`
  );

  return {
    hits,
    total: candidates.length,
    degraded: false,
    query_summary: {
      vertices_queried: queriedVertices,
      strong_floor: STRONG_FLOOR,
      mid_floor: MID_FLOOR,
      base_floor: BASE_FLOOR,
    },
  };
};

// ---------------------------------------------------------------------------
// BM25 degradation path
// ---------------------------------------------------------------------------

const runBm25Fallback = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  spaceId: string,
  sourceReportId: string | undefined,
  queriedVertices: DiamondVertex[],
  vertexQueries: DiamondVertexQueries,
  size: number
): Promise<SearchByDiamondResult> => {
  const combinedQuery = queriedVertices
    .map((v) => vertexQueries[v])
    .filter(Boolean)
    .join(' ');

  const filterClauses: Array<Record<string, unknown>> = [
    buildSpaceFilterTerms(spaceId),
    { term: { 'extracted.diamond.suitable': true } },
  ];
  const mustNotClauses: Array<Record<string, unknown>> = sourceReportId
    ? [{ term: { _id: sourceReportId } }]
    : [];

  const response = await esClient.search({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size,
    ignore_unavailable: true,
    track_total_hits: true,
    _source: [...SOURCE_FIELDS],
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query: combinedQuery,
              fields: [...BM25_QUERY_FIELDS],
            },
          },
        ],
        filter: filterClauses,
        ...(mustNotClauses.length > 0 ? { must_not: mustNotClauses } : {}),
      },
    },
  } as Parameters<typeof esClient.search>[0]);

  const hits: DiamondHit[] = (response.hits.hits ?? []).map((hit) => {
    const id = hit._id ?? '';
    const src = hit._source as StoredHitSource | undefined;
    return {
      report_id: id,
      score: hit._score ?? 0,
      overlap: 0,
      title: src?.content?.title?.trim() ?? id,
      severity: src?.severity?.level ?? 'unknown',
      source_type: src?.source?.type ?? 'unknown',
      extracted_at: src?.provenance?.extracted_at ?? src?.['@timestamp'] ?? '',
      vertex_scores: {},
      above_floor_vertices: [] as DiamondVertex[],
    };
  });

  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? hits.length;

  logger.warn(
    `search_by_diamond: BM25 fallback returned ${hits.length} hits in space="${spaceId}"`
  );

  return {
    hits,
    total,
    degraded: true,
    query_summary: {
      vertices_queried: queriedVertices,
      strong_floor: STRONG_FLOOR,
      mid_floor: MID_FLOOR,
      base_floor: BASE_FLOOR,
    },
  };
};

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Semantic Diamond Model correlation search against the threat-reports data stream.
 *
 * Sends one semantic query per queried vertex (msearch, single round trip) over
 * `extracted.diamond.{vertex}.summary` (semantic_text → .jina-embeddings-v5-text-small),
 * scoped to `extracted.diamond.suitable: true`. Fuses results client-side.
 *
 * Qualifier: any vertex score >= NOISE_FLOOR (0.70) qualifies — matches mustard.py
 * run_knn (no tiered gate). Precision is triage's job.
 *
 * Ranking: (overlap, max_score) descending — where overlap = count of queried
 * vertices scoring >= NOISE_FLOOR. Matches Mustard's compact_output sort key.
 * Missing vertices (never queried) are neutral; they are not counted against
 * a candidate's overlap score.
 *
 * Returns a per-vertex score matrix so callers can show WHY two reports correlate
 * ("related via shared capability + infrastructure").
 *
 * Degrades to BM25 multi_match (degraded: true) when the inference endpoint
 * is unavailable, rather than returning an error.
 */
export const searchByDiamond = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  spaceId: string,
  params: SearchByDiamondParams
): Promise<SearchByDiamondResult> => {
  const { source_report_id: sourceReportId } = params;
  const size = Math.min(params.size ?? DEFAULT_SIZE, MAX_SIZE);

  const resolvedQueries = await resolveVertexQueries(esClient, logger, spaceId, params);

  if (!resolvedQueries) {
    return emptyResult([]);
  }

  const queriedVertices = DIAMOND_VERTICES.filter(
    (v) => (resolvedQueries[v] ?? '').trim().length > 0
  );

  if (queriedVertices.length === 0) {
    logger.debug(
      `search_by_diamond: no queried vertices (all NONE or empty) in space="${spaceId}"; skipping`
    );
    return emptyResult([]);
  }

  try {
    return await runSemanticSearch(
      esClient,
      logger,
      spaceId,
      sourceReportId,
      queriedVertices,
      resolvedQueries,
      size
    );
  } catch (err) {
    if (isInferenceUnavailableError(err)) {
      logger.warn(
        `search_by_diamond: inference unavailable, falling back to BM25 in space="${spaceId}"`
      );
      return runBm25Fallback(
        esClient,
        logger,
        spaceId,
        sourceReportId,
        queriedVertices,
        resolvedQueries,
        size
      );
    }
    throw err;
  }
};
