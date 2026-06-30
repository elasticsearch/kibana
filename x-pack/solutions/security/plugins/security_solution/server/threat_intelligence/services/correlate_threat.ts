/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchClient,
  IUiSettingsClient,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { CostTraceBuilder } from '../routes/lib/cost_tracker';
import { buildSpaceFilterTerms } from '../lib/space_filter';
import {
  DIAMOND_CONNECTOR_SETTING_KEY,
  TRIAGE_CONNECTOR_SETTING_KEY,
  SYNTHESIS_CONNECTOR_SETTING_KEY,
  TRIAGE_CONFIDENCE_FLOOR_SETTING_KEY,
  TRIAGE_TOP_N_SETTING_KEY,
  THREAT_REPORTS_INDEX_PATTERN,
} from '../../../common/threat_intelligence/hub';
import { resolveScopedModel } from '../routes/lib/scoped_model';
import type {
  CorrelationFindings,
  CostTrace,
} from '../../../common/threat_intelligence/correlation/schemas';
import type {
  CorrelationDepth,
  CorrelationRunStage,
} from '../../../common/threat_intelligence/correlation_runs';
import { extractIocs } from './extract_iocs';
import { extractDiamond } from './extract_diamond';
import { searchByAnchors } from './search_by_anchors';
import { searchByDiamond } from './search_by_diamond';
import { triageDiamondCandidates } from './triage_diamond_candidates';
import { keywordGapFill } from './keyword_gap_fill';
import { collapseCandidates } from './collapse_candidates';
import { synthesizeCorrelations } from './synthesize_correlations';
import type { AnchorSet, AnchorMatchBreakdown, SearchByAnchorsResult } from './search_by_anchors';
import type { DiamondVertexQueries, SearchByDiamondResult } from './search_by_diamond';
import type { ExtractDiamondResult } from './extract_diamond';
import type {
  QueryDiamond,
  TriageCandidateInput,
  TriagePick,
  TriageGroup,
  TriagedOutCandidate,
} from './triage_diamond_candidates';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export type CorrelateThreatInput =
  | { mode: 'raw_text'; text: string }
  | { mode: 'report_id'; report_id: string };

export interface CorrelateThreatParams {
  esClient: ElasticsearchClient;
  /** Inference plugin start contract — used to resolve ScopedModels internally. */
  inference: InferenceServerStart | undefined;
  /** Kibana request — passed to resolveScopedModel for connector auth. */
  request: KibanaRequest;
  /** UI settings client — used to read per-stage connector overrides and triage tuning. */
  uiSettingsClient: IUiSettingsClient;
  logger: Logger;
  spaceId: string;
  input: CorrelateThreatInput;
  /**
   * Controls how far the pipeline runs before returning.
   * - `extract` — return after diamond extraction (or fetch for report_id mode).
   * - `knn`     — return after anchor + diamond retrieval, before gap-fill.
   * - `triage`  — return after the triage LLM pass.
   * - `full`    — run to completion (§6 synthesis). Default.
   */
  depth?: CorrelationDepth;
  /**
   * Called after each completed pipeline stage so background-run callers can
   * record progress and capture per-stage output without polling.
   * `stageResult` carries that stage's output (JSON-serializable):
   *   extract → { depth:'extract', diamond }
   *   search  → { depth:'knn', anchor_hits, diamond_hits, merged }
   *   triage  → { depth:'triage', picks, groups, triaged_out, candidates_fed, fallback_used }
   *   synthesize → { depth:'full', findings }
   * Other stages (gap_fill, dedup, done) produce no result object.
   * Must not throw; errors are ignored by the orchestrator to preserve the pipeline.
   */
  onStage?: (stage: CorrelationRunStage, stageResult?: unknown) => void | Promise<void>;
}

// Depth-tagged result variants ---

export interface CorrelateThreatExtractResult {
  depth: 'extract';
  diamond: QueryDiamond;
  trace?: CostTrace;
}

export interface CorrelateThreatKnnResult {
  depth: 'knn';
  anchor_hits: SearchByAnchorsResult;
  diamond_hits: SearchByDiamondResult;
  merged: TriageCandidateInput[];
  candidate_meta?: Record<string, { title?: string; vendor?: string; url?: string }>;
  trace?: CostTrace;
}

export interface CorrelateThreatTriageResult {
  depth: 'triage';
  picks: TriagePick[];
  groups: TriageGroup[];
  triaged_out: TriagedOutCandidate[];
  candidates_fed: number;
  fallback_used: boolean;
  candidate_meta?: Record<string, { title?: string; vendor?: string; url?: string }>;
  trace?: CostTrace;
}

export interface CorrelateThreatFullResult {
  depth: 'full';
  findings: CorrelationFindings;
}

export type CorrelateThreatDepthResult =
  | CorrelateThreatExtractResult
  | CorrelateThreatKnnResult
  | CorrelateThreatTriageResult
  | CorrelateThreatFullResult;

/**
 * Triage-complete diagnostic envelope — preserved for testing and
 * future diagnostic endpoints.
 */
export interface CorrelateThreatTriagedResult {
  stage: 'triage_complete';
  picks: TriagePick[];
  /** Hypothesis groups from triage — diagnostic only. */
  groups: TriageGroup[];
  candidates_fed: number;
  fallback_used: boolean;
  anchor_results: SearchByAnchorsResult;
  diamond_results: SearchByDiamondResult;
  /** Candidates added by the keyword gap-fill pass (§3). */
  gap_fill_added: number;
  /** Candidates removed by the deterministic collapse pass (§4). */
  collapsed_count: number;
}

/** Full correlation findings produced by the §6 synthesis pass. */
export type CorrelateThreatResult = CorrelationFindings;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const RETRIEVAL_POOL_SIZE = 50;

const DIAMOND_VERTICES_ORDERED = ['adversary', 'capability', 'infrastructure', 'victim'] as const;

/**
 * Builds the case-context string fed to keyword gap-fill.
 * For raw_text mode the caller supplies the text directly.
 * For report_id mode we concatenate non-NONE diamond vertex summaries so the
 * gap-fill LLM has enough named-entity context without a second ES fetch.
 */
const buildCaseContextFromDiamond = (qd: QueryDiamond): string => {
  const parts: string[] = [];
  for (const v of DIAMOND_VERTICES_ORDERED) {
    const vd = qd[v];
    if (vd.signal !== 'NONE' && vd.summary) {
      parts.push(`[${v.toUpperCase()}]\n${vd.summary}`);
    }
  }
  return parts.join('\n\n');
};

const DIAMOND_VERTICES = ['adversary', 'capability', 'infrastructure', 'victim'] as const;

/** Maps stored uppercase diamond signal values to the output enum. */
const mapDiamondSignal = (signal: string): 'high' | 'partial' | 'none' => {
  if (signal === 'HIGH') return 'high';
  if (signal === 'PARTIAL') return 'partial';
  return 'none';
};

interface CandidateMetaSource {
  content?: { title?: string };
  source?: { name?: string; url?: string };
}

/**
 * Lightweight fetch of display metadata (title, vendor, URL) for a set of
 * candidate doc IDs. Called after synthesis so only IDs that appear in the
 * final output are fetched — avoids over-fetching the full candidate pool.
 */
const fetchCandidateMeta = async (
  esClient: ElasticsearchClient,
  ids: readonly string[]
): Promise<Record<string, { title?: string; vendor?: string; url?: string }>> => {
  if (ids.length === 0) return {};
  const response = await esClient.search<CandidateMetaSource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: ids.length + 5,
    query: { ids: { values: [...ids] } },
    _source: ['content.title', 'source.name', 'source.url'],
    ignore_unavailable: true,
  });
  const result: Record<string, { title?: string; vendor?: string; url?: string }> = {};
  for (const hit of response.hits.hits) {
    if (hit._id) {
      result[hit._id] = {
        title: hit._source?.content?.title,
        vendor: hit._source?.source?.name,
        url: hit._source?.source?.url,
      };
    }
  }
  return result;
};

/**
 * Fetches the full body text of a stored report for use as the synthesis
 * case context in report_id mode. Falls back to undefined if not found so
 * the orchestrator can substitute the diamond-summary proxy.
 */
const fetchSourceBodyText = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  reportId: string
): Promise<string | undefined> => {
  const response = await esClient.search<{ content?: { body_text?: string } }>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: 1,
    query: {
      bool: { filter: [buildSpaceFilterTerms(spaceId), { term: { _id: reportId } }] },
    },
    _source: ['content.body_text'],
  });
  return response.hits.hits[0]?._source?.content?.body_text ?? undefined;
};

interface StoredQueryDiamondSource {
  extracted?: {
    diamond?: {
      adversary?: { signal?: string; summary?: string };
      capability?: { signal?: string; summary?: string };
      infrastructure?: { signal?: string; summary?: string };
      victim?: { signal?: string; summary?: string };
    };
  };
}

/**
 * Fetches a stored report's diamond (signal + summary per vertex) so the
 * orchestrator has the query case's full diamond for the triage prompt.
 * Returns null when the report is not found.
 */
const fetchQueryDiamond = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  reportId: string
): Promise<QueryDiamond | null> => {
  const response = await esClient.search<StoredQueryDiamondSource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: 1,
    query: {
      bool: { filter: [buildSpaceFilterTerms(spaceId), { term: { _id: reportId } }] },
    },
    _source: [
      'extracted.diamond.adversary.signal',
      'extracted.diamond.adversary.summary',
      'extracted.diamond.capability.signal',
      'extracted.diamond.capability.summary',
      'extracted.diamond.infrastructure.signal',
      'extracted.diamond.infrastructure.summary',
      'extracted.diamond.victim.signal',
      'extracted.diamond.victim.summary',
    ],
  });

  const hit = response.hits.hits[0];
  if (!hit?._source) return null;

  const diamond = hit._source.extracted?.diamond ?? {};
  return {
    adversary: {
      signal: diamond.adversary?.signal ?? 'NONE',
      summary: diamond.adversary?.summary ?? '',
    },
    capability: {
      signal: diamond.capability?.signal ?? 'NONE',
      summary: diamond.capability?.summary ?? '',
    },
    infrastructure: {
      signal: diamond.infrastructure?.signal ?? 'NONE',
      summary: diamond.infrastructure?.summary ?? '',
    },
    victim: { signal: diamond.victim?.signal ?? 'NONE', summary: diamond.victim?.summary ?? '' },
  };
};

/** Convert an ExtractDiamondResult into the QueryDiamond shape for the triage prompt. */
const extractResultToQueryDiamond = (result: ExtractDiamondResult): QueryDiamond => ({
  adversary: { signal: result.adversary.signal, summary: result.adversary.summary },
  capability: { signal: result.capability.signal, summary: result.capability.summary },
  infrastructure: { signal: result.infrastructure.signal, summary: result.infrastructure.summary },
  victim: { signal: result.victim.signal, summary: result.victim.summary },
});

/** Convert an ExtractDiamondResult into per-vertex free-text queries for searchByDiamond. */
const buildVertexQueries = (diamond: ExtractDiamondResult): DiamondVertexQueries => {
  const queries: DiamondVertexQueries = {};
  for (const v of DIAMOND_VERTICES) {
    const vertex = diamond[v];
    if (vertex.signal !== 'NONE' && vertex.summary) {
      queries[v] = vertex.summary;
    }
  }
  return queries;
};

/**
 * Merges anchor hits and diamond hits into a unified candidate list sorted by
 * (overlap DESC, score DESC).
 *
 * Anchor-only candidates (not in diamond results) are appended with overlap=0,
 * score=0, vertex_scores={}. The `match_breakdown` from anchor results is carried
 * on ALL candidates that appeared in the anchor set (including diamond+anchor
 * candidates) so the triage stage can surface shared hashes/actors as strong
 * signals even when a candidate's diamond vertex scores are low or zero.
 */
const buildMergedCandidates = (
  anchorResults: SearchByAnchorsResult,
  diamondResults: SearchByDiamondResult
): TriageCandidateInput[] => {
  // Index anchor breakdowns by report_id first — used for both diamond+anchor
  // and pure anchor-only candidates.
  const anchorBreakdownMap = new Map<string, AnchorMatchBreakdown>();
  for (const hit of anchorResults.hits) {
    anchorBreakdownMap.set(hit.report_id, hit.match_breakdown);
  }

  const candidateMap = new Map<string, TriageCandidateInput>();
  for (const hit of diamondResults.hits) {
    candidateMap.set(hit.report_id, {
      report_id: hit.report_id,
      title: hit.title,
      overlap: hit.overlap,
      score: hit.score,
      vertex_scores: hit.vertex_scores,
      match_breakdown: anchorBreakdownMap.get(hit.report_id),
      retrieval_source: 'diamond',
    });
  }

  for (const hit of anchorResults.hits) {
    if (!candidateMap.has(hit.report_id)) {
      candidateMap.set(hit.report_id, {
        report_id: hit.report_id,
        title: hit.title,
        overlap: 0,
        score: 0,
        vertex_scores: {},
        match_breakdown: hit.match_breakdown,
        retrieval_source: 'anchor',
      });
    }
  }

  return [...candidateMap.values()].sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return b.score - a.score;
  });
};

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Correlation orchestrator — phases 1–6 with optional depth-based early exit.
 *
 * Flow: resolve input → search_by_anchors + search_by_diamond in parallel
 * → merge + dedup candidates → keyword gap-fill (§3) → collapse (§4)
 * → triage (§5) → synthesize_correlations (§6) → CorrelationFindings.
 *
 * Pass `depth` to exit early: 'extract' stops after diamond resolution,
 * 'knn' stops after retrieval, 'triage' stops after the triage LLM call.
 * The default ('full') runs all six phases as before.
 *
 * Pass `onStage` to receive progress notifications after each phase —
 * useful for background-run callers that persist stage to ES.
 */
const readStr = async (
  uiSettingsClient: IUiSettingsClient,
  key: string
): Promise<string | undefined> => {
  try {
    const v = await uiSettingsClient.get<string>(key);
    return v || undefined;
  } catch {
    return undefined;
  }
};

const readNum = async (
  uiSettingsClient: IUiSettingsClient,
  key: string,
  fallback: number
): Promise<number> => {
  try {
    const v = await uiSettingsClient.get<number>(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export const correlateThreat = async ({
  esClient,
  inference,
  request,
  uiSettingsClient,
  logger,
  spaceId,
  input,
  depth = 'full',
  onStage,
}: CorrelateThreatParams): Promise<CorrelateThreatDepthResult> => {
  const traceBuilder = new CostTraceBuilder();

  // ---- Resolve settings and models for the depths that need them ----
  const [diamondConnectorId, triageConnectorId, synthesisConnectorId, triageFloor, triageTopN] =
    await Promise.all([
      readStr(uiSettingsClient, DIAMOND_CONNECTOR_SETTING_KEY),
      readStr(uiSettingsClient, TRIAGE_CONNECTOR_SETTING_KEY),
      readStr(uiSettingsClient, SYNTHESIS_CONNECTOR_SETTING_KEY),
      readNum(uiSettingsClient, TRIAGE_CONFIDENCE_FLOOR_SETTING_KEY, 0.65),
      readNum(uiSettingsClient, TRIAGE_TOP_N_SETTING_KEY, 75),
    ]);

  const extractionOutcome = await resolveScopedModel({
    inference,
    request,
    uiSettingsClient,
    connectorIdOverride: diamondConnectorId,
    logger,
  });
  if (!extractionOutcome.ok && input.mode === 'raw_text') {
    throw new Error(`Extraction model unavailable: ${extractionOutcome.message}`);
  }
  const extractionModel: ScopedModel | undefined = extractionOutcome.ok
    ? extractionOutcome.model
    : undefined;

  const triageModel: ScopedModel | undefined =
    depth === 'triage' || depth === 'full'
      ? await (async () => {
          const triageOutcome = await resolveScopedModel({
            inference,
            request,
            uiSettingsClient,
            connectorIdOverride: triageConnectorId,
            logger,
          });
          if (!triageOutcome.ok) {
            throw new Error(`Triage model unavailable: ${triageOutcome.message}`);
          }
          return triageOutcome.model;
        })()
      : undefined;

  const synthesisModel: ScopedModel | undefined =
    depth === 'full'
      ? await (async () => {
          const synthesisOutcome = await resolveScopedModel({
            inference,
            request,
            uiSettingsClient,
            connectorIdOverride: synthesisConnectorId,
            logger,
          });
          if (!synthesisOutcome.ok) {
            throw new Error(`Synthesis model unavailable: ${synthesisOutcome.message}`);
          }
          return synthesisOutcome.model;
        })()
      : undefined;

  const notifyStage = async (stage: CorrelationRunStage, stageResult?: unknown): Promise<void> => {
    if (!onStage) return;
    try {
      await onStage(stage, stageResult);
    } catch (e) {
      logger.warn(`[ti:correlate] onStage('${stage}') threw — ignoring: ${(e as Error).message}`);
    }
  };

  let anchorResults: SearchByAnchorsResult;
  let diamondResults: SearchByDiamondResult;
  let queryDiamond: QueryDiamond;

  // Notify BEFORE diamond resolution so the label shows during the work, not after.
  await notifyStage('extract');

  if (input.mode === 'report_id') {
    // Fetch the stored diamond first, then do parallel kNN retrieval.
    // Splitting avoids conflating extract+search into one stage from the UI's perspective.
    queryDiamond = (await fetchQueryDiamond(esClient, spaceId, input.report_id)) ?? {
      adversary: { signal: 'NONE', summary: '' },
      capability: { signal: 'NONE', summary: '' },
      infrastructure: { signal: 'NONE', summary: '' },
      victim: { signal: 'NONE', summary: '' },
    };

    await notifyStage('search');

    [anchorResults, diamondResults] = await Promise.all([
      searchByAnchors(esClient, logger, spaceId, {
        source_report_id: input.report_id,
        size: RETRIEVAL_POOL_SIZE,
      }),
      searchByDiamond(esClient, logger, spaceId, {
        source_report_id: input.report_id,
        size: RETRIEVAL_POOL_SIZE,
      }),
    ]);
  } else {
    if (!extractionModel) {
      throw new Error('correlateThreat: raw_text mode requires a resolved extraction ScopedModel');
    }

    const extractedIocs = extractIocs({ text: input.text });
    const diamondResult = await extractDiamond(extractionModel, logger, {
      text: input.text,
      traceBuilder,
    });

    queryDiamond = extractResultToQueryDiamond(diamondResult);
    const vertexQueries = buildVertexQueries(diamondResult);
    const anchors: AnchorSet = {
      iocs: extractedIocs.iocs.map(({ type, value }) => ({ type, value })),
      ioc_set_hash: extractedIocs.ioc_set_hash,
    };

    await notifyStage('search');

    [anchorResults, diamondResults] = await Promise.all([
      searchByAnchors(esClient, logger, spaceId, { anchors, size: RETRIEVAL_POOL_SIZE }),
      searchByDiamond(esClient, logger, spaceId, {
        vertex_queries: vertexQueries,
        size: RETRIEVAL_POOL_SIZE,
      }),
    ]);
  }

  const extractResult: CorrelateThreatExtractResult = {
    depth: 'extract',
    diamond: queryDiamond,
    trace: traceBuilder.build(),
  };
  await notifyStage('extract', extractResult);

  if (depth === 'extract') {
    return extractResult;
  }

  logger.debug(
    `[ti:correlate] retrieval complete — mode=${input.mode} ` +
      `anchors=${anchorResults.hits.length} diamond=${diamondResults.hits.length}`
  );

  const merged = buildMergedCandidates(anchorResults, diamondResults);

  const buildKnnResult = async (): Promise<CorrelateThreatKnnResult> => {
    const knnIds = new Set<string>([
      ...merged.map((c) => c.report_id),
      ...anchorResults.hits.map((h) => h.report_id),
    ]);
    const knnMeta = knnIds.size > 0 ? await fetchCandidateMeta(esClient, [...knnIds]) : undefined;
    return {
      depth: 'knn',
      anchor_hits: anchorResults,
      diamond_hits: diamondResults,
      merged,
      candidate_meta: knnMeta,
      trace: traceBuilder.build(),
    };
  };

  if (depth === 'knn') {
    const knnResult = await buildKnnResult();
    await notifyStage('search', knnResult);
    return knnResult;
  }

  // Notify search completion without fetching candidate_meta (expensive) for deeper depths.
  // The partials.knn slice will omit candidate_meta for triage/full runs, which is acceptable.
  await notifyStage('search', {
    depth: 'knn' as const,
    anchor_hits: anchorResults,
    diamond_hits: diamondResults,
    merged,
  });

  // §3 Keyword gap-fill — extend pool with candidates covering named entities
  // not represented in the diamond/anchor retrieval results.
  await notifyStage('gap_fill');

  const caseContext =
    input.mode === 'raw_text' ? input.text : buildCaseContextFromDiamond(queryDiamond);

  const sourceReportId = input.mode === 'report_id' ? input.report_id : undefined;

  if (!triageModel) throw new Error('correlateThreat: triageModel required for depth >= triage');

  const gapFillCandidates = await keywordGapFill({
    model: triageModel,
    esClient,
    logger,
    caseContext,
    currentPool: merged,
    sourceReportId,
    spaceId,
    traceBuilder,
  });

  const extended: TriageCandidateInput[] =
    gapFillCandidates.length > 0 ? [...merged, ...gapFillCandidates] : merged;

  logger.debug(
    `[ti:correlate] gap-fill added ${gapFillCandidates.length} candidate(s), ` +
      `pool=${extended.length}`
  );

  // §4 Dedup-collapse — collapse exact ioc_set_hash duplicates and bilingual
  // sibling URL variants before spending the triage LLM.
  await notifyStage('dedup');

  const preCollapseCount = extended.length;
  const collapsed = await collapseCandidates(esClient, extended);
  const collapsedCount = preCollapseCount - collapsed.length;

  logger.debug(
    `[ti:correlate] collapse removed ${collapsedCount} candidate(s), pool=${collapsed.length}`
  );

  // §5 Triage — CollapsedCandidate extends TriageCandidateInput; triage
  // ignores the extra collapsed_members field.
  await notifyStage('triage');

  const triageResult = await triageDiamondCandidates({
    model: triageModel,
    logger,
    esClient,
    queryDiamond,
    candidates: collapsed,
    confidenceFloor: triageFloor,
    topN: triageTopN,
    traceBuilder,
  });

  const triageIds = new Set<string>([
    ...triageResult.picks.map((p) => p.candidate_id),
    ...triageResult.groups.flatMap((g) => g.candidates.map((c) => c.candidate_id)),
    ...triageResult.triaged_out.map((t) => t.candidate_id),
  ]);
  const triageMeta =
    triageIds.size > 0 ? await fetchCandidateMeta(esClient, [...triageIds]) : undefined;
  const triageDepthResult: CorrelateThreatTriageResult = {
    depth: 'triage',
    picks: triageResult.picks,
    groups: triageResult.groups,
    triaged_out: triageResult.triaged_out,
    candidates_fed: triageResult.candidates_fed,
    fallback_used: triageResult.fallback_used,
    candidate_meta: triageMeta,
    trace: traceBuilder.build(),
  };
  await notifyStage('triage', triageDepthResult);

  if (depth === 'triage') {
    return triageDepthResult;
  }

  // §6 Synthesis — build case text and call synthesize_correlations.
  // For report_id mode we attempt to fetch the full source body text so the
  // synthesis model receives the same quality input as raw_text mode.
  // Falls back to the diamond-vertex proxy if body_text is absent.
  await notifyStage('synthesize');

  const caseText =
    input.mode === 'raw_text'
      ? input.text
      : (await fetchSourceBodyText(esClient, spaceId, input.report_id)) ??
        buildCaseContextFromDiamond(queryDiamond);

  if (!synthesisModel) throw new Error('correlateThreat: synthesisModel required for depth full');

  // groups is intentionally NOT passed — it is a UI diagnostic artifact only and must
  // never become an input to the independent synthesis judge (firewall against rank-leak).
  const findings = await synthesizeCorrelations({
    synthesisModel,
    logger,
    esClient,
    picks: triageResult.picks,
    collapsed,
    caseText,
    traceBuilder,
  });

  const caseVertexSignal = {
    adversary: mapDiamondSignal(queryDiamond.adversary.signal),
    capability: mapDiamondSignal(queryDiamond.capability.signal),
    infrastructure: mapDiamondSignal(queryDiamond.infrastructure.signal),
    victim: mapDiamondSignal(queryDiamond.victim.signal),
  };

  const outputIds = new Set<string>();
  for (const lead of findings.leads) {
    for (const id of lead.candidate_ids) outputIds.add(id);
  }
  for (const nm of findings.no_match) {
    outputIds.add(nm.id);
  }
  const candidateMeta =
    outputIds.size > 0 ? await fetchCandidateMeta(esClient, [...outputIds]) : undefined;

  const fullResult: CorrelateThreatFullResult = {
    depth: 'full',
    findings: {
      ...findings,
      trace: traceBuilder.build(),
      case_vertex_signal: caseVertexSignal,
      candidate_meta: candidateMeta,
    },
  };
  await notifyStage('synthesize', fullResult);

  return fullResult;
};
