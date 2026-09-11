/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Per-suite jury adapters for judge replay.
 *
 * `ext rejudge` originally hardcoded the persona-matrix jury: it always built
 * the correctness/groundedness evaluators and always emitted Factuality,
 * Relevance, Groundedness and Sequence Accuracy. Pointing it at another suite
 * therefore produced a confident, exit-0 result that measured the wrong thing --
 * an Attack Discovery replay came back MAJOR_INACCURACIES on 244/253 cells
 * because a prose-comparison judge was grading structured discoveries against a
 * reference it had never been given. The scores looked like model quality and
 * were really an instrument mismatch.
 *
 * A jury adapter answers two questions per suite:
 *   1. which evaluator names the suite's judged column consists of, and
 *   2. how a stored golden cell is reshaped into the args those evaluators read.
 *
 * The second half matters as much as the first. Golden records a cell as
 * `task.output`, but each suite's evaluators read a different slice of it:
 * persona-matrix wants the message transcript, Attack Discovery wants
 * `insights`. Passing the persona shape to an AD evaluator yields a null score,
 * which aggregates into a silently empty column rather than a loud failure.
 */

import type { ReplayCell } from './replay_plan';
import type { RejudgeScore } from './run_rejudge';

/** A judged cell reshaped into the argument object a suite's evaluators expect. */
export interface JuryArgs {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  expected: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface JuryAdapter {
  /** Adapter id, reported in logs so a replay names the jury it used. */
  name: string;
  /**
   * Golden `metadata.suite_id` values this jury serves. Matching on the suite
   * id recorded in the score document -- rather than on the dataset path -- is
   * deliberate: the dataset file is a CLI argument that can point anywhere,
   * while the suite id is what the published matrix column is keyed by.
   */
  suiteIds: string[];
  /**
   * Evaluator names this jury recomputes, i.e. the judged evaluators of the
   * suite's column. Used to verify a replay refreshed the column it claims to.
   */
  evaluatorNames: string[];
  /** Reshape a stored cell into evaluator args, or null when unreplayable. */
  toArgs: (cell: ReplayCell) => JuryArgs | null;
  /**
   * Criteria-judge invocations this jury needs, when its evaluators are all
   * built on the shared criteria judge.
   *
   * Suites whose evaluators live in a private, solutions-side package cannot be
   * imported by this platform package. Where those evaluators are thin wrappers
   * over `createCriteriaEvaluator`, the jury restates the same criteria and args
   * so the replay runs the identical judge rather than importing across the
   * boundary or, worse, substituting a different rubric.
   */
  criteriaFor?: (args: JuryArgs) => Array<{
    name: string;
    criteria: string[];
    args: JuryArgs;
  }>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * persona-matrix: prose answers graded by the correctness/groundedness pair.
 *
 * `steps` are forwarded because the groundedness judge checks each claim
 * against the tool-call history; replaying with only the final message makes
 * every specific claim unverifiable.
 */
export const personaMatrixJury: JuryAdapter = {
  name: 'persona-matrix',
  suiteIds: ['security-persona-matrix'],
  evaluatorNames: ['Factuality', 'Relevance', 'Groundedness', 'Sequence Accuracy'],
  toArgs: (cell) => {
    // Both a final message and a prose reference are required: the correctness
    // judge grades one against the other, and replaying with either missing
    // manufactures a MAJOR_INACCURACIES verdict from absent data rather than
    // from a weak answer.
    if (!cell.agentResponse || !cell.expected) {
      return null;
    }
    return {
      input: { question: cell.question },
      output: { messages: [{ message: cell.agentResponse }], steps: cell.steps },
      expected: { expected: cell.expected },
      metadata: {},
    };
  },
};

/**
 * Attack Discovery: `Criteria` and `Rubric` are the LLM-judged evaluators, and
 * both read the structured discoveries under `output.insights`, not the message
 * transcript.
 *
 * A cell whose insights are absent or empty is NOT replayable. Both evaluators
 * short-circuit to a null score when their reference or submission is empty, so
 * replaying such a cell would overwrite a real score with N/A -- the emptiness
 * would then read as a model that discovered nothing, when in fact the
 * trajectory was never captured.
 */
export const attackDiscoveryJury: JuryAdapter = {
  name: 'attack-discovery',
  suiteIds: ['attack-discovery-agent-builder', 'attack-discovery'],
  evaluatorNames: ['Criteria', 'Rubric'],
  toArgs: (cell) => {
    const output = isRecord(cell.taskOutput) ? cell.taskOutput : undefined;
    const insights = output?.insights;
    if (!Array.isArray(insights) || insights.length === 0) {
      return null;
    }
    // Ground truth drives both evaluators: Criteria needs `criteria[]` and
    // Rubric needs `attackDiscoveries`. With neither, both short-circuit to a
    // null score, and replaying would overwrite a real verdict with N/A.
    const expected = isRecord(cell.expectedStructured) ? cell.expectedStructured : undefined;
    const hasCriteria = Array.isArray(expected?.criteria) && expected!.criteria.length > 0;
    const hasDiscoveries =
      Array.isArray(expected?.attackDiscoveries) && expected!.attackDiscoveries.length > 0;
    if (!expected || (!hasCriteria && !hasDiscoveries)) {
      return null;
    }
    return {
      input: { question: cell.question },
      output: { insights, errors: Array.isArray(output?.errors) ? output.errors : [] },
      // AD ground truth is structured (criteria[] + attackDiscoveries); the
      // reference adapter renders a prose form for the correctness judge, but
      // these evaluators need the original objects.
      expected,
      metadata: {},
    };
  },
  /**
   * Mirrors the suite's Criteria and Rubric evaluators.
   *
   * Both serialise the graded artefact to JSON and hand it to the shared
   * criteria judge -- Criteria against the annotated `criteria[]`, Rubric
   * against the 7 requirements compared with the reference discoveries.
   *
   * Each rubric requirement is passed as its own criterion, matching the
   * suite's evaluator. The previous form collapsed all 7 into one string
   * ending "5 of 7 -> Y or N", which scored 95.6% of cells at exactly 1.0
   * and could not rank. Prefer `metadata.rubricCriteria` when the caller
   * supplies the suite's own list, so the two definitions cannot drift.
   */
  criteriaFor: (args) => {
    const specs: Array<{ name: string; criteria: string[]; args: JuryArgs }> = [];
    const expected = args.expected as {
      criteria?: unknown;
      attackDiscoveries?: unknown;
    };
    const insights = (args.output.insights as unknown[]) ?? [];
    const errors = (args.output.errors as unknown[]) ?? [];

    const serializedOutput = JSON.stringify({ insights, errors }, null, 2);

    const criteria = Array.isArray(expected?.criteria) ? (expected.criteria as string[]) : [];
    if (criteria.length > 0) {
      specs.push({
        name: 'Criteria',
        criteria,
        args: {
          input: args.input,
          expected: { expected: serializedOutput },
          output: { messages: [{ message: serializedOutput }], steps: [], errors },
          metadata: args.metadata,
        },
      });
    }

    const referenceInsights = Array.isArray(expected?.attackDiscoveries)
      ? (expected.attackDiscoveries as Array<Record<string, unknown>>)
      : [];
    if (referenceInsights.length > 0) {
      const toRubricShape = (list: Array<Record<string, unknown>>) =>
        list.map((insight) => ({
          title: insight.title ?? '',
          summaryMarkdown: insight.summaryMarkdown ?? '',
          detailsMarkdown: insight.detailsMarkdown ?? '',
          entitySummaryMarkdown: insight.entitySummaryMarkdown ?? '',
          mitreAttackTactics: insight.mitreAttackTactics ?? [],
          alertIds: insight.alertIds ?? [],
        }));

      const reference = JSON.stringify(
        { attackDiscoveries: toRubricShape(referenceInsights) },
        null,
        2
      );
      const submission = JSON.stringify(
        { attackDiscoveries: toRubricShape(insights as Array<Record<string, unknown>>) },
        null,
        2
      );

      // The rubric items come from the suite module when the CLI could load
      // them (`--dataset` resolves the suite's own evaluator), so a rubric
      // change in the suite reaches a rejudge instead of being silently
      // shadowed by a stale copy here. The inline list below is the fallback
      // for callers that supply no rubric, and is deliberately the SAME
      // per-item form -- not the old collapsed Y/N question.
      const injected = (args.metadata as { rubricCriteria?: unknown } | undefined)?.rubricCriteria;
      if (Array.isArray(injected) && injected.length > 0) {
        specs.push({
          name: 'Rubric',
          criteria: (injected as string[]).map((item) => `${item} Reference: ${reference}`),
          args: {
            input: args.input,
            expected: { expected: reference },
            output: { messages: [{ message: submission }], steps: [], errors },
            metadata: args.metadata,
          },
        });
        return specs;
      }

      const rubricItems = [
        'Is the submission non-empty and well-formed JSON with an array of attackDiscoveries?',
        'Do the detailsMarkdown values capture the overall essence of the reference, allowing slight differences in wording but not omitting or misrepresenting key incidents?',
        'Does the submission mention at least half of the same entities (host or user) as the reference?',
        'Are the summaryMarkdown values at least partially similar and summarizing the same incidents?',
        'Are the title values at least partially similar and mentioning the same incidents?',
        'Do more than half of the alertIds in the submission overlap with the alertIds in the reference?',
        'Are the MITRE tactics consistent with the reference?',
      ];

      specs.push({
        name: 'Rubric',
        criteria: rubricItems.map((item) => `${item} Reference: ${reference}`),
        args: {
          input: args.input,
          expected: { expected: reference },
          output: { messages: [{ message: submission }], steps: [], errors },
          metadata: args.metadata,
        },
      });
    }

    return specs;
  },
};

export const JURY_ADAPTERS: JuryAdapter[] = [personaMatrixJury, attackDiscoveryJury];

/**
 * Resolve the jury for a suite.
 *
 * Returns undefined for an unregistered suite rather than falling back to the
 * persona jury. That fallback is exactly what produced a plausible-looking but
 * meaningless Attack Discovery replay, so an unknown suite must fail loudly at
 * the CLI boundary instead of being silently mis-scored.
 */
export function selectJury(suiteId: string | undefined): JuryAdapter | undefined {
  if (!suiteId) {
    return undefined;
  }
  return JURY_ADAPTERS.find((jury) => jury.suiteIds.includes(suiteId));
}

/**
 * Check that a replay refreshed the evaluators the suite's column is built from.
 *
 * A replay whose verdicts all fall outside the jury's evaluator set has
 * measured something other than the column it claims to update -- the exact
 * failure that made an exit-0 Attack Discovery rejudge unusable.
 */
export function checkJuryCoverage(
  jury: JuryAdapter,
  scores: RejudgeScore[]
): { ok: boolean; unexpected: string[]; missing: string[] } {
  // A named evaluator carrying no score has not graded anything: the judge
  // answered but its verdict could not be parsed into a number. Counting the
  // name alone as coverage would let an ungraded column read as refreshed.
  const produced = new Set(scores.filter((s) => s.score !== null).map((s) => s.name));
  const expected = new Set(jury.evaluatorNames);
  return {
    ok: [...produced].some((name) => expected.has(name)),
    unexpected: [...produced].filter((name) => !expected.has(name)),
    missing: [...expected].filter((name) => !produced.has(name)),
  };
}
