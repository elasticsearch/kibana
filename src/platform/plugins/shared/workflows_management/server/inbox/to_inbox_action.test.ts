/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowStepExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import {
  buildWorkflowSourceId,
  deriveHistoryStatus,
  parseWorkflowSourceId,
  toInboxAction,
  toInboxHistoryAction,
} from './to_inbox_action';

const buildStep = (overrides: Partial<EsWorkflowStepExecution> = {}): EsWorkflowStepExecution => ({
  spaceId: 'default',
  id: 'step-exec-1',
  stepId: 'wait_approval',
  stepType: 'waitForInput',
  scopeStack: [],
  workflowRunId: 'run-1',
  workflowId: 'wf-1',
  status: ExecutionStatus.WAITING_FOR_INPUT,
  startedAt: '2026-04-24T12:00:00.000Z',
  topologicalIndex: 0,
  globalExecutionIndex: 0,
  stepExecutionIndex: 0,
  input: {
    message: 'Approve isolation of host-42?',
    schema: {
      type: 'object',
      properties: { approved: { type: 'boolean' } },
      required: ['approved'],
    },
  },
  ...overrides,
});

describe('buildWorkflowSourceId / parseWorkflowSourceId', () => {
  it('round-trips a composite source id', () => {
    const step = buildStep();
    const id = buildWorkflowSourceId(step);
    expect(id).toBe('wf-1:run-1:step-exec-1');
    expect(parseWorkflowSourceId(id)).toEqual({
      workflowId: 'wf-1',
      executionId: 'run-1',
      stepExecutionId: 'step-exec-1',
    });
  });

  it('returns null for malformed ids', () => {
    expect(parseWorkflowSourceId('nope')).toBeNull();
    expect(parseWorkflowSourceId('a:b')).toBeNull();
  });

  it('re-joins trailing colons in the step execution id', () => {
    expect(parseWorkflowSourceId('wf:run:step:with:colons')).toEqual({
      workflowId: 'wf',
      executionId: 'run',
      stepExecutionId: 'step:with:colons',
    });
  });
});

describe('deriveHistoryStatus', () => {
  // Conservative heuristic: reject signals must be *explicit* in one of
  // the documented shapes, otherwise we default to `'approved'` so we
  // don't paint the audit feed red on ambiguous payloads.
  it('returns approved for null payloads (responded-but-not-resumed window)', () => {
    expect(deriveHistoryStatus(null)).toBe('approved');
  });

  it('returns approved for an empty object', () => {
    expect(deriveHistoryStatus({})).toBe('approved');
  });

  it('returns approved for { approved: true }', () => {
    expect(deriveHistoryStatus({ approved: true })).toBe('approved');
  });

  it('returns rejected for { approved: false }', () => {
    expect(deriveHistoryStatus({ approved: false })).toBe('rejected');
  });

  it.each(['reject', 'rejected', 'deny', 'denied', 'decline', 'declined', 'REJECT', '  Reject  '])(
    'returns rejected for { action: %p }',
    (verb) => {
      expect(deriveHistoryStatus({ action: verb })).toBe('rejected');
    }
  );

  it('returns rejected for { decision: "rejected" } (alternative free-form signal)', () => {
    expect(deriveHistoryStatus({ decision: 'rejected' })).toBe('rejected');
  });

  it('returns approved for unrelated free-text payloads (no false positives)', () => {
    expect(deriveHistoryStatus({ message: 'rejected the suggestion in chat' })).toBe('approved');
    expect(deriveHistoryStatus({ action: 'approve' })).toBe('approved');
    expect(deriveHistoryStatus({ approved: 'maybe' })).toBe('approved');
  });
});

describe('toInboxAction', () => {
  it('populates the core InboxAction fields from a paused waitForInput step', () => {
    const action = toInboxAction(buildStep());

    expect(action).toMatchObject({
      id: 'wf-1:run-1:step-exec-1',
      source_app: 'workflows',
      source_id: 'wf-1:run-1:step-exec-1',
      status: 'pending',
      title: 'Approve isolation of host-42?',
      input_message: 'Approve isolation of host-42?',
      input_schema: {
        type: 'object',
        properties: { approved: { type: 'boolean' } },
        required: ['approved'],
      },
      created_at: '2026-04-24T12:00:00.000Z',
      response_mode: 'pending',
    });
  });

  it('falls back to a generated title when the step has no rendered message', () => {
    const action = toInboxAction(
      buildStep({ input: { schema: { type: 'object', properties: {} } } })
    );
    expect(action.title).toBe('Step "wait_approval" is waiting for input');
    expect(action.input_message).toBeUndefined();
  });

  it('leaves input_schema undefined when the step input omits a schema', () => {
    const action = toInboxAction(buildStep({ input: { message: 'Confirm?' } }));
    expect(action.input_schema).toBeUndefined();
    expect(action.input_message).toBe('Confirm?');
  });

  it('leaves input_schema undefined when the step input is missing entirely', () => {
    const action = toInboxAction(buildStep({ input: undefined }));
    expect(action.input_schema).toBeUndefined();
    expect(action.input_message).toBeUndefined();
  });

  it('rejects array-valued schema payloads (defensive)', () => {
    const action = toInboxAction(
      buildStep({
        input: { message: 'Weird', schema: ['not', 'an', 'object'] },
      })
    );
    expect(action.input_schema).toBeUndefined();
  });

  it('uses approval-specific fallback title for waitForApproval steps', () => {
    const action = toInboxAction(
      buildStep({
        stepType: 'waitForApproval',
        input: {
          schema: { type: 'object', properties: { approved: { type: 'boolean' } } },
        },
      })
    );
    expect(action.title).toBe('Step "wait_approval" is waiting for approval');
  });
});

describe('toInboxHistoryAction', () => {
  const buildCompletedStep = (
    overrides: Partial<EsWorkflowStepExecution> = {}
  ): EsWorkflowStepExecution =>
    buildStep({
      status: ExecutionStatus.COMPLETED,
      finishedAt: '2026-04-24T12:30:00.000Z',
      output: { approved: true, reason: 'looks good' },
      ...overrides,
    });

  it('maps a clean approval payload to status: approved', () => {
    const action = toInboxHistoryAction(buildCompletedStep());
    expect(action.status).toBe('approved');
  });

  it('flips status to rejected for { approved: false } responses (canonical demo shape)', () => {
    const action = toInboxHistoryAction(
      buildCompletedStep({ output: { approved: false, reason: 'too risky' } })
    );
    expect(action.status).toBe('rejected');
  });

  it('flips status to rejected for free-form { action: "reject" } responses', () => {
    const action = toInboxHistoryAction(
      buildCompletedStep({ output: { action: 'reject', notes: 'wrong host' } })
    );
    expect(action.status).toBe('rejected');
  });

  it('marks completed steps with response_mode: responded', () => {
    const action = toInboxHistoryAction(buildCompletedStep());
    expect(action.response_mode).toBe('responded');
  });

  it('marks failed steps with response_mode: timed_out (covers workflow-timeout monitor races)', () => {
    const action = toInboxHistoryAction(
      buildCompletedStep({
        status: ExecutionStatus.FAILED,
        error: { type: 'TimeoutError', message: 'timed out' },
      })
    );
    expect(action.status).toBe('approved');
    expect(action.response_mode).toBe('timed_out');
  });

  it('marks cancelled steps with response_mode: timed_out without leaking workflow status into the inbox enum', () => {
    const action = toInboxHistoryAction(
      buildCompletedStep({ status: ExecutionStatus.CANCELLED, output: undefined })
    );
    expect(action.status).toBe('approved');
    expect(action.response_mode).toBe('timed_out');
  });

  it('exposes the responder payload as response_input', () => {
    const action = toInboxHistoryAction(buildCompletedStep());
    expect(action.response_input).toEqual({ approved: true, reason: 'looks good' });
  });

  it('returns response_input: null when the step has no output', () => {
    const action = toInboxHistoryAction(buildCompletedStep({ output: undefined }));
    expect(action.response_input).toBeNull();
  });

  it('returns response_input: null when the step output is not a plain object', () => {
    const action = toInboxHistoryAction(buildCompletedStep({ output: ['arr', 'output'] }));
    expect(action.response_input).toBeNull();
  });

  it('reads responded_by/at/channel directly from the step doc audit fields', () => {
    // These fields are populated synchronously by `markStepAsResponded`
    // before the engine resumes — see HITL multi-client design.
    const action = toInboxHistoryAction(
      buildCompletedStep({
        hitl: {
          respondedAt: '2026-04-24T12:25:00.000Z',
          respondedBy: 'alice',
          channel: 'inbox',
        },
      })
    );
    expect(action.responded_at).toBe('2026-04-24T12:25:00.000Z');
    expect(action.responded_by).toBe('alice');
    expect(action.channel).toBe('inbox');
  });

  it('falls back to finishedAt for legacy rows without respondedAt audit fields', () => {
    // Legacy / abnormal-termination case (no human responded): the
    // audit fields are absent so the responder column will simply
    // render empty.
    const action = toInboxHistoryAction(buildCompletedStep());
    expect(action.responded_at).toBe('2026-04-24T12:30:00.000Z');
    expect(action.responded_by).toBeNull();
    expect(action.channel).toBeNull();
  });

  it('marks the responded-but-not-yet-resumed window with respondedAt set + null response_input', () => {
    // Source-of-truth window #1: `markStepAsResponded` has fired but
    // Task Manager hasn't run the resume yet. Status is still
    // `WAITING_FOR_INPUT`, `finishedAt` is unset, `output` is unset —
    // so `response_input` is null. The UI uses (`response_mode` ===
    // `responded` && `response_input` == null) to render the
    // "Processing…" badge in the audit feed.
    const action = toInboxHistoryAction(
      buildStep({
        status: ExecutionStatus.WAITING_FOR_INPUT,
        hitl: {
          respondedAt: '2026-04-24T12:25:00.000Z',
          respondedBy: 'alice',
          channel: 'inbox',
        },
      })
    );
    expect(action.responded_at).toBe('2026-04-24T12:25:00.000Z');
    expect(action.responded_by).toBe('alice');
    expect(action.response_mode).toBe('responded');
    expect(action.response_input).toBeNull();
  });

  it('keeps the source_id stable across the responded-but-not-resumed and resumed windows', () => {
    const action = toInboxHistoryAction(buildCompletedStep());
    expect(action.source_id).toBe('wf-1:run-1:step-exec-1');
    expect(action.id).toBe(action.source_id);
  });

  it('defaults source_deleted to false when no deletion flag is passed', () => {
    const action = toInboxHistoryAction(buildCompletedStep());
    expect(action.source_deleted).toBe(false);
  });

  it('sets source_deleted: true when the parent workflow is flagged as deleted', () => {
    const action = toInboxHistoryAction(buildCompletedStep(), undefined, {
      workflowDeleted: true,
    });
    expect(action.source_deleted).toBe(true);
  });

  it('falls back to a generated title when the step has no rendered prompt', () => {
    const action = toInboxHistoryAction(
      buildCompletedStep({ input: { schema: { type: 'object' } } })
    );
    expect(action.title).toBe('Step "wait_approval" was processed');
  });
});
