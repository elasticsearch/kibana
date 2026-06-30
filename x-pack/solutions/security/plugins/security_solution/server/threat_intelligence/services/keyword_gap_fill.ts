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
import { buildSpaceFilterTerms } from '../lib/space_filter';
import type { CostTraceBuilder } from '../routes/lib/cost_tracker';
import { logStageUsage } from '../routes/lib/cost_tracker';
import type { TriageCandidateInput } from './triage_diamond_candidates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAP_FILL_CASE_CONTEXT_CHARS = 8_000;
const GAP_FILL_HITS_PER_KEYWORD = 3;
const MIN_KEYWORD_LEN = 4;
const MAX_GAP_FILL_KEYWORDS = 10;

// ---------------------------------------------------------------------------
// LLM schema
// ---------------------------------------------------------------------------

const gapFillOutputSchema = z.object({
  uncovered_keywords: z.array(z.string()),
});

type GapFillLlmOutput = z.infer<typeof gapFillOutputSchema>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KeywordGapFillParams {
  model: ScopedModel;
  esClient: ElasticsearchClient;
  logger: Logger;
  /**
   * Case text (raw_text mode: the full report text, truncated) or the
   * concatenated non-NONE diamond vertex summaries (report_id mode).
   * Empty string → gap-fill is skipped.
   */
  caseContext: string;
  /** Current merged candidate pool — used to tell the LLM what is already covered. */
  currentPool: ReadonlyArray<{ report_id: string; title: string }>;
  /** Source report _id to exclude from results (report_id input mode). */
  sourceReportId?: string;
  spaceId: string;
  traceBuilder?: CostTraceBuilder;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const buildGapFillPrompt = (caseContext: string, poolTitles: readonly string[]): string => {
  const poolBlock =
    poolTitles.length > 0
      ? poolTitles.map((t) => `- ${t}`).join('\n')
      : '(no candidates retrieved yet)';

  return (
    `You are supporting a threat intelligence correlation pipeline.\n\n` +
    `CASE:\n${caseContext.slice(
      0,
      GAP_FILL_CASE_CONTEXT_CHARS
    )}\n\nCURRENT CANDIDATE POOL (already retrieved by semantic search):\n${poolBlock}\n\nIdentify specific named technical entities from the case that are NOT adequately ` +
    `covered by any candidate above.\n\n` +
    `Focus ONLY on: malware family names, threat actor names/aliases, tool names, CVE IDs, ` +
    `specific commercial software names.\n` +
    `EXCLUDE: generic terms (e.g. "ransomware", "phishing", "malware"), IOC values ` +
    `(IP addresses, domains, hashes, URLs), vendor/publication names.\n\n` +
    `A term is "covered" if any candidate clearly relates to that named entity — even under ` +
    `an alternate name or as part of a broader campaign.\n\n` +
    `Return JSON only — no commentary:\n` +
    `{"uncovered_keywords": ["keyword1", "keyword2"]}\n\n` +
    `If all entities are already covered or no specific entities are present, ` +
    `return {"uncovered_keywords": []}.`
  );
};

interface GapFillHitSource {
  content?: { title?: string };
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Keyword gap-fill — faithful port of Mustard's `keyword_gap_search`.
 *
 * Since our `extract_diamond` output does not carry a `keywords` field
 * (dropped to avoid a schema bump — see `extract_diamond.ts` comment), the
 * gap-fill LLM derives uncovered keywords directly from the case context.
 *
 * The LLM identifies named technical entities (malware families, actor names,
 * tool names, CVE IDs) from the case text that are not represented in the
 * current merged candidate pool. Each uncovered keyword is then searched via
 * `match_phrase` on `content.body_text_bm25` (the BM25 full-text field) to
 * extend the pool.
 *
 * Gap-fill candidates enter with overlap=0, score=0, no vertex scores —
 * the weakest signal tier. They are NOT protected by the discriminating-
 * anchor cap in triage (§5) and yield to stronger diamond-ranked candidates
 * when the top-N cap binds at scale.
 */
export const keywordGapFill = async ({
  model,
  esClient,
  logger,
  caseContext,
  currentPool,
  sourceReportId,
  spaceId,
  traceBuilder,
}: KeywordGapFillParams): Promise<TriageCandidateInput[]> => {
  if (!caseContext.trim()) {
    logger.debug('[ti:gap-fill] empty case context — skipping');
    return [];
  }

  const connectorId = model.connector.connectorId;
  const modelName =
    (model.connector.config?.model as string | undefined) ??
    (model.connector.config?.providerConfig as { model_id?: string } | undefined)?.model_id;
  const poolTitles = currentPool.map((c) => c.title);
  const prompt = buildGapFillPrompt(caseContext, poolTitles);

  interface RawResult {
    raw: { response_metadata: Record<string, unknown> };
    parsed: GapFillLlmOutput;
  }

  const structured = model.chatModel.withStructuredOutput(gapFillOutputSchema, {
    includeRaw: true,
  });

  let uncovered: string[];
  try {
    const t0 = Date.now();
    const result = (await structured.invoke(prompt)) as RawResult;
    const wallMs = Date.now() - t0;
    logStageUsage(logger, 'keyword_gap_fill', connectorId, result.raw.response_metadata ?? {});
    traceBuilder?.addStage({
      stage: 'keyword_gap_fill',
      connectorId,
      modelName,
      metadata: result.raw.response_metadata ?? {},
      wallMs,
    });
    uncovered = (result.parsed.uncovered_keywords ?? [])
      .map((k) => k.trim())
      .filter((k) => k.length >= MIN_KEYWORD_LEN)
      .slice(0, MAX_GAP_FILL_KEYWORDS);
  } catch (err) {
    logger.warn(`[ti:gap-fill] LLM call failed (${(err as Error).message}) — skipping gap-fill`);
    return [];
  }

  if (uncovered.length === 0) {
    logger.debug('[ti:gap-fill] all keywords covered — no gap-fill needed');
    return [];
  }

  logger.debug(`[ti:gap-fill] uncovered keywords: ${uncovered.join(', ')}`);

  const existingIds = new Set(currentPool.map((c) => c.report_id));
  const seenTitlesLower = new Set(poolTitles.map((t) => t.toLowerCase()));
  const newCandidates: TriageCandidateInput[] = [];

  const mustNotClauses: Array<Record<string, unknown>> = [];
  if (sourceReportId) {
    mustNotClauses.push({ term: { _id: sourceReportId } });
  }

  for (const keyword of uncovered) {
    let hits: Array<{ _id: string; _source?: GapFillHitSource }> = [];
    try {
      const response = await esClient.search<GapFillHitSource>({
        index: THREAT_REPORTS_INDEX_PATTERN,
        size: GAP_FILL_HITS_PER_KEYWORD,
        _source: ['content.title'],
        ignore_unavailable: true,
        query: {
          bool: {
            filter: [buildSpaceFilterTerms(spaceId)],
            must: [{ match_phrase: { 'content.body_text_bm25': keyword } }],
            ...(mustNotClauses.length > 0 ? { must_not: mustNotClauses } : {}),
          },
        },
      });
      hits = response.hits.hits as Array<{ _id: string; _source?: GapFillHitSource }>;
    } catch (err) {
      logger.debug(`[ti:gap-fill] ES error for keyword "${keyword}": ${(err as Error).message}`);
    }

    for (const hit of hits) {
      const id = hit._id;
      if (id && !existingIds.has(id)) {
        const title = hit._source?.content?.title?.trim() ?? id;
        if (!seenTitlesLower.has(title.toLowerCase())) {
          existingIds.add(id);
          seenTitlesLower.add(title.toLowerCase());
          newCandidates.push({
            report_id: id,
            title,
            overlap: 0,
            score: 0,
            vertex_scores: {},
            match_breakdown: undefined,
            retrieval_source: 'gap_fill',
          });
          logger.debug(`[ti:gap-fill] added "${title}" via keyword "${keyword}"`);
        }
      }
    }
  }

  logger.debug(
    `[ti:gap-fill] added ${newCandidates.length} candidate(s) from ` +
      `${uncovered.length} uncovered keyword(s)`
  );
  return newCandidates;
};
