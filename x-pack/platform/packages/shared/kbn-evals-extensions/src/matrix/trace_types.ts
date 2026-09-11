/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** A single step in the agent's reasoning + tool-call trace. */
export interface TraceStep {
  type: 'reasoning' | 'tool' | 'skill';
  /** Reasoning text (for `type: 'reasoning'`). */
  text?: string;
  /** Tool call ID (for `type: 'tool'`). */
  toolId?: string;
  /** Tool call parameters (for `type: 'tool'`). */
  toolParams?: string;
  /**
   * Skills selected (for `type: 'skill'`).
   *
   * Agent Builder emits skill entries as objects (`{ id, name, path, description }`),
   * not bare strings. This was typed `string[]`, so `.join()` in the renderer produced
   * `[object Object]` for every skill step and TypeScript could not catch it. Accept
   * both shapes and normalise at the render boundary via `skillLabel`.
   */
  skills?: Array<string | { id?: string; name?: string }>;
}

/** Trace data for a single (model, column) pair. */
export interface MatrixTraceEntry {
  /** The initial user question from the eval dataset. */
  question?: string;
  /** Ordered list of tool IDs the agent called. */
  toolTrail?: string[];
  /** The agent's final answer (markdown). */
  answer?: string;
  /** Full reasoning + tool-call step trace. */
  steps?: TraceStep[];
  /** Number of steps (cached for summary table). */
  stepCount?: number;
  /** Number of tool calls (cached for summary table). */
  toolCount?: number;
  /**
   * Per-evaluator mean scores for this example within the experiment
   * (evaluator name → mean over repetitions). Lets the report render a
   * per-prompt score instead of repeating the column aggregate on every card.
   */
  scores?: Record<string, number>;
  /** Number of repetitions aggregated into this entry's scores. */
  repetitions?: number;
  /**
   * Per-evaluator spread across repetitions (evaluator name → max - min).
   * `scores` alone cannot distinguish a stable cell from a volatile one: a
   * cell scoring 10/10/10 and one scoring 0/10/20 both report a mean of 10.
   * Only populated when `repetitions > 1`; an absent entry means the cell was
   * measured once and its stability is unknown, not that it is stable.
   */
  spread?: Record<string, number>;
  /**
   * Ordered tool identifiers observed in each repetition. Invocation ids are
   * excluded because providers generate a new id for every call.
   */
  repTrails?: string[][];
  /**
   * Final answer text per repetition, index-aligned with `repTrails`. Path
   * churn and answer churn are only weakly related (r=0.14 on the pilot), so
   * the board must measure them separately rather than implying one from the
   * other.
   */
  repAnswers?: string[];
  /**
   * The example's declared path contract, read from
   * `example.metadata.pathContract`. Absent on corpora predating the field.
   */
  pathContract?: 'rankable' | 'candidate' | 'probe';
  /** Execution ids that contributed the repetitions above, for auditability. */
  repExecutionIds?: string[];
}

/**
 * Map of trace entries keyed by `${modelId}:${columnId}`.
 * Lookups use the same model/column IDs as the matrix config.
 */
export type MatrixTraceData = Record<string, MatrixTraceEntry>;

/** Build the trace-data lookup key. */
export const traceKey = (modelId: string, columnId: string): string => `${modelId}:${columnId}`;
