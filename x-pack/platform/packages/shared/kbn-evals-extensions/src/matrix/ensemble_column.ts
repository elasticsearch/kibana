/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Collapse several judges' scores for the same cells into one ensemble column.
 *
 * A single-judge column carries that judge's idiosyncratic scatter, and on this
 * board the scatter is larger than the gaps it has to resolve. Averaging N
 * judges over identical cells cuts the independent component of that noise by
 * about sqrt(N) while leaving real model differences intact, because the noise
 * is judge-specific and the signal is not.
 *
 * Two things are deliberately kept alongside the mean:
 *
 *   - `judgeSpread` -- how far apart the judges were on this model. A high
 *     ensemble score built from judges that disagreed violently is not the same
 *     claim as one they all agreed on, and collapsing to a bare mean hides it.
 *   - `judgeCount` -- how many judges contributed. A model averaged over two
 *     judges must not silently sit next to one averaged over four.
 *
 * The ensemble is only computed over cells EVERY judge graded. Averaging over
 * ragged coverage would let a model look strong because the judge that dislikes
 * it happened to fail on its cells.
 */

export interface EnsembleCellInput {
  judgeId: string;
  modelId: string;
  exampleId: string;
  score: number;
}

export interface EnsembleModelScore {
  modelId: string;
  /** Mean across judges of that judge's mean over the shared cells. */
  ensemble: number;
  /** Max-min of the per-judge means. Wide means the judges disagreed. */
  judgeSpread: number;
  judgeCount: number;
  cellCount: number;
  /** Per-judge mean, so a reader can see what the ensemble is hiding. */
  perJudge: Record<string, number>;
}

export interface EnsembleColumn {
  models: EnsembleModelScore[];
  judges: string[];
  /** Cells graded by every judge and therefore eligible for the ensemble. */
  sharedCellCount: number;
  /**
   * Expected noise reduction, sqrt(N) for N judges. Reported rather than
   * applied: it is the theoretical factor for independent judge error, and
   * judges are not fully independent, so it is an upper bound on the benefit.
   */
  noiseReductionFactor: number;
  /**
   * Model pairs whose ensemble difference has a 95% bootstrap CI excluding
   * zero, out of every pair compared. Published as counts rather than a bare
   * ordering: the board must state how much of its own ranking is real.
   */
  separablePairs: number;
  totalPairs: number;
  /**
   * Pairs whose CI edge lands within `BORDERLINE_MARGIN` of zero. These flip
   * verdict on a different RNG seed, so a bare "N separate" hides a coin flip:
   * swapping one seeded generator for another moved this board's count by one.
   * Reported so a borderline pair is never quoted as a clean separation.
   */
  borderlinePairs: number;
}

/**
 * A CI edge this close to zero is not a decision, it is noise. Chosen as ~5% of
 * the observed model spread on this board rather than an absolute epsilon.
 */
const BORDERLINE_MARGIN = 0.005;

/**
 * Deterministic paired bootstrap over the shared cells.
 *
 * Paired, because both models must be resampled on the SAME cells -- example
 * difficulty is the dominant variance component, and resampling independently
 * would compare a model on easy cells against one on hard cells and manufacture
 * separations that do not exist.
 *
 * Seeded, because a published "N of M pairs separate" figure that changes on
 * re-run is not a measurement. The seed is fixed, not drawn from the clock.
 */
function countSeparablePairs(
  perModelCells: Map<string, Map<string, number>>,
  iterations = 2000
): { separablePairs: number; totalPairs: number; borderlinePairs: number } {
  const ids = [...perModelCells.keys()].sort();
  // Seeded LCG (Numerical Recipes constants), in plain modular arithmetic so it
  // reads as arithmetic rather than bit-twiddling. Quality is ample here: the
  // bootstrap only needs uniform indices, not cryptographic randomness.
  const MODULUS = 4294967296;
  let seed = 2463534242;
  const rnd = () => {
    seed = (1664525 * seed + 1013904223) % MODULUS;
    return seed / MODULUS;
  };

  let separablePairs = 0;
  let totalPairs = 0;
  let borderlinePairs = 0;

  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      // Pair on EXAMPLE IDENTITY, never on array position: each model's key
      // list is built independently, so index i is a different example for
      // each model and index-pairing silently compares unrelated cells.
      const ma = perModelCells.get(ids[a])!;
      const mb = perModelCells.get(ids[b])!;
      const sharedExamples = [...ma.keys()].filter((k) => mb.has(k)).sort();
      const xs = sharedExamples.map((k) => ma.get(k)!);
      const ys = sharedExamples.map((k) => mb.get(k)!);
      const n = Math.min(xs.length, ys.length);
      if (n === 0) continue;
      totalPairs++;

      const diffs: number[] = [];
      for (let it = 0; it < iterations; it++) {
        let sx = 0;
        let sy = 0;
        for (let k = 0; k < n; k++) {
          const idx = Math.floor(rnd() * n);
          sx += xs[idx];
          sy += ys[idx];
        }
        diffs.push(sx / n - sy / n);
      }
      diffs.sort((p, q) => p - q);
      const lo = diffs[Math.floor(0.025 * iterations)];
      const hi = diffs[Math.floor(0.975 * iterations)];
      if (lo > 0 || hi < 0) separablePairs++;
      if (Math.min(Math.abs(lo), Math.abs(hi)) < BORDERLINE_MARGIN) borderlinePairs++;
    }
  }

  return { separablePairs, totalPairs, borderlinePairs };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const SEP = '\u0000';
const key = (modelId: string, exampleId: string) => `${modelId}${SEP}${exampleId}`;

/**
 * Build the ensemble column.
 *
 * Throws rather than degrading when judges share no cells: an "ensemble" over
 * disjoint cells is just a relabelled average of different measurements, and
 * publishing it as a consensus would be a stronger claim than the data makes.
 */
export function buildEnsembleColumn(cells: EnsembleCellInput[]): EnsembleColumn {
  const judges = [...new Set(cells.map((c) => c.judgeId))].sort();
  if (judges.length < 2) {
    throw new Error(
      `An ensemble needs at least 2 judges; got ${judges.length}. A single judge is just that judge's column.`
    );
  }

  const byJudge = new Map<string, Map<string, number>>();
  for (const judgeId of judges) byJudge.set(judgeId, new Map());
  for (const c of cells) byJudge.get(c.judgeId)!.set(key(c.modelId, c.exampleId), c.score);

  const [first, ...rest] = judges;
  const sharedKeys = [...byJudge.get(first)!.keys()].filter((k) =>
    rest.every((j) => byJudge.get(j)!.has(k))
  );

  if (sharedKeys.length === 0) {
    throw new Error(
      `No cell was graded by all ${judges.length} judges, so there is no shared basis to average over.`
    );
  }

  const keysByModel = new Map<string, string[]>();
  for (const k of sharedKeys) {
    const modelId = k.split(SEP)[0];
    keysByModel.set(modelId, [...(keysByModel.get(modelId) ?? []), k]);
  }

  const models: EnsembleModelScore[] = [...keysByModel.keys()].sort().map((modelId) => {
    const modelKeys = keysByModel.get(modelId)!;
    const perJudge: Record<string, number> = Object.fromEntries(
      judges.map((j) => [j, mean(modelKeys.map((k) => byJudge.get(j)!.get(k)!))])
    );
    const judgeMeans = Object.values(perJudge);

    return {
      modelId,
      ensemble: mean(judgeMeans),
      judgeSpread: Math.max(...judgeMeans) - Math.min(...judgeMeans),
      judgeCount: judges.length,
      cellCount: modelKeys.length,
      perJudge,
    };
  });

  // Per-cell ensemble values (mean across judges), which is what the bootstrap
  // must resample -- resampling the per-model means would throw away the
  // cell-level pairing that makes the comparison paired at all.
  // Keyed by exampleId so pairs are matched on the same example, not on
  // position in a per-model list.
  const perModelCells = new Map<string, Map<string, number>>(
    [...keysByModel.entries()].map(([modelId, ks]) => [
      modelId,
      new Map(ks.map((k) => [k.split(SEP)[1], mean(judges.map((j) => byJudge.get(j)!.get(k)!))])),
    ])
  );
  const { separablePairs, totalPairs, borderlinePairs } = countSeparablePairs(perModelCells);

  return {
    models: models.sort((a, b) => b.ensemble - a.ensemble),
    judges,
    sharedCellCount: sharedKeys.length,
    noiseReductionFactor: Math.sqrt(judges.length),
    separablePairs,
    totalPairs,
    borderlinePairs,
  };
}
