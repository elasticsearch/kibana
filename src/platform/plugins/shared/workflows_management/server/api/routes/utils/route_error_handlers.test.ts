/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { httpServerMock } from '@kbn/core/server/mocks';
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
});
