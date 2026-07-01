/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DEFAULT_WAIT_FOR_APPROVAL_TIMEOUT, DEFAULT_WAIT_FOR_INPUT_TIMEOUT } from '@kbn/workflows';
import { isWaitForApproval, isWaitForInput } from '@kbn/workflows/graph';
import { parseDuration } from '../../utils';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';

export function computeHitlWaitDeadlineMs(
  startedAt: string | undefined,
  timeout: string
): number | undefined {
  if (!startedAt) {
    return undefined;
  }

  return new Date(startedAt).getTime() + parseDuration(timeout);
}

export function hasHitlWaitExpired(
  startedAt: string | undefined,
  timeout: string,
  nowMs: number = Date.now()
): boolean {
  const deadlineMs = computeHitlWaitDeadlineMs(startedAt, timeout);
  if (deadlineMs === undefined) {
    return false;
  }

  return nowMs >= deadlineMs;
}

export function getHitlIdleDeadlineMsForStep(
  stepExecutionRuntime: StepExecutionRuntime
): number | undefined {
  const { node, stepExecution } = stepExecutionRuntime;
  if (!stepExecution?.startedAt) {
    return undefined;
  }

  if (isWaitForApproval(node)) {
    const timeout = node.configuration.timeout ?? DEFAULT_WAIT_FOR_APPROVAL_TIMEOUT;
    return computeHitlWaitDeadlineMs(stepExecution.startedAt, timeout);
  }

  if (isWaitForInput(node)) {
    const timeout = node.configuration.timeout ?? DEFAULT_WAIT_FOR_INPUT_TIMEOUT;
    return computeHitlWaitDeadlineMs(stepExecution.startedAt, timeout);
  }

  return undefined;
}
