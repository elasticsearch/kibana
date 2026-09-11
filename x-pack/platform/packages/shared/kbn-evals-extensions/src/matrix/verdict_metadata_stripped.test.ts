/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { scoresByPrefixToDatasets } from './query_matrix_scores';

/**
 * Regression guard for a silent upstream behavior change.
 *
 * `GET /internal/evals/experiments/{id}/scores` applies `_source_excludes:
 * UNBOUNDED_SCORE_FIELDS`, and that list includes `evaluator.metadata`
 * (added upstream in #286691, e7a90532a446). The verdict ladder reads the
 * verdict from `evaluator.metadata.correctnessAnalysis.summary`, so every
 * ladder-scored document arrives verdict-less on this route and is counted
 * as `unmappedVerdict` — i.e. the counter reports SUCCESSFUL grades as
 * rejected, and per-prefix columns silently lose their scores.
 *
 * These tests pin the shape the server actually returns.
 */
describe('verdict scoring when the server strips evaluator.metadata', () => {
  const makeStrippedDoc = (evaluatorName: string, score: number) =>
    ({
      example: { id: 'alert-analysis-a', index: 0 },
      task: { model: { id: 'anthropic-claude-4.8-opus' } },
      // NOTE: no `evaluator.metadata` — this is what the scores route returns.
      evaluator: { name: evaluatorName, score },
    } as never);

  it('does not count a stripped ladder doc as an unmapped verdict', () => {
    let counts: { unmappedVerdict: number } | undefined;

    scoresByPrefixToDatasets(
      [makeStrippedDoc('Factuality', 0.75), makeStrippedDoc('Relevance', 0.5)],
      ['alert-analysis'],
      {
        useVerdictLadder: true,
        onExcluded: (c: { unmappedVerdict: number }) => {
          counts = c;
        },
      } as never
    );

    // Before the fix this was 2: every successfully-graded doc was rejected.
    expect(counts?.unmappedVerdict ?? 0).toBe(0);
  });

  it('still produces a dataset for stripped ladder scores', () => {
    const datasets = scoresByPrefixToDatasets(
      [makeStrippedDoc('Factuality', 0.75)],
      ['alert-analysis'],
      { useVerdictLadder: true } as never
    );

    // Before the fix the score fell out entirely and the column went blank.
    expect(datasets.length).toBeGreaterThan(0);
  });
});
