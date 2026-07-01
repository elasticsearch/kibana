/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Example, TaskOutput } from '@kbn/evals';

/**
 * A criterion line for the LLM judge. Plain strings get weight 1; the
 * structured form lets a case mark a single criterion as load-bearing so the
 * Criteria score actually moves when frontier models miss the implicit
 * constraint (instead of being diluted by easy adjacent criteria that they
 * always pass). Per-criterion weights are handled by the shared
 * `createCriteriaEvaluator` in `@kbn/evals` — sum of passing weights / sum of
 * all weights.
 */
export type WeightedCriterion = string | { text: string; score: number };

/**
 * Which authoring approach an example targets.
 * - `shared` (default): scored on the final artifact, applicable in any mode.
 * - `tools-only`: relies on a specific multi-tool trajectory.
 * - `composite-only`: relies on the composite `generate_workflow` agent's contract.
 *
 * The runtime mode is selected via `KBN_EVAL_AUTHORING_MODE` (see
 * `skipCompositeMode` in `./evaluators`). Tracked in security-team#17399.
 */
export type AuthoringMode = 'shared' | 'tools-only' | 'composite-only';

export interface LiquidExpectation {
  /** The Liquid reference, e.g. "steps.create_case.output.id" or "event.alerts" */
  ref: string;
  /** Expected resolution context — used by createLiquidCorrectnessEvaluator */
  resolvesTo?: 'step-output' | 'foreach-item' | 'event-field' | 'consts';
}

export interface StructuralExpectations {
  expectedStepCount?: number | { min: number; max: number };
  expectedStepTypes?: string[];
  expectedStepNames?: string[];
  /** Liquid template chains to validate for correctness (field resolution), not just presence. */
  expectedLiquidChains?: LiquidExpectation[];
  /**
   * Opt-in shape assertion for cases that should produce a bulk-indexing step.
   * When set, `BulkOperationsShape` checks that an `elasticsearch.bulk` step's
   * `operations` is an array (or a Liquid reference), or that an
   * `elasticsearch.request` step pointing at `_bulk` uses NDJSON-shaped body.
   * Catches the real-world failure of agents shipping a flat array of docs to
   * `elasticsearch.bulk` (`operations.every is not a function`) or stringified
   * JSON bodies to `_bulk`.
   */
  expectsBulkOperationShape?: boolean;
}

export interface EfficiencyExpectations {
  /** Maximum tool calls allowed before score degrades (tiered penalty). */
  expectedMaxToolCalls?: number;
  /** Golden-path tool sequence for trajectory scoring. */
  expectedToolSequence?: string[];
}

export interface WorkflowEditExample extends Example {
  input: {
    instruction: string;
    initialYaml: string;
  };
  output: {
    criteria: WeightedCriterion[];
    expectedToolIds?: string[];
    preservedStepNames?: string[];
  } & StructuralExpectations &
    EfficiencyExpectations;
  metadata?: {
    category?: string;
    authoringMode?: AuthoringMode;
  };
}

export interface WorkflowCreateExample extends Example {
  input: {
    instruction: string;
  };
  output: {
    criteria: WeightedCriterion[];
  } & StructuralExpectations &
    EfficiencyExpectations;
  metadata?: {
    category?: string;
    authoringMode?: AuthoringMode;
  };
}

export type WorkflowTaskOutput = TaskOutput & {
  messages: Array<{ message: string }>;
  steps?: Array<{
    type?: string;
    tool_id?: string;
    params?: Record<string, unknown>;
    results?: unknown[];
  }>;
  errors: unknown[];
  resultYaml?: string;
  latencyMs?: number;
  /** Set by self-correction spec: turn index (1-based) at which valid YAML was produced; null if never. */
  turnsToRecovery?: number | null;
};

export interface MultiTurnWorkflowEditExample extends Example {
  input: {
    initialYaml: string;
    /** Ordered list of user turns. Each is sent in a separate `converse` call, threading conversationId. */
    turns: Array<{ instruction: string }>;
  };
  output: {
    criteria: WeightedCriterion[];
    preservedStepNames?: string[];
  } & StructuralExpectations &
    EfficiencyExpectations;
  metadata?: {
    category?: string;
    authoringMode?: AuthoringMode;
  };
}

export interface SelfCorrectionExample extends Example {
  input: {
    /** Intentionally broken YAML to inject as the starting attachment */
    brokenYaml: string;
    brokenKind: 'syntax' | 'semantic';
    /** The user message that accompanies the broken YAML, e.g. "this workflow doesn't run, please fix it" */
    instruction: string;
  };
  output: {
    /** Max conversation turns before scoring recovery as failed */
    maxTurns: number;
    criteria: WeightedCriterion[];
  };
  metadata?: {
    category?: string;
    authoringMode?: AuthoringMode;
  };
}

/** Scenario where the agent should refuse, push back, or ask for clarification rather than produce YAML. */
export interface NegativeWorkflowExample extends Example {
  input: {
    instruction: string;
    /** Optional starting YAML context (for edit-context negatives like "add error handling" with no workflow) */
    initialYaml?: string;
  };
  output: {
    /**
     * Why this is a negative case — used by the spec to set metadata.category = 'negative'
     * and route through createRejectionEvaluator + createCriteriaEvaluator on refusal text.
     */
    expectedRefusalReason:
      | 'ambiguous'
      | 'impossible'
      | 'out-of-scope'
      | 'unsupported-feature'
      | 'unsafe';
    /** LLM-judge criteria applied to the agent's refusal / clarification text, NOT to resultYaml */
    criteria: WeightedCriterion[];
  };
  metadata?: {
    category: 'negative';
    authoringMode?: AuthoringMode;
    [key: string]: unknown;
  };
}
