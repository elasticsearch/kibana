/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mergeRejudgedScores, type GoldenCell, type RejudgedCell } from './merge_rejudged_scores';

const golden = (
  experimentId: string,
  datasetId: string,
  evaluatorName: string,
  score: number,
  judgeModelId?: string
): GoldenCell => ({ experimentId, datasetId, evaluatorName, score, judgeModelId });

const rejudged = (
  experimentId: string,
  datasetId: string,
  evaluatorName: string,
  score: number,
  judgeModelId: string
): RejudgedCell => ({ experimentId, datasetId, evaluatorName, score, judgeModelId });

describe('mergeRejudgedScores', () => {
  it('replaces the score and the judge of a re-judged cell', () => {
    const result = mergeRejudgedScores(
      [golden('exp-1', 'linux-curl', 'Criteria', 0.4, 'anthropic-claude-4.6-sonnet')],
      [rejudged('exp-1', 'linux-curl', 'Criteria', 0.9, 'google-gemini-3.1-pro')]
    );

    expect(result.replaced).toBe(1);
    expect(result.cells[0].score).toBe(0.9);
    expect(result.cells[0].judgeModelId).toBe('google-gemini-3.1-pro');
    expect(result.unmatched).toEqual([]);
  });

  it('leaves a cell the rejudge did not cover completely untouched', () => {
    const untouched = golden('exp-1', 'wmi-lateral', 'Rubric', 0.5, 'anthropic-claude-4.6-sonnet');
    const result = mergeRejudgedScores(
      [golden('exp-1', 'linux-curl', 'Criteria', 0.4, 'anthropic-claude-4.6-sonnet'), untouched],
      [rejudged('exp-1', 'linux-curl', 'Criteria', 0.9, 'google-gemini-3.1-pro')]
    );

    expect(result.replaced).toBe(1);
    expect(result.cells[1]).toEqual(untouched);
  });

  it('does not overwrite a different execution of the same model and column', () => {
    // Keying on anything less specific than experiment_id would let a rejudge
    // of exp-1 clobber exp-2, which is a different run of the same board cell.
    const other = golden('exp-2', 'linux-curl', 'Criteria', 0.5, 'anthropic-claude-4.6-sonnet');
    const result = mergeRejudgedScores(
      [golden('exp-1', 'linux-curl', 'Criteria', 0.4, 'anthropic-claude-4.6-sonnet'), other],
      [rejudged('exp-1', 'linux-curl', 'Criteria', 0.9, 'google-gemini-3.1-pro')]
    );

    expect(result.replaced).toBe(1);
    expect(result.cells[1]).toEqual(other);
  });

  it('reports a re-judged cell with no golden match instead of appending it', () => {
    const result = mergeRejudgedScores(
      [golden('exp-1', 'linux-curl', 'Criteria', 0.4)],
      [rejudged('exp-1', 'bits-mshta', 'Criteria', 0.9, 'google-gemini-3.1-pro')]
    );

    expect(result.replaced).toBe(0);
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].score).toBe(0.4);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].datasetId).toBe('bits-mshta');
  });

  it('distinguishes evaluators within the same execution and column', () => {
    const result = mergeRejudgedScores(
      [
        golden('exp-1', 'linux-curl', 'Criteria', 0.4),
        golden('exp-1', 'linux-curl', 'Rubric', 0.4),
      ],
      [rejudged('exp-1', 'linux-curl', 'Rubric', 0.9, 'google-gemini-3.1-pro')]
    );

    expect(result.cells[0].score).toBe(0.4);
    expect(result.cells[1].score).toBe(0.9);
    expect(result.replaced).toBe(1);
  });

  it('preserves board order and length so a partial merge cannot drop a row', () => {
    const board = [
      golden('exp-1', 'a', 'Criteria', 0.1),
      golden('exp-1', 'b', 'Criteria', 0.2),
      golden('exp-1', 'c', 'Criteria', 0.3),
    ];
    const result = mergeRejudgedScores(board, [
      rejudged('exp-1', 'b', 'Criteria', 0.9, 'google-gemini-3.1-pro'),
    ]);

    expect(result.cells).toHaveLength(3);
    expect(result.cells.map((c) => c.datasetId)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for an empty rejudge artifact', () => {
    const board = [golden('exp-1', 'a', 'Criteria', 0.1, 'anthropic-claude-4.5-haiku')];
    const result = mergeRejudgedScores(board, []);

    expect(result.replaced).toBe(0);
    expect(result.cells).toEqual(board);
    expect(result.unmatched).toEqual([]);
  });
});
