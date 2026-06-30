/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

// ---------------------------------------------------------------------------
// §8 Cost trace — per-stage token + cost + wall-time breakdown
// ---------------------------------------------------------------------------

const stageCostTraceSchema = z.object({
  stage: z.string(),
  connector_id: z.string(),
  model_name: z.string().optional(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cost_usd: z.number(),
  wall_ms: z.number().int(),
});

export const costTraceSchema = z.object({
  stages: z.array(stageCostTraceSchema),
  total_input_tokens: z.number().int(),
  total_output_tokens: z.number().int(),
  total_cost_usd: z.number(),
  total_wall_ms: z.number().int(),
});

export type StageCostTrace = z.infer<typeof stageCostTraceSchema>;
export type CostTrace = z.infer<typeof costTraceSchema>;

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

const correlationVertexSchema = z.enum(['adversary', 'capability', 'infrastructure', 'victim']);

const consolidatedCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  reason: z.string(),
});

const evidenceWeightSchema = z.enum([
  'smoking_gun',
  'supporting',
  'non_discriminatory',
  'counter',
  'decisive_counter',
]);

const evidenceItemSchema = z.object({
  vertex: correlationVertexSchema,
  weight: evidenceWeightSchema,
  text: z.string(),
});

// ---------------------------------------------------------------------------
// CorrelationFindings — the load-bearing artifact (renderer + evals + context
// handoff all consume this shape).
// ---------------------------------------------------------------------------

export const correlationFindingsLeadSchema = z.object({
  /** The primary candidate plus any members collapsed into this lead. */
  candidate_ids: z.array(z.string()).min(1),
  title: z.string(),
  relationship: z.enum(['same_campaign', 'same_actor', 'shared_tradecraft']),
  confidence: z.enum(['high', 'moderate', 'low']),
  /** Per-vertex signal strength across all four Diamond Model vertices. */
  vertex_signal: z.object({
    adversary: z.enum(['high', 'partial', 'none']),
    capability: z.enum(['high', 'partial', 'none']),
    infrastructure: z.enum(['high', 'partial', 'none']),
    victim: z.enum(['high', 'partial', 'none']),
  }),
  /** Short evidence-first narrative (Mustard BLUF voice). */
  bluf: z.string(),
  /** Discrete evidence items; renderer derives supporting/counter sections and gutter glyphs from weight. */
  evidence: z.array(evidenceItemSchema),
  /** What's missing; required for moderate / low confidence leads. */
  gaps: z.string(),
  /** Reports collapsed under this lead (see synthesize_correlations §6). */
  consolidated_candidates: z.array(consolidatedCandidateSchema),
});

export const correlationFindingsNoMatchSchema = z.object({
  id: z.string(),
  title: z.string(),
  vendor: z.string().optional(),
});

export const correlationFindingsSynthesisSchema = z.object({
  /** Case-level one-liner stating the basis of correlation. */
  bluf: z.string(),
  /** Overall cross-report correlation signal strength — NOT an actor identity claim. */
  correlation_signal: z.enum(['high', 'moderate', 'low', 'none']),
  reasoning: z.string(),
  gaps: z.string(),
  /** Prioritized actions — only high/moderate priority, ordered high-first. */
  next_steps: z.array(
    z.object({
      priority: z.enum(['high', 'moderate']),
      text: z.string(),
    })
  ),
  inferential_hops: z.number().int().optional(),
  atomic_ioc_overlap: z
    .object({
      assessed: z.boolean(),
      note: z.string().optional(),
    })
    .optional(),
  /** 3–8 word case label emitted by the synthesis LLM (e.g. "Lazarus Group supply-chain intrusion"). */
  case_title: z.string().optional(),
});

export const candidateMetaEntrySchema = z.object({
  title: z.string().optional(),
  vendor: z.string().optional(),
  url: z.string().optional(),
});

export const correlationFindingsSchema = z.object({
  leads: z.array(correlationFindingsLeadSchema),
  no_match: z.array(correlationFindingsNoMatchSchema),
  synthesis: correlationFindingsSynthesisSchema,
  trace: costTraceSchema.optional(),
  /** Per-vertex signal for the case under analysis (extracted from the case's own diamond). */
  case_vertex_signal: z
    .object({
      adversary: z.enum(['high', 'partial', 'none']),
      capability: z.enum(['high', 'partial', 'none']),
      infrastructure: z.enum(['high', 'partial', 'none']),
      victim: z.enum(['high', 'partial', 'none']),
    })
    .optional(),
  /** Maps each candidate doc ID to its short run label (e.g. 'c01'). */
  candidate_labels: z.record(z.string(), z.string()).optional(),
  /** Source metadata per candidate doc id — title, vendor name, and URL for display. */
  candidate_meta: z.record(z.string(), candidateMetaEntrySchema).optional(),
});

export type CorrelationFindingsLead = z.infer<typeof correlationFindingsLeadSchema>;
export type CorrelationFindingsNoMatch = z.infer<typeof correlationFindingsNoMatchSchema>;
export type CorrelationFindingsSynthesis = z.infer<typeof correlationFindingsSynthesisSchema>;
export type CorrelationFindings = z.infer<typeof correlationFindingsSchema>;
export type CandidateMetaEntry = z.infer<typeof candidateMetaEntrySchema>;
export type EvidenceWeight = z.infer<typeof evidenceWeightSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

// ---------------------------------------------------------------------------
// ClusterDeepSynthesis — seam only; route deferred to Phase 5a.
// Deep dives are REPL / agent-chat for MVP via the Agent Builder tool wrappers.
// ---------------------------------------------------------------------------

export const clusterDeepSynthesisSchema = z.object({
  unique_to_supporting: z.string(),
  divergent_evidence: z.array(z.string()),
  diff_from_initial: z.string(),
});

export type ClusterDeepSynthesis = z.infer<typeof clusterDeepSynthesisSchema>;
