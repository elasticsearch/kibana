/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument } from '@kbn/evals-common';
import { scoresByPrefixToDatasets } from './query_matrix_scores';

/**
 * Document shapes mirror live persona-matrix score docs: Groundedness stores
 * `groundednessAnalysis.summary_verdict`, Factuality and Relevance share the
 * `correctnessAnalysis.summary` block.
 */
const doc = (over: {
  example: string;
  evaluator: string;
  score: number;
  judge?: string;
  task?: string;
  metadata?: Record<string, unknown>;
}): EvaluationScoreDocument =>
  ({
    example: { id: over.example },
    task: { model: { id: over.task ?? 'eis-openai-gpt-5-4' } },
    evaluator: {
      name: over.evaluator,
      score: over.score,
      model: { id: over.judge ?? 'eis-anthropic-claude-4.6-sonnet' },
      metadata: over.metadata,
    },
  } as unknown as EvaluationScoreDocument);

const grounded = (verdict: string) => ({
  groundednessAnalysis: { summary_verdict: verdict },
});

const correctness = (factual: string, relevance: string) => ({
  correctnessAnalysis: {
    summary: { factual_accuracy_summary: factual, relevance_summary: relevance },
  },
});

const meanOf = (
  datasets: ReturnType<typeof scoresByPrefixToDatasets>,
  dataset: string,
  evaluator: string
) =>
  datasets
    .find((d) => d.datasetName === dataset)
    ?.evaluators.find((e) => e.evaluatorName === evaluator)?.mean;

describe('scoresByPrefixToDatasets — default behaviour', () => {
  it('averages the stored continuous score when no options are passed', () => {
    const datasets = scoresByPrefixToDatasets(
      [
        doc({ example: 'alert-analysis-a', evaluator: 'Groundedness', score: 0.4 }),
        doc({ example: 'alert-analysis-b', evaluator: 'Groundedness', score: 0.8 }),
      ],
      ['alert-analysis']
    );

    expect(meanOf(datasets, 'alert-analysis', 'Groundedness')).toBeCloseTo(0.6, 5);
  });

  it('keeps non-EIS and self-judged docs when the policy is off', () => {
    const datasets = scoresByPrefixToDatasets(
      [
        doc({
          example: 'alert-analysis-a',
          evaluator: 'Groundedness',
          score: 1,
          judge: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
        }),
        doc({
          example: 'alert-analysis-b',
          evaluator: 'Groundedness',
          score: 0,
          judge: 'eis-openai-gpt-5-4',
          task: 'eis-openai-gpt-5-4',
        }),
      ],
      ['alert-analysis']
    );

    expect(datasets.find((d) => d.datasetName === 'alert-analysis')?.evaluators[0].count).toBe(2);
  });
});

describe('scoresByPrefixToDatasets — provenance policy', () => {
  const mixed = [
    doc({ example: 'alert-analysis-a', evaluator: 'Groundedness', score: 1 }),
    doc({
      example: 'alert-analysis-b',
      evaluator: 'Groundedness',
      score: 0,
      judge: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
    }),
    doc({
      example: 'alert-analysis-c',
      evaluator: 'Groundedness',
      score: 0,
      judge: 'eis-openai-gpt-5-4',
      task: 'eis-openai-gpt-5-4',
    }),
  ];

  it('drops non-EIS judges and reports the count', () => {
    const excluded: Array<Record<string, number>> = [];
    const datasets = scoresByPrefixToDatasets(mixed, ['alert-analysis'], {
      requireEisJudge: true,
      onExcluded: (c) => excluded.push({ ...c }),
    });

    expect(excluded[0].nonEis).toBe(1);
    // The self-judged doc survives because that gate is off.
    expect(meanOf(datasets, 'alert-analysis', 'Groundedness')).toBeCloseTo(0.5, 5);
  });

  it('drops self-judged docs and reports the count', () => {
    const excluded: Array<Record<string, number>> = [];
    scoresByPrefixToDatasets(mixed, ['alert-analysis'], {
      excludeSelfJudged: true,
      onExcluded: (c) => excluded.push({ ...c }),
    });

    expect(excluded[0].selfJudged).toBe(1);
  });

  it('applies both gates together, leaving only the clean doc', () => {
    const datasets = scoresByPrefixToDatasets(mixed, ['alert-analysis'], {
      requireEisJudge: true,
      excludeSelfJudged: true,
    });

    const evaluator = datasets.find((d) => d.datasetName === 'alert-analysis')?.evaluators[0];
    expect(evaluator?.count).toBe(1);
    expect(evaluator?.mean).toBe(1);
  });
});

describe('scoresByPrefixToDatasets — verdict ladder', () => {
  it('scores the Groundedness verdict, ignoring the continuous value', () => {
    // Continuous score is 0.13 but the verdict is GROUNDED: the ladder must
    // read the verdict, which is the whole point of the change.
    const datasets = scoresByPrefixToDatasets(
      [
        doc({
          example: 'alert-analysis-a',
          evaluator: 'Groundedness',
          score: 0.13,
          metadata: grounded('GROUNDED'),
        }),
      ],
      ['alert-analysis'],
      { useVerdictLadder: true }
    );

    expect(meanOf(datasets, 'alert-analysis', 'Groundedness')).toBe(1);
  });

  it('reads Factuality and Relevance from the shared correctness block', () => {
    const metadata = correctness('MINOR_INACCURACIES', 'IRRELEVANT');
    const datasets = scoresByPrefixToDatasets(
      [
        doc({ example: 'alert-analysis-a', evaluator: 'Factuality', score: 0.9, metadata }),
        doc({ example: 'alert-analysis-a', evaluator: 'Relevance', score: 0.9, metadata }),
      ],
      ['alert-analysis'],
      { useVerdictLadder: true }
    );

    expect(meanOf(datasets, 'alert-analysis', 'Factuality')).toBeCloseTo(0.5, 5);
    expect(meanOf(datasets, 'alert-analysis', 'Relevance')).toBe(0);
  });

  it('separates two verdicts that the continuous score conflates', () => {
    const datasets = scoresByPrefixToDatasets(
      [
        doc({
          example: 'alert-analysis-a',
          evaluator: 'Groundedness',
          score: 0.5,
          metadata: grounded('GROUNDED'),
        }),
        doc({
          example: 'alert-analysis-b',
          evaluator: 'Groundedness',
          score: 0.5,
          metadata: grounded('MAJOR_HALLUCINATIONS'),
        }),
      ],
      ['alert-analysis'],
      { useVerdictLadder: true }
    );

    // Identical continuous scores, opposite verdicts -> mean lands between.
    expect(meanOf(datasets, 'alert-analysis', 'Groundedness')).toBeCloseTo(0.5, 5);
  });

  it('excludes an unmapped verdict rather than scoring it zero', () => {
    // "No correctness analysis available" appears in real data; scoring it 0
    // is indistinguishable from a hallucinating answer.
    const excluded: Array<Record<string, number>> = [];
    const datasets = scoresByPrefixToDatasets(
      [
        doc({
          example: 'alert-analysis-a',
          evaluator: 'Factuality',
          score: 0.7,
          metadata: correctness('No correctness analysis available', 'RELEVANT'),
        }),
      ],
      ['alert-analysis'],
      { useVerdictLadder: true, onExcluded: (c) => excluded.push({ ...c }) }
    );

    expect(excluded[0].unmappedVerdict).toBe(1);
    expect(datasets).toHaveLength(0);
  });

  it('leaves contract evaluators on their continuous score', () => {
    const datasets = scoresByPrefixToDatasets(
      [doc({ example: 'alert-analysis-a', evaluator: 'Sequence Accuracy', score: 0.25 })],
      ['alert-analysis'],
      { useVerdictLadder: true }
    );

    expect(meanOf(datasets, 'alert-analysis', 'Sequence Accuracy')).toBe(0.25);
  });
});
