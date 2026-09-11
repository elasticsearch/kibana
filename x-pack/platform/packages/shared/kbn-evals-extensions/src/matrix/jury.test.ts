/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  aggregateJury,
  FACTUALITY_LADDER,
  GROUNDEDNESS_LADDER,
  RELEVANCE_LADDER,
  scoreVerdict,
  type JuryVote,
} from './jury';

const vote = (judgeId: string, score: number, verdict?: string): JuryVote => ({
  judgeId,
  score,
  verdict,
});

describe('aggregateJury', () => {
  it('takes the median of one vote per family', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 0.9),
      vote('eis-google-gemini-3-1-pro', 0.5),
      vote('eis-openai-gpt-5-4', 0.7),
    ]);
    expect(result.score).toBe(0.7);
    expect(result.decided).toBe(true);
    expect(result.families).toEqual(['anthropic', 'google', 'openai']);
  });

  it('ignores a single broken judge that returns 0', () => {
    // The whole point of a median: one judge failing to parse an output must
    // not be able to drag a good cell down to a failing-looking score.
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 0.9),
      vote('eis-google-gemini-3-1-pro', 0.92),
      vote('eis-openai-gpt-5-4', 0),
    ]);
    expect(result.score).toBe(0.9);
    // The disagreement is still surfaced rather than hidden.
    expect(result.disagreement).toBeCloseTo(0.92);
  });

  it('caps an over-represented family to one vote by default', () => {
    // Five Anthropic judges are one family voting five times, not a panel.
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 0.9),
      vote('eis-anthropic-claude-4.8-opus', 0.95),
      vote('eis-anthropic-claude-4.5-haiku', 0.85),
      vote('eis-google-gemini-3-1-pro', 0.2),
    ]);
    expect(result.counted).toHaveLength(2);
    expect(result.dropped).toHaveLength(2);
    expect(result.families).toEqual(['anthropic', 'google']);
    expect(result.score).toBeCloseTo(0.55);
  });

  it('honours a raised per-family cap', () => {
    const result = aggregateJury(
      [
        vote('eis-anthropic-claude-4.6-sonnet', 0.9),
        vote('eis-anthropic-claude-4.8-opus', 0.8),
        vote('eis-google-gemini-3-1-pro', 0.4),
      ],
      { maxVotesPerFamily: 2 }
    );
    expect(result.counted).toHaveLength(3);
    expect(result.score).toBe(0.8);
  });

  it('reports disagreement 0 when judges agree exactly', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 0.75),
      vote('eis-google-gemini-3-1-pro', 0.75),
    ]);
    expect(result.disagreement).toBe(0);
  });

  it('marks a single-vote panel undecided', () => {
    const result = aggregateJury([vote('eis-anthropic-claude-4.6-sonnet', 0.9)]);
    expect(result.decided).toBe(false);
    expect(result.score).toBe(0.9);
  });

  it('discards non-finite scores instead of poisoning the median', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', Number.NaN),
      vote('eis-google-gemini-3-1-pro', 0.6),
      vote('eis-openai-gpt-5-4', 0.8),
    ]);
    expect(result.counted).toHaveLength(2);
    expect(result.score).toBeCloseTo(0.7);
  });

  it('returns an undecided null result when every vote is unusable', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', Number.NaN),
      vote('eis-google-gemini-3-1-pro', Number.POSITIVE_INFINITY),
    ]);
    expect(result.score).toBeNull();
    expect(result.decided).toBe(false);
  });

  it('handles an empty panel', () => {
    const result = aggregateJury([]);
    expect(result.score).toBeNull();
    expect(result.decided).toBe(false);
    expect(result.families).toEqual([]);
  });

  it('averages the two middle votes for an even panel', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 0.4),
      vote('eis-google-gemini-3-1-pro', 0.6),
    ]);
    expect(result.score).toBeCloseTo(0.5);
  });

  it('detects unanimous categorical verdicts', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 1, 'GROUNDED'),
      vote('eis-google-gemini-3-1-pro', 0.85, 'GROUNDED'),
    ]);
    expect(result.verdictUnanimous).toBe(true);
  });

  it('reports a split verdict even when the scores are close', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 0.9, 'GROUNDED'),
      vote('eis-google-gemini-3-1-pro', 0.85, 'GROUNDED_WITH_DISCLOSURE'),
    ]);
    expect(result.verdictUnanimous).toBe(false);
  });

  it('does not claim unanimity when no verdicts were supplied', () => {
    const result = aggregateJury([
      vote('eis-anthropic-claude-4.6-sonnet', 0.9),
      vote('eis-google-gemini-3-1-pro', 0.9),
    ]);
    expect(result.verdictUnanimous).toBe(false);
  });
});

describe('scoreVerdict', () => {
  it('maps the groundedness ladder', () => {
    expect(scoreVerdict('GROUNDED', GROUNDEDNESS_LADDER)).toBe(1);
    expect(scoreVerdict('GROUNDED_WITH_DISCLOSURE', GROUNDEDNESS_LADDER)).toBe(0.85);
    expect(scoreVerdict('MINOR_HALLUCINATIONS', GROUNDEDNESS_LADDER)).toBe(0.5);
    expect(scoreVerdict('MAJOR_HALLUCINATIONS', GROUNDEDNESS_LADDER)).toBe(0);
  });

  it('maps the factuality and relevance ladders', () => {
    expect(scoreVerdict('ACCURATE', FACTUALITY_LADDER)).toBe(1);
    expect(scoreVerdict('MAJOR_INACCURACIES', FACTUALITY_LADDER)).toBe(0);
    expect(scoreVerdict('PARTIALLY_RELEVANT', RELEVANCE_LADDER)).toBe(0.5);
  });

  it('is case and padding insensitive', () => {
    expect(scoreVerdict('  grounded  ', GROUNDEDNESS_LADDER)).toBe(1);
  });

  it('returns null for an unrecognised verdict rather than scoring it 0', () => {
    // "No correctness analysis available" appears in real data; scoring it 0
    // would look identical to a hallucinating answer.
    expect(scoreVerdict('No correctness analysis available', FACTUALITY_LADDER)).toBeNull();
    expect(scoreVerdict('', GROUNDEDNESS_LADDER)).toBeNull();
    expect(scoreVerdict(undefined, GROUNDEDNESS_LADDER)).toBeNull();
  });

  it('does not resolve inherited object properties as verdicts', () => {
    expect(scoreVerdict('constructor', GROUNDEDNESS_LADDER)).toBeNull();
    expect(scoreVerdict('toString', GROUNDEDNESS_LADDER)).toBeNull();
  });
});
