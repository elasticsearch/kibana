/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument } from '@kbn/evals-common';
import type { JuryAdapter } from './jury_adapters';
import { DEFAULT_JOIN_FIELD } from './reference_adapters';

/**
 * Reads a dotted golden field (e.g. `example.metadata.scenarioKey`) off a score
 * document. Suites disagree on which field identifies an example, so the join
 * key is a path rather than a fixed property.
 */
function joinValue(doc: unknown, path: string): string {
  let node: unknown = doc;
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return '';
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

/**
 * Replay planning for judge-only re-scoring.
 *
 * A re-judge changes which model grades an already-recorded trajectory. It does
 * NOT need the agent, a Kibana, an Elasticsearch, or seeded data -- every input
 * the judges read (the user question, the agent's messages, the tool calls it
 * made, the ground truth) is already durable in the golden score documents.
 *
 * That durability is load-bearing and easy to lose: judges differ in WHICH
 * parts of the trajectory they read. The correctness judges read the final
 * message; the groundedness judge reads `task.output.steps` to check claims
 * against retrieved evidence. A replay that forwards only the final message
 * silently reduces the grounding judge to grading unsupported assertions, which
 * looks like a model or judge regression but is a harness defect. When adding a
 * judge here, forward the whole trajectory, not just the part today's judges
 * happen to use.
 *
 * Re-running the full sweep to change a judge cost ~68min of wall clock and 25
 * VMs on 2026-09-06, of which ~83% was VM provisioning and stack boot. Replay
 * reduces that to the judge's own latency.
 */

/**
 * Ground truth for one example, supplied by the caller from the suite's
 * dataset.
 *
 * Golden score documents do NOT carry the reference answer: `example.output`
 * is empty on every stored document (verified across the whole index). The
 * suite mirrors its dataset's `output.reference` into `expected.expected` at
 * run time, so a replay must re-join the dataset by example id. Grading
 * against a missing reference would score every answer as inaccurate.
 */
export type ReferenceLookup = (exampleId: string) => string | undefined;

/** One unit of replayable work: a single (execution, example) trajectory. */
export interface ReplayCell {
  executionId: string;
  exampleId: string;
  modelId: string;
  /** The question put to the agent. */
  question: string;
  /** Ground-truth answer the correctness judge compares against. */
  expected: string;
  /** The agent's final message, i.e. what gets graded. */
  agentResponse: string;
  /**
   * The agent's intermediate steps (tool calls and their results).
   *
   * The groundedness judge verifies each claim against the evidence the agent
   * actually retrieved: it reads `output.steps` and passes it to the prompt as
   * `tool_call_history`. Replaying with only the final message leaves that
   * history empty, so every specific claim becomes unverifiable and the judge
   * returns MAJOR_HALLUCINATIONS for answers it had graded as grounded moments
   * earlier -- a property of the harness, not of the model or the judge.
   *
   * Steps are `_source`-only on the score documents (not indexed), so they can
   * be read back but never filtered on.
   */
  steps: unknown[];
  /**
   * The raw `task.output` object, retained verbatim.
   *
   * Suites other than persona-matrix grade a different slice of the output than
   * the message transcript: Attack Discovery's Criteria and Rubric evaluators
   * read `output.insights`. Flattening every cell to question/response/steps
   * discards that payload, so a non-persona jury would receive an empty
   * submission and score it N/A.
   */
  taskOutput?: unknown;
  /**
   * Structured ground truth, when the suite has one.
   *
   * `expected` is the prose rendering the correctness judge compares against;
   * suites whose evaluators consume the original objects (AD's `criteria[]` and
   * `attackDiscoveries`) need them unflattened.
   */
  expectedStructured?: unknown;
  /** Golden `metadata.suite_id`, used to resolve the jury for this cell. */
  suiteId?: string;
  /** Source document's timestamp, retained for provenance. */
  recordedAt: string;
}

export interface PlanIssue {
  executionId: string;
  exampleId: string;
  reason: string;
}

export interface ReplayPlan {
  cells: ReplayCell[];
  /** Cells that cannot be replayed, with why. Never silently dropped. */
  skipped: PlanIssue[];
}

/** Extract the graded text from a task output's message list. */
export function lastAgentMessage(output: unknown): string | undefined {
  const messages = (output as { messages?: Array<{ message?: unknown }> })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return undefined;
  }
  const last = messages[messages.length - 1]?.message;
  if (typeof last === 'string') {
    return last;
  }
  if (last && typeof last === 'object') {
    const content = (last as { content?: unknown }).content;
    if (typeof content === 'string') {
      return content;
    }
  }
  return undefined;
}

/** Extract the agent's intermediate steps (tool calls + results) from a task output. */
export function agentSteps(output: unknown): unknown[] {
  const steps = (output as { steps?: unknown })?.steps;
  return Array.isArray(steps) ? steps : [];
}

/**
 * Build a replay plan from golden score documents.
 *
 * Deduplicates by (executionId, exampleId): a cell carries one trajectory but
 * many evaluator documents, and re-judging the same trajectory once per
 * evaluator would multiply judge cost by the evaluator count and write
 * conflicting analyses for a single cell.
 *
 * A document missing the question, the ground truth, or the agent's response
 * cannot be graded; it is reported in `skipped` rather than being replayed
 * against empty strings, which would silently manufacture MAJOR_INACCURACIES
 * verdicts for cells whose data merely failed to load.
 */
export function planReplay(
  docs: EvaluationScoreDocument[],
  referenceFor: ReferenceLookup,
  options: {
    /**
     * Jury for the suite being replayed. When supplied it defines
     * replayability; when omitted the persona-matrix contract
     * (question + prose reference + final message) applies.
     */
    jury?: JuryAdapter;
    /** Structured ground truth lookup, for juries that grade objects. */
    structuredReferenceFor?: (exampleId: string) => unknown;
    /**
     * Golden field the reference keys correspond to, matching the adapter's
     * `joinField`. attack-discovery documents all carry `example.id = '0'`, so
     * keying cells on the id there merges nine scenarios into one and grades
     * eight of them against the wrong ground truth.
     */
    joinField?: string;
  } = {}
): ReplayPlan {
  const { jury, structuredReferenceFor, joinField = DEFAULT_JOIN_FIELD } = options;
  const cells = new Map<string, ReplayCell>();
  const skipped: PlanIssue[] = [];
  const seenSkips = new Set<string>();

  for (const doc of docs) {
    const executionId = doc.metadata?.execution_id ?? '';
    const exampleId = joinValue(doc, joinField);
    const key = `${executionId}::${exampleId}`;
    if (cells.has(key)) {
      continue;
    }

    const question = (doc.example?.input as { question?: unknown })?.question;
    // Reference comes from the dataset, not the document (see ReferenceLookup).
    const expected = exampleId ? referenceFor(exampleId) : undefined;
    const agentResponse = lastAgentMessage(doc.task?.output);

    const candidate: ReplayCell = {
      executionId,
      exampleId,
      modelId: doc.task?.model?.id ?? '',
      question: typeof question === 'string' ? question : '',
      expected: typeof expected === 'string' ? expected : '',
      agentResponse: agentResponse ?? '',
      steps: agentSteps(doc.task?.output),
      taskOutput: doc.task?.output,
      expectedStructured: exampleId ? structuredReferenceFor?.(exampleId) : undefined,
      suiteId: doc.metadata?.suite_id,
      recordedAt: doc['@timestamp'],
    };

    const missing: string[] = [];
    if (typeof question !== 'string' || !question) missing.push('question');

    if (jury) {
      // The jury decides what a replayable cell looks like for its suite.
      // Attack Discovery grades `output.insights`, so requiring a final agent
      // message here would skip cells that are perfectly gradable -- the
      // defect that made 433 of 800 AD cells look unreplayable.
      if (!jury.toArgs(candidate)) {
        missing.push(`gradable ${jury.name} output`);
      }
    } else {
      if (typeof expected !== 'string' || !expected) missing.push('dataset reference');
      if (!agentResponse) missing.push('agent response');
    }

    if (missing.length > 0) {
      if (!seenSkips.has(key)) {
        seenSkips.add(key);
        skipped.push({
          executionId,
          exampleId,
          reason: `missing ${missing.join(', ')}`,
        });
      }
      continue;
    }

    cells.set(key, candidate);
  }

  // A cell whose first document was incomplete but whose later documents carry
  // the trajectory is replayable: report it as a cell, not as both a cell and a
  // skip. Evaluator documents for one cell arrive in no guaranteed order, so
  // resolving this by document order would make the plan order-dependent.
  const resolved = new Set(cells.keys());
  return {
    cells: [...cells.values()],
    skipped: skipped.filter((s) => !resolved.has(`${s.executionId}::${s.exampleId}`)),
  };
}

/**
 * Derive the execution id a replay writes under.
 *
 * Re-judged scores MUST NOT be written back under the source execution id:
 * the matrix aggregates by execution, so mixing two judges' verdicts into one
 * execution produces a cell that is silently an average of disagreeing judges.
 */
export function replayExecutionId(sourceExecutionId: string, judgeTag: string): string {
  if (!judgeTag) {
    throw new Error('replay requires a judge tag so re-judged scores stay separable');
  }
  return `${sourceExecutionId}::rejudge-${judgeTag}`;
}

/** Estimated cost of a replay, for the pre-flight summary. */
export function summarizePlan(plan: ReplayPlan): string {
  const models = new Set(plan.cells.map((c) => c.modelId));
  const executions = new Set(plan.cells.map((c) => c.executionId));
  return (
    `${plan.cells.length} cell(s) across ${models.size} model(s), ` +
    `${executions.size} execution(s)` +
    (plan.skipped.length > 0 ? `; ${plan.skipped.length} unreplayable` : '')
  );
}
