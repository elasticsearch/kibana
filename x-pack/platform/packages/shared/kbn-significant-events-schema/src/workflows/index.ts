/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Canonical workflow execution status shared across all workflow types.
 * `BeingCanceled` is a client-only optimistic state; the server never returns it.
 */
export enum SignificantEventsWorkflowStatus {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  /** Client-only optimistic state; the server never returns this value. */
  BeingCanceled = 'being_canceled',
  Canceled = 'canceled',
  Failed = 'failed',
  Completed = 'completed',
}

/**
 * Workflow execution status result, shared by both client and server.
 * `T` extends the `Completed` variant with workflow-specific output data.
 *
 * `InProgress` and `BeingCanceled` carry `executionId?: string` because they may
 * be set optimistically before a server response provides the real id. All other
 * non-NotStarted variants carry `executionId: string`.
 *
 * `BeingCanceled` is a client-only optimistic state — the server never returns it,
 * but having it in the shared type is harmless since the server simply never
 * constructs that variant.
 */
export type SignificantEventsWorkflowStatusResult<T extends object = {}> =
  | { status: SignificantEventsWorkflowStatus.NotStarted; executionId: null }
  | {
      status:
        | SignificantEventsWorkflowStatus.InProgress
        | SignificantEventsWorkflowStatus.BeingCanceled;
      executionId?: string;
    }
  | ({ executionId: string } & (
      | { status: SignificantEventsWorkflowStatus.Canceled }
      | { status: SignificantEventsWorkflowStatus.Failed; error: string }
      | ({ status: SignificantEventsWorkflowStatus.Completed } & T)
    ));
