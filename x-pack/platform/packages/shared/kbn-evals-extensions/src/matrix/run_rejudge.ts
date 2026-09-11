/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pLimit from 'p-limit';
import type { ReplayCell, PlanIssue } from './replay_plan';
import { replayExecutionId } from './replay_plan';

/** One evaluator verdict produced by a re-judge. */
export interface RejudgeScore {
  name: string;
  score: number | null;
  label?: string;
  explanation?: string;
}

/** Grades a single trajectory. Supplied by the CLI, faked in tests. */
export type CellJudge = (cell: ReplayCell) => Promise<{
  scores: RejudgeScore[];
  analyses?: Record<string, unknown>;
}>;

export interface RejudgeResult {
  /** Execution id the re-judged scores belong to, never the source's. */
  executionId: string;
  sourceExecutionId: string;
  modelId: string;
  exampleId: string;
  recordedAt: string;
  scores: RejudgeScore[];
  analyses?: Record<string, unknown>;
}

export interface RejudgeRunResult {
  results: RejudgeResult[];
  /** Cells the judge could not grade. Reported, never silently dropped. */
  failures: PlanIssue[];
}

/**
 * Re-grade planned cells with a new judge.
 *
 * Failures are collected rather than thrown: one judge error must not discard
 * the other several hundred cells, but it also must not vanish — a model whose
 * hardest examples all failed would otherwise average only its easy ones and
 * look better than it is.
 */
/**
 * An AggregateError's `message` is a fixed summary ("LLM could not complete task
 * successfully in 4 attempts") that hides the per-attempt causes in `errors`.
 * Reporting only the summary makes every cell fail with one indistinguishable
 * string, which is what a whole judge run looked like before the real cause --
 * schema validation rejecting the judge's tool output -- could be seen at all.
 */
export function describeJudgeFailure(error: unknown): string {
  if (error instanceof AggregateError) {
    const causes = [
      ...new Set(
        error.errors.map((inner) => (inner instanceof Error ? inner.message : String(inner)))
      ),
    ];
    return causes.length ? `${error.message}: ${causes.join('; ')}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function runRejudge({
  cells,
  judge,
  judgeTag,
  concurrency = 5,
}: {
  cells: ReplayCell[];
  judge: CellJudge;
  judgeTag: string;
  concurrency?: number;
}): Promise<RejudgeRunResult> {
  // Fail before spending judge calls: replayExecutionId rejects an empty tag,
  // and without a tag the results would overwrite the source execution's cell.
  replayExecutionId(cells[0]?.executionId ?? 'probe', judgeTag);

  const limit = pLimit(Math.max(1, concurrency));
  const results: RejudgeResult[] = [];
  const failures: PlanIssue[] = [];

  await Promise.all(
    cells.map((cell) =>
      limit(async () => {
        try {
          const { scores, analyses } = await judge(cell);
          results.push({
            executionId: replayExecutionId(cell.executionId, judgeTag),
            sourceExecutionId: cell.executionId,
            modelId: cell.modelId,
            exampleId: cell.exampleId,
            recordedAt: cell.recordedAt,
            scores,
            analyses,
          });
        } catch (error) {
          failures.push({
            executionId: cell.executionId,
            exampleId: cell.exampleId,
            reason: describeJudgeFailure(error),
          });
        }
      })
    )
  );

  // Deterministic order regardless of completion order, so artifacts diff cleanly.
  results.sort((a, b) => `${a.modelId}${a.exampleId}`.localeCompare(`${b.modelId}${b.exampleId}`));
  failures.sort((a, b) =>
    `${a.executionId}${a.exampleId}`.localeCompare(`${b.executionId}${b.exampleId}`)
  );

  return { results, failures };
}
