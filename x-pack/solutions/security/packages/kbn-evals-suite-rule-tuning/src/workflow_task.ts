/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { HttpHandler } from '@kbn/core/public';
import {
  TerminalExecutionStatuses,
  NonTerminalExecutionStatuses,
  ExecutionStatus,
  type WorkflowExecutionDto,
  type WorkflowExecutionListDto,
  type WorkflowStepExecutionDto,
} from '@kbn/workflows';
import {
  RULE_TUNING_WORKER_WORKFLOW_ID,
  RULE_TUNING_REVIEW_WORKFLOW_ID,
  WORKFLOWS_API_VERSION,
  type ChangeType,
} from './constants';

/**
 * The `ai.agent` step (diagnose_rule) whose structured output we grade. Matched on
 * `stepType` so the harness survives step renames in the workflow definition.
 */
const AGENT_STEP_TYPE = 'ai.agent';

/** Structured output the diagnose step is schema-constrained to return (post-split schema). */
export interface RuleTuningProposal {
  change_type?: ChangeType;
  summary?: string;
  current_query?: string;
  proposed_query?: string;
  /** Free-form condition describing the exception; no structured entries post-split. */
  exception_condition?: string;
  rekey_required?: boolean;
}

/** Verdict graded by the suite's evaluators: the diagnose proposal plus run metadata. */
export interface RuleTuningVerdict extends RuleTuningProposal {
  executionId: string;
  executionStatus: ExecutionStatus;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTerminal = (status: ExecutionStatus): boolean => TerminalExecutionStatuses.includes(status);

/** GET params shared by every executions-list poll below. */
const nonTerminalQuery = { statuses: [...NonTerminalExecutionStatuses] };

/**
 * True while a REVIEW child execution is parked on its review_tuning
 * human-approval gate.
 *
 * The gate reports `waiting_for_input`, not `waiting` — an earlier bare-string check for
 * 'waiting' alone never matched, so every run sat at the gate until the next task's
 * stale-cancel killed it and no fixture ever scored. Exported so a test pins the contract.
 */
export const isAwaitingApproval = (status: ExecutionStatus): boolean =>
  status === ExecutionStatus.WAITING_FOR_INPUT || status === ExecutionStatus.WAITING;

/**
 * True for the 409 the resume route returns when an execution has reached `waiting_for_input`
 * but its waiting STEP row is not queryable yet.
 *
 * `resumeWorkflowExecution` resolves the waiting step via `getWaitingStepExecutionId` and
 * rejects with `is in status "waiting step not found" but expected "waiting_for_input"` when
 * that lookup comes back empty. That is a read-after-write race the harness should re-poll
 * through, not a real conflict — so this stays narrow. An "already responded to" 409 (a genuine
 * double-approval) does NOT match and still fails the run.
 */
export const isWaitingStepNotReady = (error: unknown): boolean =>
  /waiting step not found/.test(String((error as { message?: unknown })?.message ?? error));

/**
 * True for executions the runtime never actually ran — dropped by a concurrency
 * group or cancelled. Scoring these 0 would report an infrastructure collision as a
 * model failure.
 */
export const neverRan = (status: ExecutionStatus): boolean =>
  status === ExecutionStatus.SKIPPED || status === ExecutionStatus.CANCELLED;

/**
 * List non-terminal executions of one workflow.
 */
const listActiveExecutions = async (
  fetch: HttpHandler,
  workflowId: string
): Promise<WorkflowExecutionListDto> =>
  (await fetch(`/api/workflows/workflow/${workflowId}/executions`, {
    method: 'GET',
    version: WORKFLOWS_API_VERSION,
    headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
    query: nonTerminalQuery,
  })) as unknown as WorkflowExecutionListDto;

/**
 * Polls until a workflow has no non-terminal executions left.
 *
 * `/executions/cancel` returns before the runtime has actually torn the executions down,
 * and both the worker and its review children are concurrency-limited — scheduling into a
 * non-drained backlog gets the new run SKIPPED, which reads downstream as a legitimate
 * 0 score.
 */
const waitForNoActiveExecutions = async ({
  fetch,
  log,
  workflowId,
  pollIntervalMs,
  timeoutMs = 60_000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  workflowId: string;
  pollIntervalMs: number;
  timeoutMs?: number;
}): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { results = [] } = await listActiveExecutions(fetch, workflowId);
    if (results.length === 0) return;
    await sleep(pollIntervalMs);
  }
  log.warning(`Stale executions still active after ${timeoutMs}ms; scheduling anyway`);
};

const readDiagnoseStructuredOutput = (
  stepExecutions: WorkflowStepExecutionDto[]
): RuleTuningProposal | undefined => {
  const agentSteps = stepExecutions.filter((step) => step.stepType === AGENT_STEP_TYPE);
  for (const step of agentSteps) {
    const output = step.output as { structured_output?: RuleTuningProposal } | null | undefined;
    if (output?.structured_output) {
      return output.structured_output;
    }
  }
  return undefined;
};

/**
 * Explain why a completed REVIEW execution produced no proposal.
 *
 * Two causes are indistinguishable in the score (both yield 0) but demand opposite responses:
 * an agent step that ran out of time is a real model result, while a rule that failed the
 * diagnose gate is a fixture bug. The step list already carries the distinction, so classify it
 * here instead of asserting one cause and sending the reader to check the wrong thing.
 */
export const explainMissingProposal = (
  steps: Array<{ stepId: string; stepType?: string }>
): string => {
  const stepsRun = steps.map((s) => `${s.stepId}(${s.stepType})`).join(', ');
  const cause = steps.some((s) => s.stepType === 'step_level_timeout')
    ? `diagnose_rule hit its step timeout before proposing — the model was too slow to decide, not a seeding failure`
    : `diagnose_rule produced no proposal — the seeded rule likely failed the diagnose gate (check it is enabled)`;
  return `${cause}. Steps that ran: [${stepsRun}]`;
};

const getExecution = async (
  fetch: HttpHandler,
  executionId: string
): Promise<WorkflowExecutionDto> =>
  (await fetch(`/api/workflows/executions/${executionId}`, {
    method: 'GET',
    version: WORKFLOWS_API_VERSION,
    headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
    query: { includeOutput: true },
  })) as unknown as WorkflowExecutionDto;

/**
 * Auto-approve one review child's gate, retrying the 409 waiting-step race.
 *
 * The child reaching `waiting_for_input` does not guarantee its waiting STEP row is
 * queryable yet; `resumeWorkflowExecution` then rejects with 409 `waiting step not
 * found` — a read-after-write race, not a real conflict. Re-poll through it. A genuine
 * double-approval 409 does not match `isWaitingStepNotReady` and still throws.
 */
const resumeApprovalGate = async (
  fetch: HttpHandler,
  log: ToolingLog,
  executionId: string,
  pollIntervalMs: number
): Promise<boolean> => {
  try {
    await fetch(`/api/workflows/executions/${executionId}/resume`, {
      method: 'POST',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      body: JSON.stringify({ input: { approved: true } }),
    });
    log.info(`Auto-approved review_tuning gate for review execution ${executionId}`);
    return true;
  } catch (error) {
    if (!isWaitingStepNotReady(error)) {
      throw error;
    }
    log.info(
      `Approval gate for review execution ${executionId} is not resumable yet ` +
        `(waiting step not persisted); retrying after ${pollIntervalMs}ms`
    );
    await sleep(pollIntervalMs);
    return false;
  }
};

/**
 * PORTED 2026-09-11 for the post-#290097 split architecture. The fork harness
 * ran the old unified `system-security-rule-tuning` workflow; main splits it
 * into a worker sweep that fans out one review child per rule. New flow:
 *
 *  1. cancel stale worker+review executions (their inputs are not ours; a
 *     leftover non-terminal review also re-harvests nothing but blocks nothing
 *     — cancel anyway so the run starts from a clean slate),
 *  2. run the WORKER with min_fp_count:1 so the seeded rule is harvested,
 *  3. while the worker is in flight, discover its review CHILD executions
 *     (workflow-id = review, non-terminal, started after our worker run) and
 *     auto-approve each child's waitForApproval gate exactly like the external
 *     resume URL does ({ approved: true }),
 *  4. once the worker settles, grade the diagnose_rule structured_output from
 *     the (single, seeded) review child's stepExecutions.
 */
export const runRuleTuningWorkflow = async ({
  fetch,
  log,
  maxWaitMs = 12 * 60_000,
  pollIntervalMs = 3_000,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
  /**
   * No connector pinning post-split: the worker's manual-trigger schema is
   * `additionalProperties: false` with no connector input (the fork's unified
   * workflow had one). The review's ai.agent step resolves the space-default
   * connector — same contract as the merged rule-creation suite, where the
   * multi-model matrix is driven by the stack's connector configuration.
   */
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<{
  executionId: string;
  executionStatus: ExecutionStatus;
  proposal?: RuleTuningProposal;
}> => {
  for (const workflowId of [RULE_TUNING_WORKER_WORKFLOW_ID, RULE_TUNING_REVIEW_WORKFLOW_ID]) {
    const stale = await listActiveExecutions(fetch, workflowId);
    if ((stale.results ?? []).length > 0) {
      // Route cancels ALL active executions of this workflow (no body needed).
      await fetch(`/api/workflows/workflow/${workflowId}/executions/cancel`, {
        method: 'POST',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      });
      log.info(
        `Cancelled ${stale.results.length} stale non-terminal execution(s) of ${workflowId} before scheduling`
      );
      // Cancellation is async; scheduling before it settles means a concurrency
      // group silently SKIPS our run. Wait for the backlog to actually drain.
      await waitForNoActiveExecutions({ fetch, log, workflowId, pollIntervalMs });
    }
  }

  const runStartedAt = Date.now();

  const { workflowExecutionId } = (await fetch(
    `/api/workflows/workflow/${RULE_TUNING_WORKER_WORKFLOW_ID}/run`,
    {
      method: 'POST',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      body: JSON.stringify({
        // min_fp_count: 2 is the schema floor (a 1-alert group returns alert_ids as
        // a scalar and fails the review's array input); 2 keeps every seeded
        // cluster harvested. The old `concurrency_key` input belonged to the
        // unified workflow and has no post-split meaning.
        inputs: { min_fp_count: 2 },
      }),
    }
  )) as { workflowExecutionId: string };

  log.info(`Started rule-tuning worker execution ${workflowExecutionId}`);

  const deadline = Date.now() + maxWaitMs;
  let worker: WorkflowExecutionDto | undefined;
  /** Review executions we have already approved, so a re-poll cannot double-approve. */
  const approvedReviews = new Set<string>();

  while (Date.now() < deadline) {
    worker = await getExecution(fetch, workflowExecutionId);
    if (isTerminal(worker.status)) break;

    // Discover review children parked on their approval gates and approve them.
    // Reviews are keyed `rule-tuning-review-<rule_uuid>` (max:1, drop), so an
    // un-approved review also blocks any later sweep from re-opening that rule's
    // gate — approve, don't leave parked.
    const activeReviews = await listActiveExecutions(fetch, RULE_TUNING_REVIEW_WORKFLOW_ID);
    for (const review of activeReviews.results ?? []) {
      if (!approvedReviews.has(review.id) && isAwaitingApproval(review.status)) {
        const resumed = await resumeApprovalGate(fetch, log, review.id, pollIntervalMs);
        if (resumed) approvedReviews.add(review.id);
      }
    }

    await sleep(pollIntervalMs);
  }

  if (!worker) {
    throw new Error(`No execution returned for worker run ${workflowExecutionId}`);
  }

  if (!isTerminal(worker.status)) {
    log.warning(
      `Worker execution ${workflowExecutionId} did not reach a terminal status within ${maxWaitMs}ms (last status: ${worker.status})`
    );
  }

  // A run the runtime never executed (skipped by concurrency, or cancelled) carries no
  // review at all. Scoring it 0 would report an infrastructure collision as a model
  // failure, so fail loudly instead — an accurate low score is only meaningful if the
  // run actually ran.
  if (neverRan(worker.status)) {
    throw new Error(
      `Worker execution ${workflowExecutionId} never ran (status: ${worker.status}) — ` +
        `concurrency collision, not a model result.`
    );
  }

  // Every branch has settled once the worker is terminal; pick the review child
  // this run created (started at/after our run) — older reviews were cancelled above.
  const reviewChildren = (
    (await fetch(`/api/workflows/workflow/${RULE_TUNING_REVIEW_WORKFLOW_ID}/executions`, {
      method: 'GET',
      version: WORKFLOWS_API_VERSION,
      headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      query: { statuses: [...TerminalExecutionStatuses, ...NonTerminalExecutionStatuses] },
    })) as unknown as WorkflowExecutionListDto
  ).results.filter((r) => Date.parse(r.startedAt) >= runStartedAt);

  if (reviewChildren.length === 0) {
    throw new Error(
      `Worker execution ${workflowExecutionId} settled (status: ${worker.status}) but opened no ` +
        `review children — the seeded rule was not harvested. Check seed_fp_cluster tags/index and ` +
        `that the rule is enabled. Worker steps that ran: [${(worker.stepExecutions ?? [])
          .map((s) => `${s.stepId}(${s.stepType})`)
          .join(', ')}]`
    );
  }
  if (reviewChildren.length > 1) {
    // One seeded rule must yield exactly one review; more means our cancel pass
    // missed something or the stack is shared — both poison attribution.
    throw new Error(
      `Expected exactly 1 review child from the seeded fixture, found ${reviewChildren.length}: ` +
        `${reviewChildren.map((r) => `${r.id}@${r.status}`).join(', ')}`
    );
  }

  const review = await getExecution(fetch, reviewChildren[0].id);

  const proposal = readDiagnoseStructuredOutput(review.stepExecutions);

  // Reachability assert: if the review completed but produced no diagnose proposal,
  // distinguish the two causes the step list can already tell apart — the agent step
  // timing out (a real model result: too slow to decide) versus the seeded rule
  // failing the diagnose gate (a fixture bug). Naming the wrong one sends the reader
  // to check rule seeding when the model actually exceeded its step budget.
  if (!proposal?.change_type) {
    throw new Error(
      `Review execution ${review.id} settled (status: ${
        review.status
      }) but ${explainMissingProposal(review.stepExecutions ?? [])}`
    );
  }

  return {
    ...proposal,
    executionId: review.id,
    executionStatus: review.status,
  };
};
