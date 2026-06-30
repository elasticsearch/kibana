/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { logWorkflowsRouteError } from './log_workflows_route_error';

describe('logWorkflowsRouteError', () => {
  it('logs framework errors at error level with context', () => {
    const logger = loggingSystemMock.createLogger();
    const error = new Error('engine failed');

    logWorkflowsRouteError(logger, error, {
      route: 'POST /api/workflows/workflow/{id}/run',
      workflowId: 'wf-1',
      spaceId: 'default',
    });

    expect(logger.error).toHaveBeenCalledWith('Workflows API request failed', {
      route: 'POST /api/workflows/workflow/{id}/run',
      workflowId: 'wf-1',
      spaceId: 'default',
      workflowExecutionId: undefined,
      errorMessage: 'engine failed',
      errorName: 'Error',
      isUserError: false,
      error,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs user errors at warn level', () => {
    const logger = loggingSystemMock.createLogger();
    const error = Object.assign(new Error('invalid input'), { isUserError: true as const });

    logWorkflowsRouteError(logger, error, {
      route: 'POST /api/workflows/test',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Workflows API request failed',
      expect.objectContaining({
        isUserError: true,
        errorMessage: 'invalid input',
      })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
