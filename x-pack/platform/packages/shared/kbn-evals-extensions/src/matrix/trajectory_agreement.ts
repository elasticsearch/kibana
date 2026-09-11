/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Trajectory agreement across repetitions of the same (model, example).
 *
 * Key on `tool_id`, never `tool_call_id`. Provider invocation ids are unique
 * per call, so comparing them reports 100% divergence by construction even
 * when the agent issued the same tools.
 *
 * A cell with one repetition is `unmeasured`, not 0 and not 1. Collapsing
 * those three is how a 21-of-23 empty reliability column would look "broken"
 * on the current corpus.
 */

export type ReliabilityStatus = 'unmeasured' | 'measured';

export interface TrajectoryCell {
  model: string;
  example: string;
  /** One tool_id sequence per repetition. Empty sequences are kept. */
  trails: string[][];
  /**
   * True when the example is an open-ended capability probe with no repeatable
   * path. Set from dataset metadata (`pathContract`), never inferred from the
   * example id — the dataset is the single source of truth.
   */
  probe?: boolean;
  /** Whether `probe` came from declared metadata or the legacy prefix guess. */
  probeSource?: 'declared' | 'legacy-prefix';
  /** Final answer per repetition, index-aligned with `trails`. */
  answers?: string[];
}

/** Wilson score interval for a binomial proportion. */
export interface ConfidenceInterval {
  low: number;
  high: number;
}

export interface TrajectoryAgreement {
  status: ReliabilityStatus;
  /** Distinct repetitions that produced a trail. 1 → unmeasured. */
  repetitions: number;
  /**
   * Pairwise identical-sequence rate in [0, 1]. Undefined when unmeasured.
   * Identity, not similarity: order-preserving exact match of tool_id lists.
   */
  identicalRate?: number;
  /**
   * Pairwise same-tool-set rate in [0, 1], ignoring order and repetition. Always
   * >= identicalRate; the gap between them is order-only churn, which is a much
   * weaker claim of instability than reaching for different tools.
   */
  toolSetRate?: number;
  /** Mean pairwise LCS / max(len_a, len_b). Undefined when unmeasured. */
  sequenceSimilarity?: number;
  /** Pairs compared (n choose 2 over repetitions) — the sample behind the rate. */
  pairs?: number;
  /**
   * Mean pairwise similarity of final answers in [0, 1]. Reported beside path
   * agreement, never derived from it: on the pilot corpus path similarity ran
   * 0.69-0.73 while answer similarity was 0.17 (r=0.14), so a stable path does
   * not imply a stable answer.
   */
  answerSimilarity?: number;
  /** Pairs that had an answer on both sides — may be fewer than `pairs`. */
  answerPairs?: number;
  /**
   * Index of the first step where two trails diverge, minimum over pairs.
   * 0 means the runs picked different first tools. Undefined when identical.
   */
  firstDivergenceStep?: number;
  /** The tool_id at `firstDivergenceStep` on the shorter-prefix side. */
  firstDivergenceTool?: string;
}

export interface ReliabilityRow {
  modelId: string;
  status: ReliabilityStatus;
  cells: number;
  measuredCells: number;
  identicalRate?: number;
  /**
   * Pooled same-tool-set rate. Reported beside identicalRate so a low exact rate
   * driven purely by ordering is visible as such rather than read as tool churn.
   */
  toolSetRate?: number;
  sequenceSimilarity?: number;
  /** Total pairs pooled across this model's measured cells. */
  pairs?: number;
  /**
   * Wilson 95% interval on `identicalRate`. Nine cells at 3 reps is ~27 pairs,
   * which puts the interval near +/-15pp — wide enough that two models cannot be
   * ordered on the point estimate alone.
   */
  interval?: ConfidenceInterval;
  /** Pooled answer similarity across measured cells, if any answers were kept. */
  answerSimilarity?: number;
  /** How many of this row's cells were classified by the legacy prefix guess. */
  legacyClassifiedCells?: number;
  /** Most common first-divergence tool across measured cells, with its count. */
  divergenceHotspot?: { tool: string; cells: number };
}

const lcsLength = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const prev = new Array<number>(b.length + 1).fill(0);
  const curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j];
    }
  }
  return prev[b.length];
};

/** SequenceMatcher-style ratio: 2 * LCS / (len_a + len_b). */
export const sequenceSimilarity = (a: string[], b: string[]): number => {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  const denom = a.length + b.length;
  if (denom === 0) {
    return 1;
  }
  return (2 * lcsLength(a, b)) / denom;
};

const pairwiseMean = (trails: string[][], pairFn: (a: string[], b: string[]) => number): number => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < trails.length; i++) {
    for (let j = i + 1; j < trails.length; j++) {
      sum += pairFn(trails[i], trails[j]);
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
};

/**
 * Wilson score interval at 95%. Chosen over the normal approximation because
 * the rates here sit near 0 and the samples are small (tens of pairs), where
 * the normal interval runs off the end of [0, 1] and understates uncertainty.
 */
export const wilsonInterval = (successes: number, total: number): ConfidenceInterval => {
  if (total <= 0) {
    return { low: 0, high: 1 };
  }
  const z = 1.96;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    low: Math.max(0, (centre - spread) / denom),
    high: Math.min(1, (centre + spread) / denom),
  };
};

/**
 * True when two intervals overlap, i.e. the data cannot order the two rows.
 * The board must not rank measured models whose intervals overlap.
 */
export const intervalsOverlap = (a: ConfidenceInterval, b: ConfidenceInterval): boolean =>
  a.low <= b.high && b.low <= a.high;

/** Word-level similarity of two answers, using the same LCS ratio as paths. */
export const answerSimilarity = (a: string, b: string): number => {
  const tokens = (text: string) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  return sequenceSimilarity(tokens(a), tokens(b));
};

/**
 * Index of the first differing step between two trails, or undefined when one
 * is a prefix of the other and they otherwise agree. Locating divergence is
 * what turns a low rate into an actionable lead: on the pilot corpus 70% of
 * divergences occurred by step 2, most at skill selection.
 */
export const firstDivergence = (
  a: string[],
  b: string[]
): { step: number; tool?: string } | undefined => {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i] !== b[i]) {
      return { step: i, tool: a[i] };
    }
  }
  if (a.length === b.length) {
    return undefined;
  }
  return { step: shared, tool: (a.length > b.length ? a : b)[shared] };
};

export const trailsEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Whether two trails used the same distinct tools, ignoring order and repetition.
 *
 * Exact-sequence equality conflates two different behaviours: reaching for a different tool, and
 * reaching for the same tools in a different order. Measured on the pilot corpus, ~6% of repeated
 * cells differ ONLY in ordering, so reporting exact agreement alone charges those cells the full
 * penalty of a genuinely divergent path.
 */
export const trailSetsEqual = (a: string[], b: string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) {
    return false;
  }
  for (const id of left) {
    if (!right.has(id)) {
      return false;
    }
  }
  return true;
};

export const cellAgreement = (trails: string[][], answers?: string[]): TrajectoryAgreement => {
  if (trails.length <= 1) {
    return { status: 'unmeasured', repetitions: trails.length };
  }

  let answerSum = 0;
  let answerPairs = 0;
  let earliest: { step: number; tool?: string } | undefined;
  for (let i = 0; i < trails.length; i++) {
    for (let j = i + 1; j < trails.length; j++) {
      const left = answers?.[i];
      const right = answers?.[j];
      if (left && right) {
        answerSum += answerSimilarity(left, right);
        answerPairs += 1;
      }
      const divergence = firstDivergence(trails[i], trails[j]);
      if (divergence && (earliest === undefined || divergence.step < earliest.step)) {
        earliest = divergence;
      }
    }
  }

  return {
    status: 'measured',
    repetitions: trails.length,
    identicalRate: pairwiseMean(trails, (a, b) => (trailsEqual(a, b) ? 1 : 0)),
    toolSetRate: pairwiseMean(trails, (a, b) => (trailSetsEqual(a, b) ? 1 : 0)),
    sequenceSimilarity: pairwiseMean(trails, sequenceSimilarity),
    pairs: (trails.length * (trails.length - 1)) / 2,
    answerSimilarity: answerPairs > 0 ? answerSum / answerPairs : undefined,
    answerPairs: answerPairs > 0 ? answerPairs : undefined,
    firstDivergenceStep: earliest?.step,
    firstDivergenceTool: earliest?.tool,
  };
};

export const rowAgreement = (cells: TrajectoryCell[], modelId: string): ReliabilityRow => {
  // Probes are open-ended by contract; including them would report a low rate
  // for prompts that were never meant to have one repeatable path.
  const mine = cells.filter((c) => c.model === modelId && !c.probe);
  const measured = mine
    .map((c) => cellAgreement(c.trails, c.answers))
    .filter((a) => a.status === 'measured');
  const legacyClassifiedCells = cells.filter(
    (c) => c.model === modelId && c.probeSource === 'legacy-prefix'
  ).length;
  if (measured.length === 0) {
    return {
      modelId,
      status: 'unmeasured',
      cells: mine.length,
      measuredCells: 0,
      legacyClassifiedCells: legacyClassifiedCells || undefined,
    };
  }
  // Pool pairs rather than averaging per-cell rates: a mean of means hides the
  // sample size, and the sample size is the whole caveat on this column.
  const pairs = measured.reduce((s, a) => s + (a.pairs ?? 0), 0);
  const matches = measured.reduce((s, a) => s + (a.identicalRate ?? 0) * (a.pairs ?? 0), 0);
  const identicalRate = pairs === 0 ? 0 : matches / pairs;
  const toolSetRate =
    pairs === 0
      ? 0
      : measured.reduce((s, a) => s + (a.toolSetRate ?? 0) * (a.pairs ?? 0), 0) / pairs;
  const sequenceSim =
    measured.reduce((s, a) => s + (a.sequenceSimilarity ?? 0) * (a.pairs ?? 0), 0) / (pairs || 1);

  const answerPairs = measured.reduce((s, a) => s + (a.answerPairs ?? 0), 0);
  const answerSum = measured.reduce(
    (s, a) => s + (a.answerSimilarity ?? 0) * (a.answerPairs ?? 0),
    0
  );

  const hotspots = new Map<string, number>();
  for (const cell of measured) {
    if (cell.firstDivergenceTool) {
      hotspots.set(cell.firstDivergenceTool, (hotspots.get(cell.firstDivergenceTool) ?? 0) + 1);
    }
  }
  const topHotspot = [...hotspots.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    modelId,
    status: 'measured',
    cells: mine.length,
    measuredCells: measured.length,
    identicalRate,
    toolSetRate,
    sequenceSimilarity: sequenceSim,
    pairs,
    interval: wilsonInterval(matches, pairs),
    answerSimilarity: answerPairs > 0 ? answerSum / answerPairs : undefined,
    legacyClassifiedCells: legacyClassifiedCells || undefined,
    divergenceHotspot: topHotspot ? { tool: topHotspot[0], cells: topHotspot[1] } : undefined,
  };
};

/**
 * Group per-rep tool_id sequences from score documents of one example.
 * Docs sharing a repetition_index are the same agent run (one per evaluator);
 * the first complete trail wins. Key on tool_id only.
 */
export type PathContract = 'rankable' | 'candidate' | 'probe';

/**
 * Legacy classification, derived from the 3-rep pilot where every
 * hunt/investigation example scored 0/5 on exact path agreement.
 *
 * @deprecated The dataset now declares `pathContract` per example and that is
 * the single source of truth. This list only classifies score documents
 * produced BEFORE that field existed, so an old cached corpus still renders.
 * Callers must report how many cells fell back here — see `probeSource`.
 * Delete once every corpus in use carries `example.metadata.pathContract`.
 */
export const LEGACY_PROBE_EXAMPLE_PREFIXES = [
  'alert-analysis-',
  'entity-analytics-',
  'multi-step-',
  'threat-hunting-',
] as const;

const isLegacyProbeExample = (exampleId: string): boolean =>
  LEGACY_PROBE_EXAMPLE_PREFIXES.some((prefix) => exampleId.startsWith(prefix));

/** Reads the declared contract off a score document's example metadata. */
export const pathContractFromDocs = (
  docs: ReadonlyArray<{ example?: unknown }>
): PathContract | undefined => {
  for (const doc of docs) {
    const example = doc.example as { metadata?: { pathContract?: PathContract } } | undefined;
    const declared = example?.metadata?.pathContract;
    if (declared) {
      return declared;
    }
  }
  return undefined;
};

/**
 * Resolves whether an example is a probe, preferring the declared contract and
 * reporting which mechanism answered so the board can disclose the fallback
 * rather than presenting a legacy guess as measured metadata.
 */
export const resolveProbe = (
  exampleId: string,
  declared?: PathContract
): { probe: boolean; source: 'declared' | 'legacy-prefix' } =>
  declared
    ? { probe: declared === 'probe', source: 'declared' }
    : { probe: isLegacyProbeExample(exampleId), source: 'legacy-prefix' };

/**
 * Final answer per repetition, index-aligned with `trailsFromDocs` output.
 * Uses the same repetition grouping so answer pairs line up with path pairs.
 */
export const answersFromDocs = (docs: ReadonlyArray<{ task?: unknown }>): string[] => {
  const byRep = new Map<number, string>();
  for (const doc of docs) {
    const task = doc.task as
      | {
          repetition_index?: number;
          output?: { messages?: Array<{ message?: string }> };
        }
      | undefined;
    const rep = task?.repetition_index ?? 0;
    if (byRep.has(rep)) {
      continue;
    }
    let answer = '';
    for (const msg of task?.output?.messages ?? []) {
      if (msg.message && msg.message.length > 50) {
        answer = msg.message;
      }
    }
    byRep.set(rep, answer);
  }
  return [...byRep.entries()].sort((a, b) => a[0] - b[0]).map(([, answer]) => answer);
};

export const trailsFromDocs = (docs: ReadonlyArray<{ task?: unknown }>): string[][] => {
  const byRep = new Map<number, string[]>();
  for (const doc of docs) {
    const task = doc.task as
      | {
          repetition_index?: number;
          output?: { steps?: Array<{ type?: string; tool_id?: string }> };
        }
      | undefined;
    const rep = task?.repetition_index ?? 0;
    if (byRep.has(rep)) {
      continue;
    }
    const trail: string[] = [];
    for (const step of task?.output?.steps ?? []) {
      if (step.type === 'tool_call' && step.tool_id) {
        trail.push(step.tool_id);
      }
    }
    byRep.set(rep, trail);
  }
  return [...byRep.entries()].sort((a, b) => a[0] - b[0]).map(([, trail]) => trail);
};
