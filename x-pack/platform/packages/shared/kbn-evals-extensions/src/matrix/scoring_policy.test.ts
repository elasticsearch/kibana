/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  applyScoringPolicy,
  resolveVerdictScore,
  emptyExclusionCounts,
  tallyRejection,
  type PolicyScoreDoc,
} from './scoring_policy';

const noneExcluded = () => false;
const defaultExcluded = (name: string) =>
  ['Latency', 'Tool Calls', 'Input Tokens', 'Output Tokens', 'Cached Tokens', 'Skill Invoked'].some(
    (p) => name.startsWith(p)
  );

const doc = (
  over: Partial<PolicyScoreDoc['evaluator']> = {},
  taskModelId = 'model-a'
): PolicyScoreDoc => ({
  task: { model: { id: taskModelId } },
  evaluator: { name: 'Groundedness', score: 7, ...over },
});

describe('scoring policy', () => {
  describe('provenance filters', () => {
    it('drops a non-EIS judge only when requireEisJudge is set', () => {
      const d = doc({ model: { id: 'NousResearch/Hermes-3-Llama-3.1-70B' } });

      expect(applyScoringPolicy(d, {}, noneExcluded).score).toBe(7);
      expect(applyScoringPolicy(d, { requireEisJudge: true }, noneExcluded)).toEqual({
        score: null,
        rejected: 'non-eis',
      });
    });

    it('keeps an EIS-backed judge under requireEisJudge', () => {
      const d = doc({ model: { id: 'eis-gemini-3-1-pro' } });
      expect(applyScoringPolicy(d, { requireEisJudge: true }, noneExcluded).score).toBe(7);
    });

    it('drops a self-judged score only when excludeSelfJudged is set', () => {
      const d = doc({ model: { id: 'model-a' } }, 'model-a');

      expect(applyScoringPolicy(d, {}, noneExcluded).score).toBe(7);
      expect(applyScoringPolicy(d, { excludeSelfJudged: true }, noneExcluded)).toEqual({
        score: null,
        rejected: 'self-judged',
      });
    });

    it('keeps a cross-model judge under excludeSelfJudged', () => {
      const d = doc({ model: { id: 'model-b' } }, 'model-a');
      expect(applyScoringPolicy(d, { excludeSelfJudged: true }, noneExcluded).score).toBe(7);
    });
  });

  describe('non-quality exclusion', () => {
    it('drops evaluators excluded by name', () => {
      const d = doc({ name: 'Latency', score: 1200 });
      expect(applyScoringPolicy(d, {}, defaultExcluded)).toEqual({
        score: null,
        rejected: 'non-quality',
      });
    });

    it('drops dynamically-named excluded evaluators by prefix', () => {
      const d = doc({ name: 'Skill Invoked (alert-analysis)', score: 0 });
      expect(applyScoringPolicy(d, {}, defaultExcluded).rejected).toBe('non-quality');
    });

    it('drops a non-maximize direction even when the name is allowed', () => {
      const d = doc({ name: 'Groundedness', direction: 'minimize' });
      expect(applyScoringPolicy(d, {}, noneExcluded).rejected).toBe('non-quality');
    });

    it('keeps a maximize direction', () => {
      const d = doc({ direction: 'maximize' });
      expect(applyScoringPolicy(d, {}, noneExcluded).score).toBe(7);
    });
  });

  describe('verdict ladder', () => {
    it('ladders a categorical verdict instead of the continuous score', () => {
      const d = doc({
        name: 'Groundedness',
        score: 3,
        metadata: { groundednessAnalysis: { summary_verdict: 'GROUNDED' } },
      });
      const laddered = applyScoringPolicy(d, { useVerdictLadder: true }, noneExcluded).score;

      // GROUNDED sits at the top of the ladder (1), not the stored 3.
      expect(laddered).toBe(1);
    });

    it('maps a mid-ladder verdict to its ordinal value', () => {
      const d = doc({
        name: 'Groundedness',
        score: 9,
        metadata: { groundednessAnalysis: { summary_verdict: 'MINOR_HALLUCINATIONS' } },
      });
      expect(applyScoringPolicy(d, { useVerdictLadder: true }, noneExcluded).score).toBe(0.5);
    });

    it('reads the nested correctness block for Factuality', () => {
      const d = doc({
        name: 'Factuality',
        score: 2,
        metadata: { correctnessAnalysis: { summary: { factual_accuracy_summary: 'ACCURATE' } } },
      });
      // ACCURATE ladders to 1, replacing the stored continuous 2.
      expect(applyScoringPolicy(d, { useVerdictLadder: true }, noneExcluded).score).toBe(1);
    });

    it('falls back to the numeric grade when metadata was stripped server-side', () => {
      // 64% of golden persona docs retain metadata; rejecting the rest would
      // blank whole columns and report valid grades as excluded.
      const d = doc({ name: 'Groundedness', score: 7 });
      delete (d.evaluator as { metadata?: unknown }).metadata;

      expect(applyScoringPolicy(d, { useVerdictLadder: true }, noneExcluded).score).toBe(7);
    });

    it('passes through evaluators that have no verdict vocabulary', () => {
      const d = doc({ name: 'Trajectory', score: 5, metadata: {} });
      expect(resolveVerdictScore('Trajectory', d)).toBe(5);
    });

    it('reports an unmappable verdict rather than scoring it', () => {
      const d = doc({
        name: 'Groundedness',
        score: undefined,
        metadata: { groundednessAnalysis: { summary_verdict: 'not-a-known-verdict' } },
      });
      expect(applyScoringPolicy(d, { useVerdictLadder: true }, noneExcluded)).toEqual({
        score: null,
        rejected: 'unmapped-verdict',
      });
    });
  });

  describe('exclusion tallies', () => {
    it('counts each rejection kind separately', () => {
      const counts = emptyExclusionCounts();
      tallyRejection(counts, 'non-quality');
      tallyRejection(counts, 'non-eis');
      tallyRejection(counts, 'self-judged');
      tallyRejection(counts, 'self-judged');
      tallyRejection(counts, 'unmapped-verdict');
      tallyRejection(counts, undefined);

      expect(counts).toEqual({
        nonQuality: 1,
        nonEis: 1,
        selfJudged: 2,
        unmappedVerdict: 1,
      });
    });
  });

  describe('policy ordering', () => {
    it('rejects on provenance before laddering, so a dropped judge never scores', () => {
      const d = doc(
        {
          name: 'Groundedness',
          model: { id: 'model-a' },
          metadata: { groundednessAnalysis: { summary_verdict: 'GROUNDED' } },
        },
        'model-a'
      );

      expect(
        applyScoringPolicy(d, { excludeSelfJudged: true, useVerdictLadder: true }, noneExcluded)
      ).toEqual({ score: null, rejected: 'self-judged' });
    });
  });
});
