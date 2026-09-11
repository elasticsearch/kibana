/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  bootstrapInterval,
  pairedComparison,
  buildTiers,
  buildFamilyRecommendations,
  buildEfficiency,
  buildComparisonReport,
  type ModelObservation,
  type ComparisonConfig,
} from './model_comparison';

const COLUMNS = [
  'alert-analysis-a',
  'alert-analysis-b',
  'alert-analysis-c',
  'threat-hunting-a',
  'threat-hunting-b',
  'threat-hunting-c',
];

const familyOf = (columnId: string): string => columnId.replace(/-[abc]$/, '');

const config: ComparisonConfig = {
  columns: COLUMNS,
  familyOf,
  minColumns: 6,
  resamples: 600,
  seed: 42,
};

const observation = (
  modelId: string,
  modelLabel: string,
  values: number[],
  extra: Partial<ModelObservation> = {}
): ModelObservation => ({
  modelId,
  modelLabel,
  scores: Object.fromEntries(COLUMNS.map((c, i) => [c, values[i]])),
  ...extra,
});

const rngOf = (seed: number): (() => number) => {
  const modulus = 2147483647;
  let state = Math.floor(Math.abs(seed)) % modulus;
  if (state === 0) state = 1;
  return () => {
    state = (state * 16807) % modulus;
    return (state - 1) / (modulus - 1);
  };
};

describe('bootstrapInterval', () => {
  it('brackets the observed mean', () => {
    const ci = bootstrapInterval([5, 6, 7, 8, 5, 6], 500, rngOf(1));
    expect(ci.mean).toBeCloseTo(6.1667, 3);
    expect(ci.low).toBeLessThanOrEqual(ci.mean);
    expect(ci.high).toBeGreaterThanOrEqual(ci.mean);
  });

  it('reports a zero-width interval for a constant model', () => {
    const ci = bootstrapInterval([7, 7, 7, 7], 500, rngOf(2));
    expect(ci.low).toBeCloseTo(7, 6);
    expect(ci.high).toBeCloseTo(7, 6);
  });

  it('widens the interval as the model becomes more erratic', () => {
    const steady = bootstrapInterval([6, 6.1, 5.9, 6, 6.1, 5.9], 800, rngOf(3));
    const erratic = bootstrapInterval([1, 10, 2, 9, 3, 8], 800, rngOf(3));
    expect(erratic.high - erratic.low).toBeGreaterThan(steady.high - steady.low);
  });

  it('cannot form an interval from a single observation', () => {
    const ci = bootstrapInterval([8], 500, rngOf(4));
    expect(ci.low).toBe(8);
    expect(ci.high).toBe(8);
  });
});

describe('pairedComparison', () => {
  it('separates models that differ on every prompt', () => {
    const result = pairedComparison([9, 9, 9, 9, 9, 9], [3, 3, 3, 3, 3, 3], 500, rngOf(5));
    expect(result.probability).toBe(1);
    expect(result.low).toBeGreaterThan(0);
  });

  it('leaves 0 inside the interval for models that trade wins', () => {
    const result = pairedComparison([9, 2, 9, 2, 9, 2], [2, 9, 2, 9, 2, 9], 800, rngOf(6));
    expect(result.low).toBeLessThan(0);
    expect(result.high).toBeGreaterThan(0);
  });

  it('detects a small but consistent edge that an unpaired view would bury', () => {
    // Prompt difficulty swamps the gap; pairing cancels it out.
    const a = [9.4, 2.4, 7.4, 1.4, 8.4, 3.4];
    const b = [9.0, 2.0, 7.0, 1.0, 8.0, 3.0];
    const result = pairedComparison(a, b, 1000, rngOf(7));
    expect(result.probability).toBe(1);
    expect(result.low).toBeGreaterThan(0);
  });

  it('returns an undecided result for mismatched inputs', () => {
    expect(pairedComparison([1, 2], [1], 100, rngOf(8)).probability).toBe(0.5);
    expect(pairedComparison([], [], 100, rngOf(8)).probability).toBe(0.5);
  });
});

describe('buildTiers', () => {
  it('groups models that cannot be told apart into one tier', () => {
    const { tiers } = buildTiers(
      [
        observation('a', 'Model A', [7, 6, 8, 7, 6, 8]),
        observation('b', 'Model B', [6.9, 6.1, 7.9, 7.1, 6.1, 7.9]),
        observation('c', 'Model C', [7.1, 5.9, 8.1, 6.9, 5.9, 8.1]),
      ],
      config
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0].members.map((m) => m.modelLabel)).toEqual(['Model A', 'Model B', 'Model C']);
  });

  it('splits a clearly weaker model into its own tier', () => {
    const { tiers } = buildTiers(
      [
        observation('a', 'Strong', [9, 9, 9, 9, 9, 9]),
        observation('b', 'Weak', [2, 2, 2, 2, 2, 2]),
      ],
      config
    );
    expect(tiers).toHaveLength(2);
    expect(tiers[0].members[0].modelLabel).toBe('Strong');
    expect(tiers[1].members[0].modelLabel).toBe('Weak');
  });

  it('orders within a tier alphabetically, never by an insignificant decimal', () => {
    const { tiers } = buildTiers(
      [
        observation('z', 'Zeta', [7.01, 7.01, 7.01, 7.01, 7.01, 7.01]),
        observation('a', 'Alpha', [7, 7, 7, 7, 7, 7]),
      ],
      config
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0].members.map((m) => m.modelLabel)).toEqual(['Alpha', 'Zeta']);
  });

  it('does not split a tier on a statistically clean but trivial gap', () => {
    // Zero-variance rows separate on any gap at all, so statistical
    // significance alone would publish a 0.01 "win" as a tier boundary.
    const { tiers } = buildTiers(
      [
        observation('z', 'Zeta', [7.01, 7.01, 7.01, 7.01, 7.01, 7.01]),
        observation('a', 'Alpha', [7, 7, 7, 7, 7, 7]),
      ],
      { ...config, minMeaningfulDifference: 0.25 }
    );
    expect(tiers).toHaveLength(1);
  });

  it('still splits once the gap clears the practical floor', () => {
    const { tiers } = buildTiers(
      [observation('z', 'Zeta', [8, 8, 8, 8, 8, 8]), observation('a', 'Alpha', [7, 7, 7, 7, 7, 7])],
      { ...config, minMeaningfulDifference: 0.25 }
    );
    expect(tiers).toHaveLength(2);
  });

  it('refuses to rank a partial row against complete ones', () => {
    const partial: ModelObservation = {
      modelId: 'p',
      modelLabel: 'Partial',
      // A 10.0 on 2 of 6 columns must not outrank a complete 7.0 row.
      scores: { 'alert-analysis-a': 10, 'alert-analysis-b': 10 },
    };
    const { tiers, excluded } = buildTiers(
      [observation('a', 'Complete', [7, 7, 7, 7, 7, 7]), partial],
      config
    );
    expect(excluded).toEqual([
      { modelId: 'p', modelLabel: 'Partial', scoredColumns: 2, requiredColumns: 6 },
    ]);
    expect(tiers.flatMap((t) => t.members.map((m) => m.modelId))).not.toContain('p');
  });

  it('is deterministic across runs so a published report does not drift', () => {
    const models = [
      observation('a', 'A', [7, 6, 8, 7, 6, 8]),
      observation('b', 'B', [5, 5, 6, 5, 5, 6]),
      observation('c', 'C', [9, 9, 8, 9, 9, 9]),
    ];
    expect(JSON.stringify(buildTiers(models, config))).toEqual(
      JSON.stringify(buildTiers(models, config))
    );
  });
});

describe('buildFamilyRecommendations', () => {
  it('names a different leader per family when models specialise', () => {
    const recs = buildFamilyRecommendations(
      [
        observation('a', 'AlertSpecialist', [9, 9, 9, 3, 3, 3]),
        observation('b', 'HuntSpecialist', [3, 3, 3, 9, 9, 9]),
      ],
      config
    );
    const alert = recs.find((r) => r.family === 'alert-analysis')!;
    const hunt = recs.find((r) => r.family === 'threat-hunting')!;
    expect(alert.leaders).toEqual(['AlertSpecialist']);
    expect(hunt.leaders).toEqual(['HuntSpecialist']);
  });

  it('surfaces a model that leads one family and trails another', () => {
    const recs = buildFamilyRecommendations(
      [
        observation('a', 'Lopsided', [9, 9, 9, 2, 2, 2]),
        observation('b', 'Even', [6, 6, 6, 6, 6, 6]),
      ],
      config
    );
    expect(recs.find((r) => r.family === 'alert-analysis')!.leaders).toContain('Lopsided');
    expect(recs.find((r) => r.family === 'threat-hunting')!.laggards).toContain('Lopsided');
  });

  it('reports co-leaders rather than inventing a single winner', () => {
    const recs = buildFamilyRecommendations(
      [observation('a', 'A', [8, 8, 8, 5, 5, 5]), observation('b', 'B', [8.1, 8.1, 8.1, 5, 5, 5])],
      config
    );
    expect(recs.find((r) => r.family === 'alert-analysis')!.leaders).toEqual(['A', 'B']);
  });

  it('skips models missing part of a family', () => {
    const partial: ModelObservation = {
      modelId: 'p',
      modelLabel: 'Partial',
      scores: { 'alert-analysis-a': 10 },
    };
    const recs = buildFamilyRecommendations(
      [observation('a', 'Full', [7, 7, 7, 7, 7, 7]), partial],
      config
    );
    expect(recs.find((r) => r.family === 'alert-analysis')!.leaders).toEqual(['Full']);
  });
});

describe('buildEfficiency', () => {
  it('marks a model beaten on quality, latency and tokens at once', () => {
    const rows = buildEfficiency(
      [
        observation('fast', 'Fast', [7, 7, 7, 7, 7, 7], {
          latencySeconds: 25,
          inputTokens: 130000,
        }),
        observation('slow', 'Slow', [6.9, 6.9, 6.9, 6.9, 6.9, 6.9], {
          latencySeconds: 144,
          inputTokens: 696000,
        }),
      ],
      config
    );
    expect(rows.find((r) => r.modelId === 'slow')!.dominatedBy).toBe('Fast');
    expect(rows.find((r) => r.modelId === 'fast')!.dominatedBy).toBeUndefined();
  });

  it('keeps a slower model that buys real quality on the frontier', () => {
    const rows = buildEfficiency(
      [
        observation('fast', 'Fast', [5, 5, 5, 5, 5, 5], {
          latencySeconds: 20,
          inputTokens: 100000,
        }),
        observation('good', 'Good', [9, 9, 9, 9, 9, 9], {
          latencySeconds: 90,
          inputTokens: 500000,
        }),
      ],
      config
    );
    expect(rows.every((r) => r.dominatedBy === undefined)).toBe(true);
  });

  it('never reports a model as efficient just because cost data is missing', () => {
    const rows = buildEfficiency(
      [
        observation('measured', 'Measured', [7, 7, 7, 7, 7, 7], {
          latencySeconds: 30,
          inputTokens: 100000,
        }),
        observation('unmeasured', 'Unmeasured', [4, 4, 4, 4, 4, 4]),
      ],
      config
    );
    const unmeasured = rows.find((r) => r.modelId === 'unmeasured')!;
    expect(unmeasured.dominatedBy).toBeUndefined();
    expect(unmeasured.latencySeconds).toBeUndefined();
  });

  it('does not let an unmeasured model dominate or be dominated on absent axes', () => {
    // Removing the missing-data guards makes JS compare `undefined` with `<=`,
    // which is always false -- so an unmeasured model silently becomes an
    // undominated "frontier" entry. Ordering it FIRST makes that visible:
    // without the guard it would dominate the measured row behind it.
    const rows = buildEfficiency(
      [
        observation('unmeasured', 'Unmeasured', [9, 9, 9, 9, 9, 9]),
        observation('measured', 'Measured', [7, 7, 7, 7, 7, 7], {
          latencySeconds: 30,
          inputTokens: 100000,
        }),
      ],
      config
    );
    expect(rows.find((r) => r.modelId === 'unmeasured')!.dominatedBy).toBeUndefined();
    // The measured model must not be dominated BY the unmeasured one: we never
    // measured its cost, so we cannot claim it is cheaper or faster.
    expect(rows.find((r) => r.modelId === 'measured')!.dominatedBy).toBeUndefined();
  });

  it('treats latency as a real axis, not just tokens', () => {
    // Same quality and tokens, but one model is 4x slower: it is dominated only
    // if the latency axis is actually evaluated.
    const rows = buildEfficiency(
      [
        observation('quick', 'Quick', [7, 7, 7, 7, 7, 7], {
          latencySeconds: 25,
          inputTokens: 100000,
        }),
        observation('sluggish', 'Sluggish', [7, 7, 7, 7, 7, 7], {
          latencySeconds: 100,
          inputTokens: 100000,
        }),
      ],
      config
    );
    expect(rows.find((r) => r.modelId === 'sluggish')!.dominatedBy).toBe('Quick');
    expect(rows.find((r) => r.modelId === 'quick')!.dominatedBy).toBeUndefined();
  });

  it('treats token cost as a real axis, not just latency', () => {
    // Same quality and latency, but one model burns 5x the tokens: it is
    // dominated only if the token axis is actually evaluated.
    const rows = buildEfficiency(
      [
        observation('lean', 'Lean', [7, 7, 7, 7, 7, 7], {
          latencySeconds: 40,
          inputTokens: 100000,
        }),
        observation('greedy', 'Greedy', [7, 7, 7, 7, 7, 7], {
          latencySeconds: 40,
          inputTokens: 500000,
        }),
      ],
      config
    );
    expect(rows.find((r) => r.modelId === 'greedy')!.dominatedBy).toBe('Lean');
    expect(rows.find((r) => r.modelId === 'lean')!.dominatedBy).toBeUndefined();
  });
});

describe('buildComparisonReport', () => {
  it('warns when the whole field lands in a single tier', () => {
    const report = buildComparisonReport(
      [
        observation('a', 'A', [7, 6, 8, 7, 6, 8]),
        observation('b', 'B', [6.9, 6.1, 7.9, 7.1, 6.1, 7.9]),
      ],
      config
    );
    expect(report.allTiedWarning).toBe(true);
  });

  it('does not warn once a real separation exists', () => {
    const report = buildComparisonReport(
      [observation('a', 'A', [9, 9, 9, 9, 9, 9]), observation('b', 'B', [2, 2, 2, 2, 2, 2])],
      config
    );
    expect(report.allTiedWarning).toBe(false);
    expect(report.tiers).toHaveLength(2);
  });
});
