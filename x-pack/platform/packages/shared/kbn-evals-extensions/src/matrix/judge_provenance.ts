/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AggregatedModelScores } from './query_matrix_scores';

/**
 * Judge provenance: who graded a cell, on what backend, and from which family.
 *
 * Two properties make a judged score trustworthy enough to rank on:
 *
 *  1. The judge ran on a known inference backend (EIS), not an ad-hoc
 *     locally-hosted endpoint whose weights/quantisation are unpinned.
 *  2. The judge is not scoring a candidate from its own model family, and
 *     above all is not scoring *itself*.
 *
 * Violations are reported, never silently corrected — a matrix that quietly
 * drops cells is worse than one that shows why a cell is untrustworthy.
 */

/** Model families we can recognise from a connector or model id. */
export type ModelFamily =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'meta'
  | 'mistral'
  | 'qwen'
  | 'deepseek'
  | 'nous'
  | 'unknown';

/**
 * Family patterns, most-specific first.
 *
 * `nous` precedes `meta` deliberately: `NousResearch/Hermes-3-Llama-3.1-70B`
 * names both vendors, and attributing it to Meta would overstate how much
 * cross-family coverage a judge panel actually has.
 */
const FAMILY_PATTERNS: Array<[ModelFamily, RegExp]> = [
  ['nous', /hermes|nousresearch/i],
  ['anthropic', /claude|anthropic/i],
  ['openai', /gpt|openai|o[13]-|oss/i],
  ['google', /gemini|google|gemma/i],
  ['mistral', /mistral|mixtral|magistral/i],
  ['qwen', /qwen/i],
  ['deepseek', /deepseek/i],
  ['meta', /llama|meta-/i],
];

export function classifyFamily(modelId: string | undefined | null): ModelFamily {
  const id = String(modelId ?? '');
  if (!id) {
    return 'unknown';
  }
  for (const [family, pattern] of FAMILY_PATTERNS) {
    if (pattern.test(id)) {
      return family;
    }
  }
  return 'unknown';
}

/**
 * EIS-backed connectors are registered with an `eis-` prefix. Anything else —
 * a raw provider id, a LiteLLM alias, a HuggingFace repo path — is a
 * self-hosted or third-party endpoint whose exact weights are not pinned by
 * the eval infrastructure.
 */
export function isEisBacked(judgeId: string | undefined | null): boolean {
  const id = String(judgeId ?? '').trim();
  if (!id) {
    return false;
  }
  if (/^eis[-_]/i.test(id)) {
    return true;
  }
  // Vendor-canonical ids used by EIS connectors, e.g. `anthropic-claude-4.6-sonnet`.
  return /^(anthropic|openai|google)-/i.test(id) && !id.includes('/');
}

export interface JudgeProvenance {
  judgeId: string;
  taskModelId: string;
  eisBacked: boolean;
  judgeFamily: ModelFamily;
  taskFamily: ModelFamily;
  /** Judge and candidate are literally the same model. */
  selfJudged: boolean;
  /** Judge and candidate come from the same model family. */
  sameFamily: boolean;
}

export function describeJudge(judgeId: string, taskModelId: string): JudgeProvenance {
  const judgeFamily = classifyFamily(judgeId);
  const taskFamily = classifyFamily(taskModelId);
  const norm = (s: string) =>
    String(s ?? '')
      .trim()
      .toLowerCase();
  return {
    judgeId,
    taskModelId,
    eisBacked: isEisBacked(judgeId),
    judgeFamily,
    taskFamily,
    selfJudged: norm(judgeId) === norm(taskModelId) && norm(judgeId) !== '',
    sameFamily: judgeFamily === taskFamily && judgeFamily !== 'unknown',
  };
}

export type JudgeViolationKind = 'non-eis-judge' | 'self-judged' | 'same-family';

export interface JudgeViolation {
  kind: JudgeViolationKind;
  judgeId: string;
  taskModelId: string;
  detail: string;
}

export interface JudgePolicy {
  /** Reject judges that are not EIS-backed. Default true. */
  requireEis?: boolean;
  /** Reject a model grading itself. Default true. */
  forbidSelfJudging?: boolean;
  /**
   * Reject a judge from the candidate's own family. Off by default: measured
   * same-family bias on the persona matrix was not statistically significant
   * (n=431 paired cells, z=-0.88), so this is opt-in rather than assumed.
   */
  forbidSameFamily?: boolean;
}

const DEFAULT_POLICY: Required<JudgePolicy> = {
  requireEis: true,
  forbidSelfJudging: true,
  forbidSameFamily: false,
};

/** Check one judge/candidate pairing against the policy. */
export function checkJudge(
  judgeId: string,
  taskModelId: string,
  policy: JudgePolicy = {}
): JudgeViolation[] {
  const effective = { ...DEFAULT_POLICY, ...policy };
  const p = describeJudge(judgeId, taskModelId);
  const violations: JudgeViolation[] = [];

  if (effective.requireEis && !p.eisBacked) {
    violations.push({
      kind: 'non-eis-judge',
      judgeId,
      taskModelId,
      detail: `judge "${judgeId}" is not an EIS-backed connector; its weights and quantisation are not pinned by the eval infrastructure`,
    });
  }
  if (effective.forbidSelfJudging && p.selfJudged) {
    violations.push({
      kind: 'self-judged',
      judgeId,
      taskModelId,
      detail: `model "${taskModelId}" graded its own output`,
    });
  }
  if (effective.forbidSameFamily && p.sameFamily) {
    violations.push({
      kind: 'same-family',
      judgeId,
      taskModelId,
      detail: `judge "${judgeId}" and candidate "${taskModelId}" are both in the "${p.judgeFamily}" family`,
    });
  }
  return violations;
}

export interface JudgeAuditRow {
  judgeId: string;
  taskModelId: string;
  docCount?: number;
}

export interface JudgeAuditSummary {
  totalDocs: number;
  nonEisDocs: number;
  selfJudgedDocs: number;
  sameFamilyDocs: number;
  violations: JudgeViolation[];
  /** Distinct judge families that graded at least one cell. */
  judgeFamilies: ModelFamily[];
}

/**
 * Audit a whole matrix worth of judge pairings so a report can state, up front,
 * how much of its data came from judges that meet the policy.
 */
export function auditJudges(rows: JudgeAuditRow[], policy: JudgePolicy = {}): JudgeAuditSummary {
  let totalDocs = 0;
  let nonEisDocs = 0;
  let selfJudgedDocs = 0;
  let sameFamilyDocs = 0;
  const violations: JudgeViolation[] = [];
  const seen = new Set<string>();
  const families = new Set<ModelFamily>();

  for (const row of rows) {
    const docs = row.docCount ?? 1;
    totalDocs += docs;
    const p = describeJudge(row.judgeId, row.taskModelId);
    families.add(p.judgeFamily);
    if (!p.eisBacked) {
      nonEisDocs += docs;
    }
    if (p.selfJudged) {
      selfJudgedDocs += docs;
    }
    if (p.sameFamily) {
      sameFamilyDocs += docs;
    }

    const key = `${row.judgeId}::${row.taskModelId}`;
    if (!seen.has(key)) {
      seen.add(key);
      violations.push(...checkJudge(row.judgeId, row.taskModelId, policy));
    }
  }

  return {
    totalDocs,
    nonEisDocs,
    selfJudgedDocs,
    sameFamilyDocs,
    violations,
    judgeFamilies: [...families].sort(),
  };
}

export interface JudgeShare {
  judgeModelId: string;
  /** Number of admitted (model, suite) runs this judge graded. */
  suites: number;
  /** Percentage of admitted runs, to one decimal. */
  share: number;
}

export interface DerivedJudgeProvenance {
  /**
   * A single judge id when every admitted run shares one, otherwise a
   * `mixed: ...` summary. Never a bare id when the board is not unanimous —
   * the whole point is that a reader cannot mistake a mixed board for a
   * unified one.
   */
  judgeModelId: string;
  judgeBreakdown: JudgeShare[];
}

/**
 * Derive which judge graded the admitted runs, counted from the aggregated
 * scores rather than asserted by the caller.
 *
 * A hardcoded judge id silently survives a rejudge that never landed: the
 * board then claims one shared instrument while the rows were graded by
 * several. That is precisely the assumption the published spread/CI figures
 * rest on, so it must be measured, not declared.
 */
export function deriveJudgeProvenance(aggregated: AggregatedModelScores[]): DerivedJudgeProvenance {
  const counts = new Map<string, number>();
  for (const model of aggregated) {
    for (const suite of model.suites ?? []) {
      // A suite whose columns ran as separate experiments carries every judge
      // that graded it. Counting only the single-judge `judgeModelId` would
      // drop those runs from the breakdown entirely, so a mixed column would
      // disappear from the very figure meant to expose it.
      const judges = suite.judgeModelIds?.length
        ? suite.judgeModelIds
        : suite.judgeModelId
        ? [suite.judgeModelId]
        : [];
      for (const judge of judges) {
        counts.set(judge, (counts.get(judge) ?? 0) + 1);
      }
    }
  }

  const byFrequency = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = byFrequency.reduce((sum, [, n]) => sum + n, 0);

  const judgeBreakdown: JudgeShare[] = byFrequency.map(([judgeModelId, suites]) => ({
    judgeModelId,
    suites,
    share: Number(((100 * suites) / total).toFixed(1)),
  }));

  if (byFrequency.length === 0) {
    return {
      judgeModelId: 'unknown (no judge recorded on any admitted suite)',
      judgeBreakdown,
    };
  }

  if (byFrequency.length === 1) {
    return { judgeModelId: byFrequency[0][0], judgeBreakdown };
  }

  return {
    judgeModelId: `mixed: ${judgeBreakdown
      .map((j) => `${j.judgeModelId} ${j.share.toFixed(1)}%`)
      .join(', ')}`,
    judgeBreakdown,
  };
}
