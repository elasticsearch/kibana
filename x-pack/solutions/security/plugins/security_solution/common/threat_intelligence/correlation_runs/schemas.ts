/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  correlationFindingsSchema,
  costTraceSchema,
  candidateMetaEntrySchema,
} from '../correlation/schemas';

// ---------------------------------------------------------------------------
// Depth / status / stage enums
// ---------------------------------------------------------------------------

export const correlationDepthSchema = z.enum(['extract', 'knn', 'triage', 'full']);
export type CorrelationDepth = z.infer<typeof correlationDepthSchema>;

export const correlationRunStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed']);
export type CorrelationRunStatus = z.infer<typeof correlationRunStatusSchema>;

export const correlationRunStageSchema = z.enum([
  'extract',
  'search',
  'gap_fill',
  'dedup',
  'triage',
  'synthesize',
  'done',
]);
export type CorrelationRunStage = z.infer<typeof correlationRunStageSchema>;

// ---------------------------------------------------------------------------
// Per-depth result schemas — stored in the run record's `result` field.
//
// knn / triage results mirror the server-side TriagePick / TriageGroup /
// DiamondHit shapes verbatim so the common schema is strongly-typed without
// importing server-only modules.
// ---------------------------------------------------------------------------

const diamondVertexResultSchema = z.object({
  signal: z.string(),
  summary: z.string(),
});

export const extractDepthResultSchema = z.object({
  depth: z.literal('extract'),
  diamond: z.object({
    adversary: diamondVertexResultSchema,
    capability: diamondVertexResultSchema,
    infrastructure: diamondVertexResultSchema,
    victim: diamondVertexResultSchema,
  }),
  trace: costTraceSchema.optional(),
});
export type ExtractDepthResult = z.infer<typeof extractDepthResultSchema>;

const anchorHitSchema = z.object({
  report_id: z.string(),
  title: z.string(),
  match_breakdown: z.record(z.string(), z.unknown()),
});

const diamondHitSchema = z.object({
  report_id: z.string(),
  title: z.string(),
  overlap: z.number(),
  score: z.number(),
  vertex_scores: z.record(z.string(), z.number()),
});

const mergedCandidateSchema = z.object({
  report_id: z.string(),
  title: z.string(),
  overlap: z.number(),
  score: z.number(),
  vertex_scores: z.record(z.string(), z.number()),
  match_breakdown: z.record(z.string(), z.unknown()).optional(),
});

export const knnDepthResultSchema = z.object({
  depth: z.literal('knn'),
  anchor_hits: z.array(anchorHitSchema),
  diamond_hits: z.array(diamondHitSchema),
  merged: z.array(mergedCandidateSchema),
  candidate_meta: z.record(z.string(), candidateMetaEntrySchema).optional(),
  trace: costTraceSchema.optional(),
});
export type KnnDepthResult = z.infer<typeof knnDepthResultSchema>;

const triagePickSchema = z.object({
  candidate_id: z.string(),
  confidence: z.number(),
  justification: z.string(),
  vertex_scores: z.record(z.string(), z.number()).optional(),
  overlap: z.number().optional(),
  match_breakdown: z.record(z.string(), z.unknown()).optional(),
  retrieval_source: z.enum(['anchor', 'diamond', 'gap_fill']).optional(),
});

const triageGroupSchema = z.object({
  hypothesis: z.string(),
  candidates: z.array(
    z.object({
      candidate_id: z.string(),
      confidence: z.number(),
      justification: z.string(),
    })
  ),
});

const triagedOutCandidateSchema = z.object({
  candidate_id: z.string(),
  score: z.number(),
  reason: z.enum(['below_floor', 'not_selected']),
  confidence: z.number().optional(),
  justification: z.string().optional(),
  vertex_scores: z.record(z.string(), z.number()).optional(),
  overlap: z.number().optional(),
  match_breakdown: z.record(z.string(), z.unknown()).optional(),
  retrieval_source: z.enum(['anchor', 'diamond', 'gap_fill']).optional(),
});

export const triageDepthResultSchema = z.object({
  depth: z.literal('triage'),
  picks: z.array(triagePickSchema),
  groups: z.array(triageGroupSchema),
  triaged_out: z.array(triagedOutCandidateSchema).optional(),
  candidates_fed: z.number().int(),
  fallback_used: z.boolean(),
  candidate_meta: z.record(z.string(), candidateMetaEntrySchema).optional(),
  trace: costTraceSchema.optional(),
});
export type TriageDepthResult = z.infer<typeof triageDepthResultSchema>;

export const fullDepthResultSchema = z.object({
  depth: z.literal('full'),
  findings: correlationFindingsSchema,
});
export type FullDepthResult = z.infer<typeof fullDepthResultSchema>;

export const correlationRunResultSchema = z.union([
  extractDepthResultSchema,
  knnDepthResultSchema,
  triageDepthResultSchema,
  fullDepthResultSchema,
]);
export type CorrelationRunResult = z.infer<typeof correlationRunResultSchema>;

// ---------------------------------------------------------------------------
// Per-stage partial results — written incrementally as each phase completes.
// Allows polling callers to see intermediate output before the run finishes.
// ---------------------------------------------------------------------------

export const correlationRunPartialsSchema = z.object({
  extract: extractDepthResultSchema.optional(),
  knn: knnDepthResultSchema.optional(),
  triage: triageDepthResultSchema.optional(),
  synthesize: fullDepthResultSchema.optional(),
});
export type CorrelationRunPartials = z.infer<typeof correlationRunPartialsSchema>;

// ---------------------------------------------------------------------------
// Correlation run document
// ---------------------------------------------------------------------------

export const correlationRunSchema = z.object({
  runId: z.string(),
  spaceId: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  input_type: z.enum(['report_id', 'raw_text']),
  /** Stored for report_id mode so the GET endpoint can expose it. Not stored for raw_text. */
  report_id: z.string().optional(),
  /** First 200 chars of raw_text, or the report_id — used as display label in the list. */
  input_summary: z.string().optional(),
  /**
   * User-visible title: defaults to input_summary on create, set to the
   * LLM-generated case_title when a full run succeeds, user-editable thereafter.
   */
  title: z.string().optional(),
  depth: correlationDepthSchema,
  status: correlationRunStatusSchema,
  stage: correlationRunStageSchema.optional(),
  error: z.string().optional(),
  result: correlationRunResultSchema.optional(),
  /**
   * Per-stage output written incrementally as each pipeline phase completes.
   * Polling callers can read partial results before the run reaches succeeded/failed.
   */
  partials: correlationRunPartialsSchema.optional(),
});
export type CorrelationRun = z.infer<typeof correlationRunSchema>;

// ---------------------------------------------------------------------------
// API request / response schemas
// ---------------------------------------------------------------------------

export const createCorrelationRunRequestSchema = z
  .object({
    input_type: z.enum(['report_id', 'raw_text']),
    report_id: z.string().min(1).optional(),
    raw_text: z.string().min(1).optional(),
    depth: correlationDepthSchema,
  })
  .refine(
    (b) =>
      (b.input_type === 'report_id' && Boolean(b.report_id) && !b.raw_text) ||
      (b.input_type === 'raw_text' && Boolean(b.raw_text) && !b.report_id),
    {
      message:
        'Provide report_id when input_type is report_id, or raw_text when input_type is raw_text; not both',
    }
  );
export type CreateCorrelationRunRequest = z.infer<typeof createCorrelationRunRequestSchema>;

export const correlationRunSummarySchema = correlationRunSchema.pick({
  runId: true,
  input_type: true,
  input_summary: true,
  title: true,
  depth: true,
  status: true,
  stage: true,
  createdAt: true,
  updatedAt: true,
});
export type CorrelationRunSummary = z.infer<typeof correlationRunSummarySchema>;
