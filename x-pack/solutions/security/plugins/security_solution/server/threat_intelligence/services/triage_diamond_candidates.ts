/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { z } from '@kbn/zod/v4';
import { THREAT_REPORTS_INDEX_PATTERN } from '../../../common/threat_intelligence/hub';
import type { CostTraceBuilder } from '../routes/lib/cost_tracker';
import { logStageUsage } from '../routes/lib/cost_tracker';
import type { DiamondVertex, DiamondVertexScore } from './search_by_diamond';
import type { AnchorMatchBreakdown } from './search_by_anchors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface QueryDiamondVertex {
  signal: string; // 'NONE' | 'WEAK' | 'MODERATE' | 'STRONG'
  summary: string;
}

export type QueryDiamond = Record<DiamondVertex, QueryDiamondVertex>;

/** Which retrieval path produced this candidate. */
export type RetrievalSource = 'anchor' | 'diamond' | 'gap_fill';

/** A candidate as ranked by the retrieval stage, ready for triage. */
export interface TriageCandidateInput {
  report_id: string;
  title: string;
  /** Diamond vertex overlap count; 0 for anchor-only candidates. */
  overlap: number;
  /** Diamond headline score (max above-floor vertex score); 0 for anchor-only. */
  score: number;
  vertex_scores: DiamondVertexScore;
  /**
   * Anchor match breakdown from `search_by_anchors`. Present whenever this
   * candidate appeared in the anchor result set (including diamond+anchor
   * candidates). Undefined for diamond-only candidates.
   *
   * Carried into the triage prompt so the LLM can recognise anchor-only
   * candidates that share a hash or actor as high-signal even though their
   * vertex scores are all zero.
   */
  match_breakdown?: AnchorMatchBreakdown;
  /** Which retrieval path produced this candidate. */
  retrieval_source?: RetrievalSource;
}

/** A single candidate selected by triage (post confidence floor). */
export interface TriagePick {
  candidate_id: string; // report_id
  confidence: number;
  justification: string;
  vertex_scores: DiamondVertexScore;
  overlap: number;
  match_breakdown?: AnchorMatchBreakdown;
  retrieval_source?: RetrievalSource;
}

/** A hypothesis group from the triage LLM (debug/diagnostic only). */
export interface TriageGroup {
  hypothesis: string;
  candidates: Array<{ candidate_id: string; confidence: number; justification: string }>;
}

/** A candidate fed to triage but excluded from the final picks list. */
export interface TriagedOutCandidate {
  candidate_id: string;
  /** LLM confidence if scored below the confidence floor; retrieval headline score otherwise. */
  score: number;
  reason: 'below_floor' | 'not_selected';
  /** LLM-assigned confidence (present when the LLM scored this candidate). */
  confidence?: number;
  /** LLM-assigned justification phrase (present when the LLM scored this candidate). */
  justification?: string;
  vertex_scores: DiamondVertexScore;
  overlap: number;
  match_breakdown?: AnchorMatchBreakdown;
  retrieval_source?: RetrievalSource;
}

export interface TriageDiamondCandidatesParams {
  model: ScopedModel;
  logger: Logger;
  esClient: ElasticsearchClient;
  queryDiamond: QueryDiamond;
  candidates: TriageCandidateInput[];
  confidenceFloor: number;
  topN: number;
  traceBuilder?: CostTraceBuilder;
}

export interface TriageDiamondCandidatesResult {
  /** Post-floor picks, sorted by confidence desc. */
  picks: TriagePick[];
  /** Raw hypothesis groups — diagnostic only; do not drive downstream membership. */
  groups: TriageGroup[];
  /** True when triage returned no picks and the top-10 fallback was used. */
  fallback_used: boolean;
  /** Candidates actually fed to the LLM (post top-N cap). */
  candidates_fed: number;
  /** Candidates fed to triage that were not selected as picks. */
  triaged_out: TriagedOutCandidate[];
}

// ---------------------------------------------------------------------------
// LLM output schema (adapted from Mustard's TRIAGE_SYSTEM JSON spec)
// ---------------------------------------------------------------------------

const triageLlmCandidateSchema = z.object({
  candidate_id: z.string(),
  confidence: z.number().min(0).max(1),
  justification: z.string(),
});

const triageLlmGroupSchema = z.object({
  hypothesis: z.string(),
  candidates: z.array(triageLlmCandidateSchema),
});

const triageLlmTriagedOutSchema = z.object({
  candidate_id: z.string(),
  confidence: z.number().min(0).max(1),
  justification: z.string(),
});

export const triageLlmOutputSchema = z.object({
  groups: z.array(triageLlmGroupSchema),
  total_selected: z.number().int().nullish(),
  triaged_out: z.array(triageLlmTriagedOutSchema).nullish(),
});

type TriageLlmOutput = z.infer<typeof triageLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Prompt — faithful port of Mustard's TRIAGE_SYSTEM + _build_triage_prompt
// (mustard.py ~548–637). Key adaptations:
//   - `campaign_label` → `candidate_id` (short numeric label c01…cNN)
//   - Full vertex summaries — no 400-char TRIAGE_SNIPPET_LEN truncation
//   - `vendor`/`admiralty` → `source_type` (our stored field)
// ---------------------------------------------------------------------------

const TRIAGE_INSTRUCTIONS = `\
You are a CTI triage analyst. Your task is to review kNN-ranked candidate \
reports against a new threat-intelligence case and select the most promising \
candidates for deep analysis by a senior judge.

You will receive the Diamond Model vertex summaries for the new case, followed \
by a ranked candidate list with per-vertex similarity scores and full vertex summaries.

Your output must be a JSON object with this exact structure:
{
  "groups": [
    {
      "hypothesis": "<short label for this cluster, e.g. 'same campaign', 'shared C2 technique', 'DPRK crypto cluster'>",
      "candidates": [
        {
          "candidate_id": "<the candidate_id value exactly as it appears after candidate_id= in the candidate list>",
          "confidence": <float 0.0-1.0>,
          "justification": "<one sentence: the specific signal that makes this worth deep analysis>"
        }
      ]
    }
  ],
  "total_selected": <integer>,
  "triaged_out": [
    {
      "candidate_id": "<candidate_id exactly as provided>",
      "confidence": <float 0.0-1.0>,
      "justification": "<one phrase: why this candidate was not advanced>"
    }
  ]
}

Accounting rule: every candidate you receive must appear exactly once — either in a group (advanced) or in triaged_out (not advanced). \
Do not omit any candidate. For triaged_out entries assign a real confidence (how likely this candidate correlates to the case) \
and a short justification phrase explaining why it was not advanced.

Confidence scale:
- 0.9–1.0: Strong multi-vertex overlap, high correlation likelihood
- 0.7–0.89: Plausible single-vertex match worth investigating
- 0.5–0.69: Speculative — only one weak signal or lexical-only similarity
- < 0.5: Noise — should never appear in the fetch list

Be aggressive. A candidate that matches on only one vertex with no infrastructure \
or capability overlap should score below 0.7. Do not give benefit of the doubt \
— the judge pass is expensive.

Selection heuristics (apply in order):
- MUST fetch: 3+ vertex overlaps, OR any 2 vertices with score >= 0.88
- SHOULD fetch: 2 vertices with score >= 0.83, OR 1 vertex >= 0.88 with a \
distinctive/rare feature visible in the summary (named malware family, specific \
protocol, unique lure type, named threat actor, etc.)
- SKIP: single-vertex matches below 0.86 unless the summary reveals a specific \
shared indicator not present elsewhere in the candidate list
- Target 6–12 total candidates. Quality beats quantity — 6 sharp picks beat 12 weak ones.
- Group by analytical hypothesis. Each candidate appears in exactly one group.
- If fewer than 6 meet the threshold, include the best available up to 12 total.

Respond ONLY with the JSON object. No prose before or after.`;

// ---------------------------------------------------------------------------
// Internal types and helpers
// ---------------------------------------------------------------------------

const DIAMOND_VERTICES_ORDER = [
  'adversary',
  'capability',
  'infrastructure',
  'victim',
] as const satisfies readonly DiamondVertex[];

interface VertexSummaryEntry {
  signal: string;
  summary: string;
}

interface CandidateWithSummaries extends TriageCandidateInput {
  /** Short prompt label (c01…cNN) — maps back to report_id after parse. */
  label: string;
  summaries: Record<DiamondVertex, VertexSummaryEntry>;
}

interface StoredCandidateSource {
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
 * Fetches full diamond vertex summaries for a batch of candidate report IDs.
 * Returns a map from report_id to its per-vertex signal+summary.
 */
const fetchCandidateSummaries = async (
  esClient: ElasticsearchClient,
  reportIds: readonly string[]
): Promise<Map<string, Record<DiamondVertex, VertexSummaryEntry>>> => {
  const result = new Map<string, Record<DiamondVertex, VertexSummaryEntry>>();
  if (reportIds.length === 0) return result;

  const response = await esClient.search<StoredCandidateSource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: reportIds.length + 5,
    query: { ids: { values: [...reportIds] } },
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
    ignore_unavailable: true,
  });

  for (const hit of response.hits.hits) {
    if (hit._id) {
      const diamond = hit._source?.extracted?.diamond ?? {};
      const summaries = {} as Record<DiamondVertex, VertexSummaryEntry>;
      for (const v of DIAMOND_VERTICES_ORDER) {
        const vd = diamond[v] ?? {};
        summaries[v] = { signal: vd.signal ?? 'NONE', summary: vd.summary?.trim() ?? '' };
      }
      result.set(hit._id, summaries);
    }
  }

  return result;
};

const EMPTY_VERTEX: VertexSummaryEntry = { signal: 'NONE', summary: '' };

/**
 * Token-budget safety guard. Trims vertex summaries in priority order
 * (victim → adversary) if the total estimated chars exceed the budget.
 * Capability and infrastructure summaries are always preserved in full.
 *
 * Rarely triggers at MVP scale (36 candidates < topN=75). The guard
 * threshold and trim logic are Phase 6 calibration knobs.
 */
const TOKEN_BUDGET_GUARD_CHARS = 640_000; // ≈ 160K tokens at 4 chars/token

const applyTokenBudgetGuard = (candidates: CandidateWithSummaries[]): CandidateWithSummaries[] => {
  const estimateChars = (c: CandidateWithSummaries): number =>
    DIAMOND_VERTICES_ORDER.reduce((sum, v) => sum + c.summaries[v].summary.length, 0);

  const total = candidates.reduce((sum, c) => sum + estimateChars(c), 0);
  if (total <= TOKEN_BUDGET_GUARD_CHARS) return candidates;

  const trimOrder: Array<'victim' | 'adversary'> = ['victim', 'adversary'];
  const trimmed = candidates.map((c) => ({
    ...c,
    summaries: { ...c.summaries },
  }));

  for (const v of trimOrder) {
    for (const c of [...trimmed].reverse()) {
      if (c.summaries[v].summary) {
        c.summaries[v] = { signal: c.summaries[v].signal, summary: '' };
        const newTotal = trimmed.reduce((sum, tc) => sum + estimateChars(tc), 0);
        if (newTotal <= TOKEN_BUDGET_GUARD_CHARS) return trimmed;
      }
    }
  }
  return trimmed; // capability + infrastructure always preserved
};

const buildCaseSummary = (queryDiamond: QueryDiamond): string => {
  const lines: string[] = ['NEW CASE:', ''];
  for (const v of DIAMOND_VERTICES_ORDER) {
    const vd = queryDiamond[v];
    lines.push(`[${v.toUpperCase()}] ${vd.signal}`);
    if (vd.summary) lines.push(vd.summary);
    lines.push('');
  }
  return lines.join('\n');
};

const buildCandidatesSection = (candidates: CandidateWithSummaries[]): string => {
  const lines: string[] = [
    '---',
    `CANDIDATES (${candidates.length} total, ranked by vertex overlap then max score):`,
    '',
  ];

  for (const c of candidates) {
    const scoreStr = DIAMOND_VERTICES_ORDER.filter((v) => c.vertex_scores[v] !== undefined)
      .map((v) => `${v.slice(0, 3).toUpperCase()}=${(c.vertex_scores[v] ?? 0).toFixed(3)}`)
      .join(', ');

    lines.push(
      `[${c.overlap} vertices]  candidate_id="${c.label}"  title="${c.title}"  source_type=${c.report_id}`
    );
    lines.push(`   Scores: ${scoreStr || '(anchor-only)'}`);

    // Emit discriminating anchor signals so the LLM can score anchor-only candidates
    // correctly. A shared hash or named actor is a strong correlation signal even when
    // all diamond vertex scores are zero.
    const bd = c.match_breakdown;
    if (bd && (bd.ioc_hash_hits.length > 0 || bd.ioc_set_hash_match || bd.actor_hits.length > 0)) {
      const parts: string[] = [];
      for (const h of bd.ioc_hash_hits) parts.push(`hash=${h.slice(0, 16)}…`);
      if (bd.ioc_set_hash_match) parts.push('ioc_set_hash=EXACT_MATCH');
      for (const a of bd.actor_hits) parts.push(`actor=${a}`);
      lines.push(`   ANCHOR (discriminating): ${parts.join(', ')}`);
    }

    for (const v of DIAMOND_VERTICES_ORDER) {
      const { signal, summary } = c.summaries[v];
      if (signal !== 'NONE' && summary) {
        lines.push(`   ${v.slice(0, 3).toUpperCase()} (${signal}): ${summary}`);
      }
    }
    lines.push('');
  }

  lines.push(
    'Select candidates for deep analysis. Respond with the JSON output format from your instructions.'
  );
  return lines.join('\n');
};

const buildTriagePrompt = (
  queryDiamond: QueryDiamond,
  candidates: CandidateWithSummaries[]
): string =>
  `${TRIAGE_INSTRUCTIONS}\n\n---\n\n${buildCaseSummary(queryDiamond)}${buildCandidatesSection(
    candidates
  )}`;

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Triage pass — port of Mustard's TRIAGE_SYSTEM + run_triage (mustard.py ~548–715).
 *
 * Sorts the merged candidate pool by (overlap DESC, score DESC), applies the
 * top-N cap, fetches full vertex summaries from ES, calls the Sonnet-tier LLM
 * to group and score candidates, applies the confidence floor, and falls back
 * to the top-10 by rank if triage returns no selections.
 *
 * Groups are DIAGNOSTIC ONLY — downstream membership is determined by
 * `picks[].candidate_id`, not by group membership.
 */
export const triageDiamondCandidates = async ({
  model,
  logger,
  esClient,
  queryDiamond,
  candidates,
  confidenceFloor,
  topN,
  traceBuilder,
}: TriageDiamondCandidatesParams): Promise<TriageDiamondCandidatesResult> => {
  const connectorId = model.connector.connectorId;
  const modelName =
    (model.connector.config?.model as string | undefined) ??
    (model.connector.config?.providerConfig as { model_id?: string } | undefined)?.model_id;

  // 1. Sort by (overlap DESC, score DESC), then apply topN cap while protecting
  //    discriminating anchor-only candidates. Anchor-only hits (overlap=0, score=0)
  //    would otherwise sink to the bottom and be cut, negating the anchor↔diamond
  //    complementarity. Partition them out before slicing so they always reach triage.
  const sorted = [...candidates].sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return b.score - a.score;
  });

  const isDiscriminatingAnchorOnly = (c: TriageCandidateInput): boolean =>
    c.overlap === 0 && (c.match_breakdown?.discriminating_match_count ?? 0) > 0;

  const anchorProtected = sorted.filter(isDiscriminatingAnchorOnly);
  const diamondRanked = sorted.filter((c) => !isDiscriminatingAnchorOnly(c));
  const diamondSlots = Math.max(0, topN - anchorProtected.length);
  const capped = [...diamondRanked.slice(0, diamondSlots), ...anchorProtected];

  if (capped.length === 0) {
    logger.debug('[ti:triage] no candidates — returning empty picks');
    return { picks: [], groups: [], fallback_used: false, candidates_fed: 0, triaged_out: [] };
  }

  const candidateMap = new Map<string, TriageCandidateInput>();
  for (const c of capped) {
    candidateMap.set(c.report_id, c);
  }

  // 2. Assign short prompt labels (c01, c02, …) to avoid UUID echo errors.
  const labelWidth = String(capped.length).length;
  const labelMap = new Map<string, string>(); // label → report_id
  const labeledCandidates = capped.map((c, i) => {
    const label = `c${String(i + 1).padStart(labelWidth, '0')}`;
    labelMap.set(label, c.report_id);
    return { ...c, label };
  });

  // 3. Fetch full vertex summaries for all candidates.
  const summaryMap = await fetchCandidateSummaries(
    esClient,
    labeledCandidates.map((c) => c.report_id)
  );
  const withSummaries: CandidateWithSummaries[] = labeledCandidates.map((c) => ({
    ...c,
    summaries: summaryMap.get(c.report_id) ?? {
      adversary: EMPTY_VERTEX,
      capability: EMPTY_VERTEX,
      infrastructure: EMPTY_VERTEX,
      victim: EMPTY_VERTEX,
    },
  }));

  // 4. Token-budget guard (rarely triggers at MVP scale).
  const guarded = applyTokenBudgetGuard(withSummaries);

  // 5. Build prompt and call the LLM.
  const prompt = buildTriagePrompt(queryDiamond, guarded);

  interface RawResult {
    raw: { response_metadata: Record<string, unknown> };
    parsed: TriageLlmOutput;
  }

  const structured = model.chatModel.withStructuredOutput(triageLlmOutputSchema, {
    includeRaw: true,
  });

  let llmOutput: TriageLlmOutput;
  try {
    const t0 = Date.now();
    const result = (await structured.invoke(prompt)) as RawResult;
    const wallMs = Date.now() - t0;
    logStageUsage(
      logger,
      'triage_diamond_candidates',
      connectorId,
      result.raw.response_metadata ?? {}
    );
    traceBuilder?.addStage({
      stage: 'triage_diamond_candidates',
      connectorId,
      modelName,
      metadata: result.raw.response_metadata ?? {},
      wallMs,
    });
    llmOutput = result.parsed;
  } catch (err) {
    logger.warn(`[ti:triage] LLM call failed (${(err as Error).message}) — using top-10 fallback`);
    llmOutput = { groups: [] };
  }

  // 6. Flatten groups → picks, resolve labels → report_ids.
  const seen = new Set<string>();
  const rawPicks: TriagePick[] = [];
  const groups: TriageGroup[] = [];

  for (const group of llmOutput.groups ?? []) {
    const mappedGroup: TriageGroup = { hypothesis: group.hypothesis, candidates: [] };

    for (const entry of group.candidates) {
      const reportId = labelMap.get(entry.candidate_id);
      if (reportId && !seen.has(reportId)) {
        seen.add(reportId);
        const src = candidateMap.get(reportId);
        const pick: TriagePick = {
          candidate_id: reportId,
          confidence: entry.confidence,
          justification: entry.justification,
          vertex_scores: src?.vertex_scores ?? {},
          overlap: src?.overlap ?? 0,
          match_breakdown: src?.match_breakdown,
          retrieval_source: src?.retrieval_source,
        };
        rawPicks.push(pick);
        mappedGroup.candidates.push({ ...pick });
      }
    }

    if (mappedGroup.candidates.length > 0) groups.push(mappedGroup);
  }

  // 7. Apply confidence floor.
  const aboveFloor = rawPicks.filter((p) => p.confidence >= confidenceFloor);
  const picks = [...aboveFloor].sort((a, b) => b.confidence - a.confidence);

  // 8. Fallback: if no picks after floor, take top-10 by rank with default confidence.
  let fallbackUsed = false;
  if (picks.length === 0) {
    logger.warn(`[ti:triage] no picks above floor=${confidenceFloor} — using top-10 rank fallback`);
    fallbackUsed = true;
    for (const c of capped.slice(0, 10)) {
      picks.push({
        candidate_id: c.report_id,
        confidence: 0.5,
        justification: '',
        vertex_scores: c.vertex_scores,
        overlap: c.overlap,
        match_breakdown: c.match_breakdown,
        retrieval_source: c.retrieval_source,
      });
    }
  }

  // 9. Build triaged-out list — candidates fed but not in final picks.
  //
  // Three sources of confidence/justification data (in priority order):
  //   a) LLM triaged_out array  — candidates the LLM explicitly did not advance
  //   b) rawPicks below floor   — candidates the LLM scored but confidence < floor
  //   c) retrieval score        — fallback when the LLM produced no data for this candidate
  const finalPickIds = new Set(picks.map((p) => p.candidate_id));

  // Map from report_id → {confidence, justification} for LLM-explicit triaged_out entries.
  const llmTriagedOutMap = new Map<string, { confidence: number; justification: string }>();
  for (const entry of llmOutput.triaged_out ?? []) {
    const reportId = labelMap.get(entry.candidate_id);
    if (reportId) {
      llmTriagedOutMap.set(reportId, {
        confidence: entry.confidence,
        justification: entry.justification,
      });
    }
  }

  // Map from report_id → {confidence, justification} for below-floor rawPicks.
  const belowFloorMap = new Map<string, { confidence: number; justification: string }>();
  for (const p of rawPicks) {
    if (!finalPickIds.has(p.candidate_id)) {
      belowFloorMap.set(p.candidate_id, {
        confidence: p.confidence,
        justification: p.justification,
      });
    }
  }

  const triagedOut: TriagedOutCandidate[] = capped
    .filter((c) => !finalPickIds.has(c.report_id))
    .map((c) => {
      const belowFloor = belowFloorMap.get(c.report_id);
      const llmEntry = belowFloor ?? llmTriagedOutMap.get(c.report_id);
      return {
        candidate_id: c.report_id,
        score: llmEntry !== undefined ? llmEntry.confidence : c.score,
        reason: (belowFloor !== undefined
          ? 'below_floor'
          : 'not_selected') as TriagedOutCandidate['reason'],
        confidence: llmEntry?.confidence,
        justification: llmEntry?.justification,
        vertex_scores: c.vertex_scores,
        overlap: c.overlap,
        match_breakdown: c.match_breakdown,
        retrieval_source: c.retrieval_source,
      };
    });

  const unscored = triagedOut.filter((t) => t.confidence === undefined).length;
  if (unscored > 0) {
    logger.warn(
      `[ti:triage] accounting-rule violation — ${unscored}/${triagedOut.length} triaged-out ` +
        `candidates had no LLM score (model omitted them; fell back to retrieval score)`
    );
  }

  logger.debug(
    `[ti:triage] complete — fed=${guarded.length} picks=${picks.length} ` +
      `groups=${groups.length} floor=${confidenceFloor} fallback=${fallbackUsed} ` +
      `triaged_out=${triagedOut.length}`
  );

  return {
    picks,
    groups,
    fallback_used: fallbackUsed,
    candidates_fed: guarded.length,
    triaged_out: triagedOut,
  };
};
