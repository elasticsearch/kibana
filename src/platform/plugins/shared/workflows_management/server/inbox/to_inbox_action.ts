/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { InboxAction, InboxActionStatus } from '@kbn/inbox-common';
import type { EsWorkflowStepExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';

/**
 * Best-effort heuristic that distinguishes approve-vs-reject outcomes
 * from the responder's submitted payload. The inbox-common contract's
 * `status` is a closed enum (`pending | approved | rejected`) and the
 * workflow team has not yet landed first-class "rejection" conventions
 * on the workflow YAML side, so we infer from a small set of common
 * shapes that workflow authors tend to use:
 *
 *   - `{ approved: false }`     (the canonical inbox-demo shape)
 *   - `{ action: 'reject' }`    (free-form reject signals)
 *   - `{ decision: 'reject' }`  (alternative free-form signal)
 *   - any of the above with `'rejected' / 'denied' / 'declined'`
 *     case-insensitive
 *
 * Anything we can't confidently classify as a rejection falls through
 * to `'approved'` — matching the existing v1 placeholder behavior so
 * we never regress existing rows. The heuristic is intentionally
 * conservative: false positives on rejection are worse than false
 * negatives, because the audit feed surfaces a red badge that's
 * jarring if shown for a normal approval.
 *
 * Promoting this from heuristic to a first-class workflow convention
 * (e.g. an `approve_path` / `reject_path` block on the `waitForInput`
 * step) is tracked alongside the per-action status work — out of
 * scope for the inbox history MVP.
 */
export const deriveHistoryStatus = (
  responseInput: Record<string, unknown> | null
): InboxActionStatus => {
  if (!responseInput) {
    return 'approved';
  }

  if (responseInput.approved === false) {
    return 'rejected';
  }

  const isRejectVerb = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return (
      normalized === 'reject' ||
      normalized === 'rejected' ||
      normalized === 'deny' ||
      normalized === 'denied' ||
      normalized === 'decline' ||
      normalized === 'declined'
    );
  };

  if (isRejectVerb(responseInput.action) || isRejectVerb(responseInput.decision)) {
    return 'rejected';
  }

  return 'approved';
};

/**
 * Composite identifier that makes a Workflows step execution uniquely
 * addressable within the Inbox. Format: `workflowId:workflowRunId:stepExecutionId`.
 * The `workflowRunId` is what the `resume` API needs, and the `id` (step
 * execution doc id) is retained for traceability / future sub-workflow
 * propagation work per [security-team#16710](https://github.com/elastic/security-team/issues/16710).
 */
export const buildWorkflowSourceId = (step: EsWorkflowStepExecution): string =>
  `${step.workflowId}:${step.workflowRunId}:${step.id}`;

/**
 * Extracts the `workflowRunId` (a.k.a. executionId) from a composite source id.
 * Returns `null` if the source id is malformed — the route handler treats
 * that as a 404.
 */
export const parseWorkflowSourceId = (
  sourceId: string
): { workflowId: string; executionId: string; stepExecutionId: string } | null => {
  const parts = sourceId.split(':');
  if (parts.length < 3) return null;
  const [workflowId, executionId, ...rest] = parts;
  return {
    workflowId,
    executionId,
    // Re-join in case the step execution id contains colons (defensive).
    stepExecutionId: rest.join(':'),
  };
};

/**
 * Maps a paused `waitForInput` step execution to the common {@link InboxAction}
 * shape. Pure function, no plugin deps — safe to unit test in isolation.
 *
 * Aligned with HITL GA [security-team#16707](https://github.com/elastic/security-team/issues/16707) (schema-driven form):
 * we surface `input.message` as the responder's prompt and `input.schema` as
 * the shape the response must conform to.
 */
export const toInboxAction = (
  step: EsWorkflowStepExecution,
  reasoning?: Record<string, unknown> | null
): InboxAction => {
  const input = (step.input ?? {}) as {
    message?: unknown;
    schema?: unknown;
  };
  const message =
    typeof input.message === 'string' && input.message.length > 0 ? input.message : undefined;
  const schema =
    input.schema && typeof input.schema === 'object' && !Array.isArray(input.schema)
      ? (input.schema as Record<string, unknown>)
      : undefined;

  return {
    id: buildWorkflowSourceId(step),
    source_app: 'workflows',
    source_id: buildWorkflowSourceId(step),
    status: 'pending',
    // Short summary: prefer the rendered message, fall back to step id.
    title: message ?? `Step "${step.stepId}" is waiting for input`,
    description: `Workflow ${step.workflowId} — step "${step.stepId}"`,
    input_message: message,
    input_schema: schema,
    created_at: step.startedAt,
    response_mode: 'pending',
    // Soft-interface reasoning resolved from the step preceding this
    // `waitForInput` (see `resolvePredecessorReasoning`). Null when the
    // predecessor produced no `reasoning` blob.
    reasoning: reasoning ?? null,
    // `timeout_at` and `response_mode: 'timed_out'` will land with the
    // step-level timeout work tracked in [security-team#16708](https://github.com/elastic/security-team/issues/16708).
  };
};

/**
 * Maps a terminated *or* responded-but-not-yet-resumed `waitForInput`
 * step execution to an {@link InboxAction} for the Inbox history (audit
 * log) feed.
 *
 * Two source-of-truth windows feed this mapper:
 *   1. **Responded, not yet resumed** — `hitl.respondedAt` is set but the
 *      engine hasn't written `finishedAt`. The step row is still
 *      `WAITING_FOR_INPUT`. The audit fields (`hitl.respondedBy`,
 *      `hitl.respondedAt`, `hitl.channel`) come straight from
 *      `markStepAsResponded`, which fires synchronously from the
 *      responder's request.
 *      `response_input` is the input the responder submitted, taken from
 *      the step's `input` snapshot? No — at this point the engine has
 *      not yet promoted the input to `output`, so we leave it `null`
 *      and let the next refetch (after Task Manager runs) fill it in.
 *   2. **Terminated** — `finishedAt` is set, status ∈ `completed |
 *      failed | cancelled`. `response_input` reads from `output`, which
 *      is what the engine writes via `finishStep(resumeInput)`.
 *
 * `response_mode`:
 *   - `'responded'` for clean completions and for the responded-but-not-
 *     yet-resumed window (UI may overlay a "Processing…" indicator on
 *     this row in the audit feed).
 *   - `'timed_out'` when the step settled with an error (covers the
 *     workflow-level timeout monitor and other failure paths).
 *
 * v1 maps `status` via {@link deriveHistoryStatus} — a conservative
 * payload-shape heuristic that flips to `'rejected'` for the common
 * `{ approved: false }` and `action: 'reject'` shapes, and otherwise
 * defaults to `'approved'`. First-class approve/reject conventions on
 * the workflow YAML side will replace the heuristic in a follow-up.
 */
export const toInboxHistoryAction = (
  step: EsWorkflowStepExecution,
  reasoning?: Record<string, unknown> | null,
  options?: { workflowDeleted?: boolean }
): InboxAction => {
  const input = (step.input ?? {}) as { message?: unknown; schema?: unknown };
  const promptMessage =
    typeof input.message === 'string' && input.message.length > 0 ? input.message : undefined;
  const promptSchema =
    input.schema && typeof input.schema === 'object' && !Array.isArray(input.schema)
      ? (input.schema as Record<string, unknown>)
      : undefined;

  // Step output is only populated after the engine resumes and runs
  // `finishStep(resumeInput)`. During the responded-but-not-resumed
  // window it stays null; the refetch after the resume picks it up.
  const responseInput =
    step.output && typeof step.output === 'object' && !Array.isArray(step.output)
      ? (step.output as Record<string, unknown>)
      : null;

  const settledAbnormally =
    Boolean(step.error) ||
    step.status === ExecutionStatus.FAILED ||
    step.status === ExecutionStatus.CANCELLED;

  // `hitl.respondedAt` is the truth-bearer for "a human said something".
  // Fall back to `finishedAt` for legacy rows from before the audit
  // fields shipped (and for abnormal terminations where no human
  // responded — the responder column will simply render empty in those
  // cases).
  const respondedAt = step.hitl?.respondedAt ?? step.finishedAt ?? null;

  return {
    id: buildWorkflowSourceId(step),
    source_app: 'workflows',
    source_id: buildWorkflowSourceId(step),
    status: deriveHistoryStatus(responseInput),
    title: promptMessage ?? `Step "${step.stepId}" was processed`,
    description: `Workflow ${step.workflowId} — step "${step.stepId}"`,
    input_message: promptMessage,
    input_schema: promptSchema,
    created_at: step.startedAt,
    responded_at: respondedAt,
    responded_by: step.hitl?.respondedBy ?? null,
    channel: step.hitl?.channel ?? null,
    response_mode: settledAbnormally ? 'timed_out' : 'responded',
    response_input: responseInput,
    // Soft-interface reasoning resolved from the step preceding this
    // `waitForInput` (see `resolvePredecessorReasoning`). Null when the
    // predecessor produced no `reasoning` blob.
    reasoning: reasoning ?? null,
    // The audit feed retains rows for deleted workflows; flag them so the UI
    // can make it clear the originating workflow is gone.
    source_deleted: options?.workflowDeleted ?? false,
  };
};
