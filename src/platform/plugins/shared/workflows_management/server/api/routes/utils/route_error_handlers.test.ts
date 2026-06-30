/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { WorkflowDisabledError } from '@kbn/workflows/common/errors';
import { handleRouteError } from './route_error_handlers';
import { WorkflowChangeHistoryDisabledError } from '../../../lib/workflow_change_history_disabled_error';
import { ManagedWorkflowDeleteForbiddenError } from '../../managed_workflow_delete_error';
import { ManagedWorkflowUpdateForbiddenError } from '../../managed_workflow_errors';

describe('handleRouteError', () => {
  it('returns forbidden for managed workflow update policy errors', () => {
    const response = httpServerMock.createResponseFactory();

    handleRouteError(response, new ManagedWorkflowUpdateForbiddenError());

    expect(response.forbidden).toHaveBeenCalledWith({
      body: {
        message: 'Managed workflows cannot be edited. You can only enable or disable them.',
      },
    });
  });

  it('returns forbidden for managed workflow delete policy errors', () => {
    const response = httpServerMock.createResponseFactory();

    handleRouteError(response, new ManagedWorkflowDeleteForbiddenError());

    expect(response.forbidden).toHaveBeenCalledWith({
      body: {
        message: 'Managed workflows cannot be deleted.',
      },
    });
  });

  it('returns bad request with HISTORY_DISABLED code when change history is disabled', () => {
    const response = httpServerMock.createResponseFactory();

    handleRouteError(response, new WorkflowChangeHistoryDisabledError());

    expect(response.badRequest).toHaveBeenCalledWith({
      body: {
        message: 'Workflow version history is disabled.',
        attributes: {
          code: 'HISTORY_DISABLED',
        },
      },
    });
  });

  it('returns bad request for disabled workflow errors without logging', () => {
    const response = httpServerMock.createResponseFactory();
    const logger = loggingSystemMock.createLogger();

    handleRouteError(response, new WorkflowDisabledError('wf-1'), {
      logger,
      logContext: { route: 'POST /api/workflows/workflow/{id}/run', workflowId: 'wf-1' },
    });

    expect(response.badRequest).toHaveBeenCalledWith({
      body: {
        message: 'Workflow is disabled: wf-1. Enable the workflow to run it.',
      },
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs and returns 500 for unexpected errors when logger is provided', () => {
    const response = httpServerMock.createResponseFactory();
    const logger = loggingSystemMock.createLogger();
    const error = new Error('unexpected failure');

    handleRouteError(response, error, {
      logger,
      logContext: {
        route: 'POST /api/workflows/workflow/{id}/run',
        workflowId: 'wf-1',
        spaceId: 'default',
      },
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Workflows API request failed',
      expect.objectContaining({
        route: 'POST /api/workflows/workflow/{id}/run',
        workflowId: 'wf-1',
        spaceId: 'default',
        errorMessage: 'unexpected failure',
      })
    );
    expect(response.customError).toHaveBeenCalledWith({
      statusCode: 500,
      body: {
        message: 'Internal server error: Error: unexpected failure',
      },
    });
  });
});
