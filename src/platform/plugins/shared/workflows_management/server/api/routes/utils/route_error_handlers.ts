/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaResponseFactory, Logger } from '@kbn/core/server';
import {
  WorkflowDisabledError,
  WorkflowExecutionInvalidStatusError,
  WorkflowExecutionNotFoundError,
  WorkflowNotFoundError,
} from '@kbn/workflows/common/errors';
import {
  InvalidYamlSchemaError,
  InvalidYamlSyntaxError,
  isWorkflowConflictError,
  isWorkflowValidationError,
} from '@kbn/workflows-yaml';
import type { WorkflowsRouteErrorLogContext } from './log_workflows_route_error';
import { logWorkflowsRouteError } from './log_workflows_route_error';
import { WorkflowChangeHistoryDisabledError } from '../../../lib/workflow_change_history_disabled_error';
import { WorkflowHistoryEventNotFoundError } from '../../../lib/workflow_history_event_not_found_error';
import { WorkflowForbiddenError } from '../../workflow_forbidden_error';

/**
 * Unified error handler for workflow management routes
 * @param response - The response object from the route handler
 * @param error - The error that occurred
 * @param options - Optional configuration for error handling
 * @returns Appropriate error response
 */
export interface HandleRouteErrorOptions {
  checkNotFound?: boolean;
  logger?: Logger;
  logContext?: WorkflowsRouteErrorLogContext;
}

export function handleRouteError(
  response: KibanaResponseFactory,
  error: Error,
  options?: HandleRouteErrorOptions
) {
  if (options?.checkNotFound && error instanceof WorkflowExecutionNotFoundError) {
    return response.notFound();
  }

  if (error instanceof WorkflowExecutionInvalidStatusError) {
    return response.conflict({
      body: {
        message: error.message,
      },
    });
  }

  if (error instanceof InvalidYamlSyntaxError || error instanceof InvalidYamlSchemaError) {
    return response.badRequest({
      body: {
        message: `Invalid workflow yaml: ${error.message}`,
      },
    });
  }

  if (isWorkflowValidationError(error)) {
    return response.badRequest({
      body: error.toJSON(),
    });
  }

  if (error instanceof WorkflowNotFoundError) {
    return response.notFound({
      body: {
        message: error.message,
      },
    });
  }

  if (error instanceof WorkflowHistoryEventNotFoundError) {
    return response.notFound({
      body: {
        message: error.message,
      },
    });
  }

  // Generic error handler
  if (isWorkflowConflictError(error)) {
    return response.conflict({
      body: error.toJSON(),
    });
  }

  if (error instanceof WorkflowForbiddenError) {
    return response.forbidden({
      body: {
        message: error.message,
      },
    });
  }

  if (error instanceof WorkflowChangeHistoryDisabledError) {
    return response.badRequest({
      body: {
        message: error.message,
        attributes: {
          code: 'HISTORY_DISABLED',
        },
      },
    });
  }

  if (error instanceof WorkflowDisabledError) {
    return response.badRequest({
      body: {
        message: error.message,
      },
    });
  }

  if (options?.logger && options.logContext) {
    logWorkflowsRouteError(options.logger, error, options.logContext);
  }

  return response.customError({
    statusCode: 500,
    body: {
      message: `Internal server error: ${error}`,
    },
  });
}
