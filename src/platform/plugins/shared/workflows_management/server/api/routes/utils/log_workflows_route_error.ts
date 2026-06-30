/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';

export interface WorkflowsRouteErrorLogContext {
  route: string;
  workflowId?: string;
  spaceId?: string;
  workflowExecutionId?: string;
}

const LOG_MESSAGE = 'Workflows API request failed';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isUserError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isUserError' in error &&
    (error as { isUserError?: boolean }).isUserError === true
  );
}

export function logWorkflowsRouteError(
  logger: Logger,
  error: unknown,
  context: WorkflowsRouteErrorLogContext
): void {
  const normalizedError = toError(error);
  const meta = {
    route: context.route,
    workflowId: context.workflowId,
    spaceId: context.spaceId,
    workflowExecutionId: context.workflowExecutionId,
    errorMessage: normalizedError.message,
    errorName: normalizedError.name,
    isUserError: isUserError(error),
    error: normalizedError,
  };

  if (meta.isUserError) {
    logger.warn(LOG_MESSAGE, meta);
    return;
  }

  logger.error(LOG_MESSAGE, meta);
}
