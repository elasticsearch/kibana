/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Decision-oriented comparison over an already-built matrix.
 *
 * The per-prompt grid is sound evidence; the ranked `Overall` mean laid over it
 * is not. Two properties of the real data drive everything here:
 *
 *  1. Adjacent `Overall` ranks are not distinguishable. Paired bootstrap over
 *     the prompt columns puts 0 inside the 95% CI for every adjacent pair, so
 *     a sorted list invents precision the evidence does not carry.
 *  2. Task families measure independent skills (mean inter-family rank
 *     correlation ~0.04, and a third of family pairs anti-correlate). There is
 *     no single "good at security" axis for a mean to summarise, and the
 *     `Overall` leader wins only one of ten families.
 *
 * So this module answers the questions a reader actually has -- which model for
 * MY task, at what cost, and how much should I trust it -- instead of ordering
 * models by a decimal that is inside its own noise floor.
 */

/** Quality/cost facts for one model, already reduced from the matrix + traces. */
export interface ModelObservation {
  readonly modelId: string;
  readonly modelLabel: string;
  readonly openSource?: boolean;
  /** Per-column scores. Only complete rows are comparable; see `minColumns`. */
  readonly scores: Readonly<Record<string, number>>;
  /** Mean end-to-end seconds, when the instrument reported it. */
  readonly latencySeconds?: number;
  /** Mean input tokens, when the instrument reported it. */
  readonly inputTokens?: number;
}

export interface ComparisonConfig {
  /** Columns that define a complete row. */
  readonly columns: readonly string[];
  /** Family id per column, e.g. `alert-analysis-a` -> `alert-analysis`. */
  readonly familyOf: (columnId: string) => string;
  /** Rows below this many scored columns are reported but never ranked. */
  readonly minColumns: number;
  /** Bootstrap resamples. */
  readonly resamples?: number;
  /** Deterministic seed -- a published report must not move between renders. */
  readonly seed?: number;
  /**
   * Smallest score difference worth a tier boundary. Statistical separation is
   * necessary but not sufficient: two models with near-zero variance separate
   * on a 0.01 gap that no reader should act on, which is the same false
   * precision this module exists to remove. Defaults to 0.25 on the 0-10 scale.
   */
  readonly minMeaningfulDifference?: number;
}

export interface ConfidenceInterval {
  readonly mean: number;
  readonly low: number;
  readonly high: number;
}

export interface TierEntry {
  readonly modelId: string;
  readonly modelLabel: string;
  readonly interval: ConfidenceInterval;
}

export interface Tier {
  readonly rank: number;
  readonly members: readonly TierEntry[];
}

export interface FamilyRecommendation {
  readonly family: string;
  /** Every model whose CI overlaps the best mean -- co-leaders, not one winner. */
  readonly leaders: readonly string[];
  readonly bestMean: number;
  /** Models notably weak here; surfaces "great at X, terrible at Y" tradeoffs. */
  readonly laggards: readonly string[];
  readonly worstMean: number;
}

export interface EfficiencyEntry {
  readonly modelId: string;
  readonly modelLabel: string;
  readonly quality: number;
  readonly latencySeconds?: number;
  readonly inputTokens?: number;
  /** Set when another model is >= quality and <= cost on every axis. */
  readonly dominatedBy?: string;
}

export interface ExcludedRow {
  readonly modelId: string;
  readonly modelLabel: string;
  readonly scoredColumns: number;
  readonly requiredColumns: number;
}

export interface ComparisonReport {
  readonly tiers: readonly Tier[];
  readonly families: readonly FamilyRecommendation[];
  readonly efficiency: readonly EfficiencyEntry[];
  /** Rows too partial to rank. Reported so they are not silently dropped. */
  readonly excluded: readonly ExcludedRow[];
  /** True when no adjacent tier pair separated -- the field is a single blob. */
  readonly allTiedWarning: boolean;
}

/**
 * Small deterministic PRNG (Lehmer / MINSTD).
 *
 * Bootstrap resampling must be reproducible: a published comparison that
 * reshuffles its tiers between renders is not auditable. Uses modular
 * arithmetic rather than the usual bit-mixing so it stays within the repo's
 * no-bitwise rule, and stays well inside float53 precision.
 */
const createRng = (seed: number): (() => number) => {
  const modulus = 2147483647;
  let state = Math.floor(Math.abs(seed)) % modulus;
  if (state === 0) state = 1;
  return () => {
    state = (state * 16807) % modulus;
    return (state - 1) / (modulus - 1);
  };
};

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

const quantile = (sorted: readonly number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
};

/**
 * Bootstrap CI for one model's mean across its own columns.
 *
 * Resampling columns (not repetitions) is deliberate: it answers "how much does
 * this average depend on which tasks we happened to pick?", which is the
 * question a reader has when a leaderboard claims a 0.05 lead.
 */
export const bootstrapInterval = (
  values: readonly number[],
  resamples: number,
  rng: () => number
): ConfidenceInterval => {
  const observed = mean(values);
  if (values.length < 2) return { mean: observed, low: observed, high: observed };
  const means: number[] = [];
  for (let i = 0; i < resamples; i++) {
    let total = 0;
    for (let j = 0; j < values.length; j++) {
      total += values[Math.floor(rng() * values.length)];
    }
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  return { mean: observed, low: quantile(means, 0.025), high: quantile(means, 0.975) };
};

/**
 * Paired bootstrap: resample COLUMNS once, score both models on that same
 * resample. Models answer identical prompts, so the unpaired test would inflate
 * the variance with per-prompt difficulty that cancels between them, and hide
 * differences that are real.
 *
 * Returns the probability that A > B and the CI of the difference. A CI that
 * spans 0 means the ordering is not evidence.
 */
export const pairedComparison = (
  a: readonly number[],
  b: readonly number[],
  resamples: number,
  rng: () => number
): { probability: number; low: number; high: number } => {
  if (a.length !== b.length || a.length === 0) {
    return { probability: 0.5, low: 0, high: 0 };
  }
  const diffs: number[] = [];
  let wins = 0;
  for (let i = 0; i < resamples; i++) {
    let sa = 0;
    let sb = 0;
    for (let j = 0; j < a.length; j++) {
      const pick = Math.floor(rng() * a.length);
      sa += a[pick];
      sb += b[pick];
    }
    const d = (sa - sb) / a.length;
    diffs.push(d);
    if (d > 0) wins++;
  }
  diffs.sort((x, y) => x - y);
  return {
    probability: wins / resamples,
    low: quantile(diffs, 0.025),
    high: quantile(diffs, 0.975),
  };
};

const isSeparated = (result: { low: number; high: number }): boolean =>
  !(result.low <= 0 && 0 <= result.high);

/**
 * Group models into tiers, splitting only where a paired test separates a model
 * from the current tier's weakest member. Within a tier order is alphabetical,
 * never by an insignificant decimal -- sorting inside a tie is exactly the
 * false precision this replaces.
 */
export const buildTiers = (
  observations: readonly ModelObservation[],
  config: ComparisonConfig
): { tiers: Tier[]; excluded: ExcludedRow[] } => {
  const resamples = config.resamples ?? 2000;
  const complete: ModelObservation[] = [];
  const excluded: ExcludedRow[] = [];

  for (const obs of observations) {
    const scored = config.columns.filter((c) => typeof obs.scores[c] === 'number');
    if (scored.length < config.minColumns) {
      excluded.push({
        modelId: obs.modelId,
        modelLabel: obs.modelLabel,
        scoredColumns: scored.length,
        requiredColumns: config.minColumns,
      });
    } else {
      complete.push(obs);
    }
  }

  const vectorOf = (obs: ModelObservation): number[] =>
    config.columns.map((c) => obs.scores[c]).filter((v): v is number => typeof v === 'number');

  const ranked = [...complete].sort((x, y) => {
    const d = mean(vectorOf(y)) - mean(vectorOf(x));
    return d !== 0 ? d : x.modelLabel.localeCompare(y.modelLabel);
  });

  const tiers: Tier[] = [];
  let current: ModelObservation[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const rng = createRng((config.seed ?? 1337) + tiers.length * 7919);
    const members = current
      .map((obs) => ({
        modelId: obs.modelId,
        modelLabel: obs.modelLabel,
        interval: bootstrapInterval(vectorOf(obs), resamples, rng),
      }))
      .sort((x, y) => x.modelLabel.localeCompare(y.modelLabel));
    tiers.push({ rank: tiers.length + 1, members });
    current = [];
  };

  for (const obs of ranked) {
    if (current.length === 0) {
      current.push(obs);
      continue;
    }
    // Compare against the tier's weakest member: a model only starts a new tier
    // when it is separated from everything already grouped above it.
    const weakest = current.reduce((lo, c) => (mean(vectorOf(c)) < mean(vectorOf(lo)) ? c : lo));
    const rng = createRng((config.seed ?? 1337) + ranked.indexOf(obs) * 104729);
    const result = pairedComparison(vectorOf(weakest), vectorOf(obs), resamples, rng);
    const gap = mean(vectorOf(weakest)) - mean(vectorOf(obs));
    const floor = config.minMeaningfulDifference ?? 0.25;
    if (isSeparated(result) && Math.abs(gap) >= floor) {
      flush();
    }
    current.push(obs);
  }
  flush();

  return { tiers, excluded };
};

/**
 * Per-family leaders and laggards.
 *
 * Reports every model within `tolerance` of the best mean rather than a single
 * winner: with three prompts per family, naming one winner would overstate the
 * evidence in exactly the way the `Overall` column already does.
 */
export const buildFamilyRecommendations = (
  observations: readonly ModelObservation[],
  config: ComparisonConfig,
  tolerance = 0.5
): FamilyRecommendation[] => {
  const families = new Map<string, string[]>();
  for (const column of config.columns) {
    const family = config.familyOf(column);
    const list = families.get(family);
    if (list) list.push(column);
    else families.set(family, [column]);
  }

  const recommendations: FamilyRecommendation[] = [];
  for (const [family, columns] of families) {
    const means: Array<{ id: string; label: string; value: number }> = [];
    for (const obs of observations) {
      const vals = columns
        .map((c) => obs.scores[c])
        .filter((v): v is number => typeof v === 'number');
      // Require the whole family: a model scored on 1 of 3 prompts is not
      // comparable to one scored on all 3.
      if (vals.length === columns.length && vals.length > 0) {
        means.push({ id: obs.modelId, label: obs.modelLabel, value: mean(vals) });
      }
    }
    if (means.length === 0) continue;
    const best = Math.max(...means.map((m) => m.value));
    const worst = Math.min(...means.map((m) => m.value));
    recommendations.push({
      family,
      leaders: means
        .filter((m) => m.value >= best - tolerance)
        .map((m) => m.label)
        .sort(),
      bestMean: best,
      laggards: means
        .filter((m) => m.value <= worst + tolerance)
        .map((m) => m.label)
        .sort(),
      worstMean: worst,
    });
  }
  return recommendations.sort((a, b) => a.family.localeCompare(b.family));
};

/**
 * Pareto frontier over quality (up), latency (down) and input tokens (down).
 *
 * A dominated model is one no reader should choose: something else is at least
 * as accurate while being both faster and cheaper. Models missing cost data are
 * returned undominated -- absent instrumentation must never read as "efficient".
 */
export const buildEfficiency = (
  observations: readonly ModelObservation[],
  config: ComparisonConfig
): EfficiencyEntry[] => {
  const entries: EfficiencyEntry[] = observations
    .filter((obs) => {
      const scored = config.columns.filter((c) => typeof obs.scores[c] === 'number');
      return scored.length >= config.minColumns;
    })
    .map((obs) => {
      const vals = config.columns
        .map((c) => obs.scores[c])
        .filter((v): v is number => typeof v === 'number');
      return {
        modelId: obs.modelId,
        modelLabel: obs.modelLabel,
        quality: mean(vals),
        latencySeconds: obs.latencySeconds,
        inputTokens: obs.inputTokens,
      };
    });

  return entries.map((entry) => {
    if (entry.latencySeconds === undefined || entry.inputTokens === undefined) {
      return entry;
    }
    const dominator = entries.find(
      (other) =>
        other.modelId !== entry.modelId &&
        other.latencySeconds !== undefined &&
        other.inputTokens !== undefined &&
        other.quality >= entry.quality &&
        other.latencySeconds <= entry.latencySeconds! &&
        other.inputTokens <= entry.inputTokens! &&
        (other.quality > entry.quality ||
          other.latencySeconds < entry.latencySeconds! ||
          other.inputTokens < entry.inputTokens!)
    );
    return dominator ? { ...entry, dominatedBy: dominator.modelLabel } : entry;
  });
};

/** Full decision report. */
export const buildComparisonReport = (
  observations: readonly ModelObservation[],
  config: ComparisonConfig
): ComparisonReport => {
  const { tiers, excluded } = buildTiers(observations, config);
  return {
    tiers,
    families: buildFamilyRecommendations(observations, config),
    efficiency: buildEfficiency(observations, config),
    excluded,
    allTiedWarning: tiers.length === 1 && tiers[0]?.members.length > 1,
  };
};
