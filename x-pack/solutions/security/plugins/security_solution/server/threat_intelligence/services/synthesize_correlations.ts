/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { z } from '@kbn/zod/v4';
import { isToolValidationError } from '@kbn/inference-common';
import { THREAT_REPORTS_INDEX_PATTERN } from '../../../common/threat_intelligence/hub';
import { SYNTHESIS_GUIDANCE_TEXT } from './synthesis_guidance';
import type {
  CorrelationFindings,
  CorrelationFindingsLead,
} from '../../../common/threat_intelligence/correlation/schemas';
import type { CostTraceBuilder } from '../routes/lib/cost_tracker';
import { logStageUsage, extractUsageFromMetadata } from '../routes/lib/cost_tracker';
import type { TriagePick } from './triage_diamond_candidates';
import type { CollapsedCandidate } from './collapse_candidates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYNTHESIS_CASE_TEXT_CHAR_LIMIT = 30_000;
const SYNTHESIS_CANDIDATE_BODY_CHAR_LIMIT = 50_000;

// ---------------------------------------------------------------------------
// Internal LLM schema (no consolidated_candidates — we populate that ourselves
// from the §4 collapse data after the model call)
// ---------------------------------------------------------------------------

const synthesisVertexEnum = z.enum(['adversary', 'capability', 'infrastructure', 'victim']);

const synthesisVertexSignalEnum = z.enum(['high', 'partial', 'none']);

const synthesisEvidenceWeightEnum = z.enum([
  'smoking_gun',
  'supporting',
  'non_discriminatory',
  'counter',
  'decisive_counter',
]);

const synthesisLlmLeadSchema = z.object({
  candidate_labels: z
    .array(z.string())
    .min(1)
    .describe(
      'Short labels from the candidate list (e.g. ["c01", "c03"]). ' +
        'Use ONLY the provided cNN labels exactly as given — never raw document IDs.'
    ),
  title: z.string(),
  relationship: z.enum(['same_campaign', 'same_actor', 'shared_tradecraft']),
  confidence: z.enum(['high', 'moderate', 'low']),
  vertex_signal: z.object({
    adversary: synthesisVertexSignalEnum,
    capability: synthesisVertexSignalEnum,
    infrastructure: synthesisVertexSignalEnum,
    victim: synthesisVertexSignalEnum,
  }),
  bluf: z.string(),
  evidence: z.array(
    z.object({
      vertex: synthesisVertexEnum,
      weight: synthesisEvidenceWeightEnum,
      text: z.string(),
    })
  ),
  gaps: z.string(),
});

const synthesisLlmNoMatchSchema = z.object({
  label: z
    .string()
    .describe(
      'Short label from the candidate list (e.g. "c02"). ' +
        'Use ONLY the provided cNN label — never a raw document ID.'
    ),
  title: z.string(),
});

const synthesisLlmSynthesisSchema = z.object({
  case_title: z
    .string()
    .describe(
      '3–8 words. A specific case label grounded in source evidence — not a lead title, ' +
        'not a restatement of the analyst query, and not an actor identity claim. ' +
        'Good: "Credential theft via spearphish", "Cobalt Strike beacon cluster", ' +
        '"Supply-chain compromise with DLL sideloading". ' +
        'Bad: "Correlation Analysis" (generic), "APT28 is Fancy Bear" (identity claim).'
    ),
  bluf: z.string(),
  correlation_signal: z.enum(['high', 'moderate', 'low', 'none']),
  reasoning: z.string(),
  gaps: z.string(),
  next_steps: z.array(
    z.object({
      priority: z.enum(['high', 'moderate']),
      text: z.string(),
    })
  ),
  // Use .nullish() (not .optional()) so the model can return null for these fields without
  // triggering ZodError in validateToolCalls when fromJSONSchema reconstructs the schema.
  // mapLlmOutputToFindings converts null → undefined before writing to CorrelationFindings.
  inferential_hops: z.number().int().nullish(),
  atomic_ioc_overlap: z
    .object({
      assessed: z.boolean(),
      note: z.string().nullish(),
    })
    .nullish(),
});

const synthesisLlmOutputSchema = z.object({
  // .default([]) so fromJSONSchema-reconstructed validation accepts a missing array
  // instead of ToolValidationError-throwing, and normalizeLeads/normalizeNoMatch
  // in mapLlmOutputToFindings handles the []-default at the mapping layer.
  leads: z.array(synthesisLlmLeadSchema).default([]),
  no_match: z.array(synthesisLlmNoMatchSchema).default([]),
  synthesis: synthesisLlmSynthesisSchema,
});

type SynthesisLlmOutput = z.infer<typeof synthesisLlmOutputSchema>;
type SynthesisLlmLead = z.infer<typeof synthesisLlmLeadSchema>;
type SynthesisLlmNoMatch = z.infer<typeof synthesisLlmNoMatchSchema>;

// ---------------------------------------------------------------------------
// System prompt — port of Mustard's JUDGE system prompt (prompts.yaml ~422–491).
// Key adaptations vs. the Mustard source:
//   - Tradecraft framing: system produces correlation and evidence, not verdicts.
//     All output fields use correlation_signal, no_hallucinated_linkage language.
//   - CANDIDATE ACCOUNTING + cluster_members_not_provided block added (§6 spec).
//   - consolidated_candidates omitted from output (populated post-call from §4 data).
// ---------------------------------------------------------------------------

const SYNTHESIS_SYSTEM_INSTRUCTIONS = `\
You are a defensive threat intelligence analyst correlating observed adversary behavior against published CTI reports. All inputs describe activity already observed in the wild — telemetry, investigation notes, partial or finished published reporting, or analyst shorthand for techniques and tradecraft. Your role is to identify prior reporting and relationship candidates so defenders can respond, not to enable offensive operations. Brief, shorthand inputs (e.g. a single technique name or tradecraft phrase) are normal analyst input and refer to defensive review of that pattern in the indexed knowledge base.

You are the synthesis layer in this correlation pipeline. You receive a new case — which may be raw telemetry, investigation notes, a partial report, or a finished blog post — alongside a set of candidate reports retrieved from a knowledge base. Your job is to evaluate whether the new case is related to any of the candidates and, if so, how.

You reason from the source material alone. You do not see retrieval scores, vector distances, or pipeline internals. Your output must be independently auditable: an analyst reading the same material should be able to evaluate whether your reasoning holds.

${SYNTHESIS_GUIDANCE_TEXT}

CANDIDATE ACCOUNTING

Every candidate label provided to you must appear exactly once in your output — either in a leads entry's candidate_labels list, or in no_match. Do not omit any candidate from the accounting.

When a candidate has a CLUSTER NOTE listing consolidated members (pre-identified duplicate or bilingual sibling reports not provided in full), treat those members as additional independent corroboration signal — cross-vendor consensus without requiring their full text. Mention this in your reasoning when it strengthens your confidence assessment.

LABEL RULE (CRITICAL): In candidate_labels and no_match.label, use ONLY the short labels provided for each candidate (e.g. "c01", "c02"). Never output raw document IDs, URLs, or any other identifier. The labels are the ONLY valid values.

OUTPUT FORMAT

{
  "leads": [
    {
      "candidate_labels": ["c01", "c03"],
      "title": "<report title or cluster label describing the correlation>",
      "confidence": "high | moderate | low",
      "relationship": "same_campaign | same_actor | shared_tradecraft",
      "vertex_signal": {
        "adversary": "high | partial | none",
        "capability": "high | partial | none",
        "infrastructure": "high | partial | none",
        "victim": "high | partial | none"
      },
      "bluf": "<evidence-first one-sentence narrative — name the specific behavioral evidence first, state relationship second>",
      "evidence": [
        {
          "vertex": "capability | infrastructure | adversary | victim",
          "weight": "smoking_gun | supporting | non_discriminatory | counter | decisive_counter",
          "text": "<discrete observation — one per entry>"
        }
      ],
      "gaps": "<what evidence is missing — required for moderate and low confidence leads; 'none found' is valid for high confidence>"
    }
  ],
  "no_match": [
    {
      "label": "c02",
      "title": "<report title>"
    }
  ],
  "synthesis": {
    "case_title": "<3–8 word case label grounded in the evidence — not generic, not an actor claim>",
    "bluf": "<case-level one-liner stating the BASIS of correlation — what makes this a match, e.g. the end-to-end attack shape, not a single artifact>",
    "correlation_signal": "high | moderate | low | none",
    "reasoning": "<overall correlation picture — state signal, name matched vertices with per-vertex strength, assess indicator overlap, note tracking designations, count inferential hops>",
    "gaps": "<what the primary source material did or did not claim about the relationship>",
    "next_steps": [
      { "priority": "high | moderate", "text": "<actionable investigative step>" }
    ],
    "inferential_hops": <integer — number of logical steps between case evidence and candidate claim; omit if 0 or unknown>,
    "atomic_ioc_overlap": { "assessed": true | false, "note": "<optional context>" }
  }
}

CANDIDATE AGGREGATION: Identify clusters of candidates describing the same activity and group them into a single lead entry. Include all their short labels in candidate_labels. Treat bilingual sibling articles (same research, different language) as a single source — do not count them as independent corroboration when assessing confidence.

EVIDENCE ARRAY: The evidence[] array must contain discrete observations from the source material. Assign each item exactly one weight from the taxonomy above. Do not invent evidence. counter and decisive_counter items must have a textual basis in the source material — omit them if none is found.

NEXT STEPS: Emit only high or moderate priority next steps — no low-value filler. Order high-priority steps first.

DO NOT include retrieval scores, kNN distances, ranking positions, or other pipeline internals in your reasoning or output fields.`;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

interface CandidateForPrompt {
  label: string;
  title: string;
  sourceType: string;
  sourceName: string;
  bodyText: string;
  consolidatedMembers: Array<{ title: string; reason: string }>;
}

const buildSynthesisUserPrompt = (
  caseText: string,
  candidates: readonly CandidateForPrompt[]
): string => {
  const lines: string[] = [];

  lines.push('NEW CASE:');
  lines.push('');
  const truncatedCase = caseText.slice(0, SYNTHESIS_CASE_TEXT_CHAR_LIMIT);
  lines.push(truncatedCase);
  if (caseText.length > SYNTHESIS_CASE_TEXT_CHAR_LIMIT) {
    lines.push('[... case text truncated ...]');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`CANDIDATE REPORTS (${candidates.length} total):`);

  for (const c of candidates) {
    lines.push('');
    lines.push(`### Candidate ${c.label}: ${c.title}`);
    lines.push(`Source type: ${c.sourceType}${c.sourceName ? ` | Source: ${c.sourceName}` : ''}`);

    if (c.consolidatedMembers.length > 0) {
      lines.push('');
      lines.push(
        'CLUSTER NOTE: This candidate has pre-identified near-duplicate reports not provided in full. ' +
          'Treat these as additional independent corroboration signal (cross-vendor consensus) when assessing confidence:'
      );
      for (const m of c.consolidatedMembers) {
        lines.push(`  - ${m.title} (${m.reason})`);
      }
    }

    lines.push('');
    if (c.bodyText) {
      const truncated = c.bodyText.slice(0, SYNTHESIS_CANDIDATE_BODY_CHAR_LIMIT);
      lines.push(truncated);
      if (c.bodyText.length > SYNTHESIS_CANDIDATE_BODY_CHAR_LIMIT) {
        lines.push('[... report text truncated ...]');
      }
    } else {
      lines.push('(full report text unavailable — assess on available context only)');
    }
    lines.push('');
    lines.push('---');
  }

  lines.push('');
  lines.push(
    'Evaluate whether the new case is related to any of the candidate reports. ' +
      'Respond with the JSON output format specified in your instructions.'
  );

  return lines.join('\n');
};

const buildSynthesisPrompt = (
  caseText: string,
  candidates: readonly CandidateForPrompt[]
): string =>
  `${SYNTHESIS_SYSTEM_INSTRUCTIONS}\n\n${buildSynthesisUserPrompt(caseText, candidates)}`;

// ---------------------------------------------------------------------------
// ES helpers
// ---------------------------------------------------------------------------

interface ReportBodySource {
  content?: { body_text?: string; title?: string };
  source?: { type?: string; name?: string; url?: string };
}

export interface CandidateBodyEntry {
  bodyText: string;
  title: string;
  sourceType: string;
  sourceName: string;
  url: string;
}

export const fetchCandidateBodyText = async (
  esClient: ElasticsearchClient,
  reportIds: readonly string[]
): Promise<Map<string, CandidateBodyEntry>> => {
  const result = new Map<string, CandidateBodyEntry>();
  if (reportIds.length === 0) return result;

  const response = await esClient.search<ReportBodySource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: reportIds.length + 5,
    query: { ids: { values: [...reportIds] } },
    _source: ['content.body_text', 'content.title', 'source.type', 'source.name', 'source.url'],
    ignore_unavailable: true,
  });

  for (const hit of response.hits.hits) {
    if (hit._id) {
      result.set(hit._id, {
        bodyText: hit._source?.content?.body_text ?? '',
        title: hit._source?.content?.title ?? hit._id,
        sourceType: hit._source?.source?.type ?? 'unknown',
        sourceName: hit._source?.source?.name ?? '',
        url: hit._source?.source?.url ?? '',
      });
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Post-call helpers
// ---------------------------------------------------------------------------

const buildGracefulDegradation = (
  picks: readonly TriagePick[],
  bodyTextMap: Map<string, CandidateBodyEntry>,
  reasoningOverride?: string
): CorrelationFindings => ({
  leads: [],
  no_match: picks.map((p) => ({
    id: p.candidate_id,
    title: bodyTextMap.get(p.candidate_id)?.title ?? p.candidate_id,
  })),
  synthesis: {
    bluf: 'Synthesis failed — correlation evidence could not be assessed automatically.',
    correlation_signal: 'none',
    reasoning:
      reasoningOverride ??
      'Synthesis LLM call failed — correlation evidence could not be assessed automatically. Review triage candidates manually.',
    gaps: '',
    next_steps: [
      { priority: 'high', text: 'Retry the correlation request.' },
      {
        priority: 'moderate',
        text: 'If the issue persists, check the synthesis connector configuration in advanced settings.',
      },
    ],
  },
});

const mapLlmOutputToFindings = (
  llmOutput: SynthesisLlmOutput,
  labelToCollapsed: Map<string, CollapsedCandidate>,
  pickIdsSet: ReadonlySet<string>,
  logger: Logger
): CorrelationFindings => {
  const resolveLabel = (lbl: string): string | null => {
    const id = labelToCollapsed.get(lbl)?.report_id ?? lbl;
    if (!pickIdsSet.has(id)) {
      logger.warn(
        `[ti:synthesize] output label "${lbl}" resolved to unknown id "${id}" — dropped (not in triage picks)`
      );
      return null;
    }
    return id;
  };

  // Normalize: model may omit required arrays when fromJSONSchema skips validation.
  const normalizedLeads: SynthesisLlmLead[] = Array.isArray(llmOutput.leads) ? llmOutput.leads : [];
  const normalizedNoMatch: SynthesisLlmNoMatch[] = Array.isArray(llmOutput.no_match)
    ? llmOutput.no_match
    : [];

  const leads: CorrelationFindingsLead[] = normalizedLeads.map((lead) => {
    const realIds = lead.candidate_labels.flatMap((lbl) => {
      const id = resolveLabel(lbl);
      return id !== null ? [id] : [];
    });

    const consolidatedCandidates = lead.candidate_labels.flatMap((lbl) => {
      const cc = labelToCollapsed.get(lbl);
      return (cc?.collapsed_members ?? []).map((m) => ({
        id: m.report_id,
        title: m.title,
        reason:
          m.collapse_reason === 'ioc_set_hash'
            ? 'Exact IOC fingerprint match'
            : 'Bilingual sibling article',
      }));
    });

    return {
      candidate_ids: realIds,
      title: lead.title,
      relationship: lead.relationship,
      confidence: lead.confidence,
      vertex_signal: lead.vertex_signal,
      bluf: lead.bluf,
      evidence: lead.evidence,
      gaps: lead.gaps,
      consolidated_candidates: consolidatedCandidates,
    };
  });

  const noMatch = normalizedNoMatch.flatMap((nm) => {
    const id = resolveLabel(nm.label);
    return id !== null ? [{ id, title: nm.title }] : [];
  });

  return {
    leads,
    no_match: noMatch,
    synthesis: {
      case_title: llmOutput.synthesis.case_title ?? undefined,
      bluf: llmOutput.synthesis.bluf,
      correlation_signal: llmOutput.synthesis.correlation_signal,
      reasoning: llmOutput.synthesis.reasoning,
      gaps: llmOutput.synthesis.gaps,
      next_steps: llmOutput.synthesis.next_steps,
      inferential_hops: llmOutput.synthesis.inferential_hops ?? undefined,
      atomic_ioc_overlap:
        llmOutput.synthesis.atomic_ioc_overlap != null
          ? {
              assessed: llmOutput.synthesis.atomic_ioc_overlap.assessed,
              note: llmOutput.synthesis.atomic_ioc_overlap.note ?? undefined,
            }
          : undefined,
    },
  };
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SynthesizeCorrelationsParams {
  synthesisModel: ScopedModel;
  logger: Logger;
  esClient: ElasticsearchClient;
  picks: readonly TriagePick[];
  /** Collapsed candidate pool from §4 — used to populate consolidated_candidates. */
  collapsed: readonly CollapsedCandidate[];
  /** Full text for the new case observation. */
  caseText: string;
  traceBuilder?: CostTraceBuilder;
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * §6 Synthesis — port of Mustard's JUDGE stage (mustard.py _build_judge_prompt +
 * run_judge + JUDGE SYSTEM PROMPT in prompts.yaml ~422–522).
 *
 * Receives the post-floor triage picks, fetches their full report text via a
 * bulk IDs query, builds the synthesis prompt with the case observation and
 * candidate reports (GUARDRAIL: no retrieval scores / rankings), calls the
 * Opus-tier model via withStructuredOutput, maps short labels back to real
 * report IDs, and populates consolidated_candidates from the §4 collapse data.
 *
 * Gracefully degrades on LLM failure: returns empty leads + no_match for all
 * picks so the caller always gets a valid CorrelationFindings.
 */
export const synthesizeCorrelations = async ({
  synthesisModel,
  logger,
  esClient,
  picks,
  collapsed,
  caseText,
  traceBuilder,
}: SynthesizeCorrelationsParams): Promise<CorrelationFindings> => {
  if (picks.length === 0) {
    return {
      leads: [],
      no_match: [],
      synthesis: {
        bluf: 'No candidates survived triage — no correlation evidence found.',
        correlation_signal: 'none',
        reasoning: 'No candidates survived triage — no correlation evidence found.',
        gaps: '',
        next_steps: [
          {
            priority: 'high',
            text: 'Widen the retrieval window or provide a more detailed case description.',
          },
          {
            priority: 'moderate',
            text: 'Lower the triage confidence floor (triageConfidenceFloor setting) if valid candidates are being filtered.',
          },
        ],
      },
    };
  }

  const connectorId = synthesisModel.connector.connectorId;
  const modelName =
    (synthesisModel.connector.config?.model as string | undefined) ??
    (synthesisModel.connector.config?.providerConfig as { model_id?: string } | undefined)
      ?.model_id;

  // 1. Index collapsed candidates by report_id for O(1) lookup.
  const collapsedByReportId = new Map<string, CollapsedCandidate>(
    collapsed.map((c) => [c.report_id, c])
  );

  // 2. Assign short labels (c01, c02…) to picks.
  //    Shuffle before labeling so neither the cNN number nor prompt position
  //    correlates with triage rank — the judge must not see the triage ranking.
  const shuffledPicks = [...picks];
  for (let i = shuffledPicks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPicks[i], shuffledPicks[j]] = [shuffledPicks[j], shuffledPicks[i]];
  }

  const labelWidth = String(shuffledPicks.length).length;
  const labelToCollapsed = new Map<string, CollapsedCandidate>();

  const labeledPicks = shuffledPicks.map((pick, i) => {
    const label = `c${String(i + 1).padStart(labelWidth, '0')}`;
    const cc = collapsedByReportId.get(pick.candidate_id);
    if (cc) labelToCollapsed.set(label, cc);
    return { label, pick };
  });

  // Build inverse label map: report_id → cNN (for candidate_labels output field).
  const candidateLabels: Record<string, string> = {};
  for (const { label, pick } of labeledPicks) {
    candidateLabels[pick.candidate_id] = label;
  }

  // 3. Bulk-fetch full report text for all picks.
  const pickIds = picks.map((p) => p.candidate_id);
  const bodyTextMap = await fetchCandidateBodyText(esClient, pickIds);

  // 4. Build candidates for the synthesis prompt.
  const candidatesForPrompt: CandidateForPrompt[] = labeledPicks.map(({ label, pick }) => {
    const entry = bodyTextMap.get(pick.candidate_id);
    const cc = labelToCollapsed.get(label);
    const consolidatedMembers = (cc?.collapsed_members ?? []).map((m) => ({
      title: m.title,
      reason:
        m.collapse_reason === 'ioc_set_hash' ? 'same IOC fingerprint' : 'bilingual sibling article',
    }));

    return {
      label,
      title: entry?.title ?? pick.candidate_id,
      sourceType: entry?.sourceType ?? 'unknown',
      sourceName: entry?.sourceName ?? '',
      bodyText: entry?.bodyText ?? '',
      consolidatedMembers,
    };
  });

  // 5. Build the full prompt (system instructions + user message).
  const prompt = buildSynthesisPrompt(caseText, candidatesForPrompt);

  // 6. Call the Opus-tier model with structured output.
  interface RawResult {
    raw: {
      response_metadata: Record<string, unknown>;
      // LangChain normalized tool calls (primary path for structured output args)
      tool_calls?: Array<{ args?: unknown }>;
      // Provider wire format fallback (e.g. Bedrock passes JSON string here)
      additional_kwargs?: {
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      };
      content?: unknown;
    };
    // withStructuredOutput returns undefined when Zod parsing fails (soft failure)
    parsed: SynthesisLlmOutput | undefined;
  }

  const structured = synthesisModel.chatModel.withStructuredOutput(synthesisLlmOutputSchema, {
    includeRaw: true,
  });

  try {
    const t0 = Date.now();
    const result = (await structured.invoke(prompt)) as RawResult;
    const wallMs = Date.now() - t0;
    logStageUsage(
      logger,
      'synthesize_correlations',
      connectorId,
      result.raw.response_metadata ?? {}
    );
    traceBuilder?.addStage({
      stage: 'synthesize_correlations',
      connectorId,
      modelName,
      metadata: result.raw.response_metadata ?? {},
      wallMs,
    });
    const llmOutput = result.parsed;

    // [TEMP DIAGNOSTIC — remove after root-cause confirmed]
    // Zod soft-failure: withStructuredOutput returned parsed=undefined without throwing.
    // Surface stop_reason, token counts, and exact Zod issue paths in the response so
    // the caller can diagnose truncation vs. schema-mismatch without needing server logs.
    if (!llmOutput) {
      const meta = result.raw.response_metadata ?? {};
      const { outputTokens } = extractUsageFromMetadata(meta);
      const stopReason = String(meta.stop_reason ?? meta.finish_reason ?? 'unknown');

      // Locate the raw structured-output args the wrapper produced.
      // Primary: tool_calls[0].args (LangChain normalized).
      // Fallback: additional_kwargs.tool_calls[0].function.arguments (Bedrock wire).
      const firstToolCallArgs: unknown =
        (result.raw.tool_calls ?? [])[0]?.args ??
        (() => {
          const argStr = (result.raw.additional_kwargs?.tool_calls ?? [])[0]?.function?.arguments;
          if (!argStr) return undefined;
          try {
            return JSON.parse(argStr) as unknown;
          } catch {
            return undefined;
          }
        })();

      const rawPreview = JSON.stringify(
        firstToolCallArgs ?? result.raw.content ?? '(no tool_calls or content)'
      ).slice(0, 800);

      let issuesSummary: string;
      if (firstToolCallArgs !== undefined) {
        const parseResult = synthesisLlmOutputSchema.safeParse(firstToolCallArgs);
        issuesSummary = parseResult.success
          ? '(schema valid — unknown parse failure)'
          : parseResult.error.issues
              .slice(0, 10)
              .map((iss) => `${JSON.stringify(iss.path)}:${iss.message}`)
              .join('; ');
      } else {
        issuesSummary = '(tool_calls[0].args was undefined)';
      }

      const diagnostic =
        `[TEMP DIAGNOSTIC — remove after root-cause] ` +
        `stop_reason=${stopReason} output_tokens=${outputTokens} ` +
        `zod_issues=[${issuesSummary}] raw_preview=${rawPreview}`;

      return {
        ...buildGracefulDegradation(picks, bodyTextMap, diagnostic),
        candidate_labels: candidateLabels,
      };
    }

    // 7. Map short labels → real report IDs and populate consolidated_candidates.
    //    Pass pickIdsSet as the safety net: any resolved ID not in the triage picks
    //    is dropped + warned rather than propagated as a phantom reference.
    //    Both this debug line and mapLlmOutputToFindings are inside the try block so
    //    any unexpected throw returns graceful degradation rather than escaping to the caller.
    logger.debug(
      `[ti:synthesize] complete — picks=${picks.length} leads=${llmOutput.leads?.length ?? 0} ` +
        `no_match=${llmOutput.no_match?.length ?? 0} signal=${
          llmOutput.synthesis.correlation_signal
        }`
    );

    const pickIdsSet = new Set(pickIds);
    const findings = mapLlmOutputToFindings(llmOutput, labelToCollapsed, pickIdsSet, logger);

    // Log-only invariant: every non-none vertex_signal must have a matching evidence item.
    const VERTICES = ['adversary', 'capability', 'infrastructure', 'victim'] as const;
    for (const lead of findings.leads) {
      for (const v of VERTICES) {
        if (lead.vertex_signal[v] !== 'none' && !lead.evidence.some((e) => e.vertex === v)) {
          logger.warn(
            `[ti:synthesize] lead "${lead.title}" rates ${v}=${lead.vertex_signal[v]} with no evidence`
          );
        }
      }
    }

    return { ...findings, candidate_labels: candidateLabels };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    const stackLines = (e.stack ?? '').split('\n').slice(0, 3).join(' | ');
    // [TEMP DIAGNOSTIC — remove after root-cause confirmed]
    let diagnostic =
      `[TEMP DIAGNOSTIC — remove after root-cause] caught throw: ` +
      `${e.name}: ${e.message} | stack: ${stackLines}`;
    if (isToolValidationError(e)) {
      diagnostic +=
        ` | errorsText=${e.meta.errorsText ?? '(none)'}` +
        ` | arguments=${(e.meta.arguments ?? '').slice(0, 1000)}`;
    }
    logger.warn(`[ti:synthesize] LLM call failed — ${diagnostic}`);
    return {
      ...buildGracefulDegradation(picks, bodyTextMap, diagnostic),
      candidate_labels: candidateLabels,
    };
  }
};
