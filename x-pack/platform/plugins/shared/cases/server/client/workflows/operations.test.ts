/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createCasesClientMockArgs } from '../mocks';
import { ensureAuthorizedToRunWorkflow } from '../cases/ensure_authorized_to_run_workflow';
import {
  preflightWorkflowExecution,
  recordWorkflowExecution,
} from '../user_actions/record_workflow_execution';
import { createCasesWorkflowOperations } from './operations';

jest.mock('../cases/ensure_authorized_to_run_workflow');
jest.mock('../user_actions/record_workflow_execution');

describe('createCasesWorkflowOperations', () => {
  const clientArgs = createCasesClientMockArgs();
  const operations = createCasesWorkflowOperations(clientArgs);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds authorization to the request-scoped client arguments', async () => {
    await operations.ensureAuthorizedToRunWorkflow({ ids: ['case-1'] });

    expect(ensureAuthorizedToRunWorkflow).toHaveBeenCalledWith({ ids: ['case-1'] }, clientArgs);
  });

  it('binds preflight to the request-scoped client arguments', async () => {
    await operations.preflightWorkflowExecution({ caseIds: ['case-1'] });

    expect(preflightWorkflowExecution).toHaveBeenCalledWith({ caseIds: ['case-1'] }, clientArgs);
  });

  it('binds activity recording to the request-scoped client arguments', async () => {
    const params = {
      entities: [{ id: 'case-1', owner: 'securitySolution' }],
      workflow: {
        id: 'workflow-1',
        name: 'Workflow',
        executionId: 'execution-1',
      },
    };

    await operations.recordWorkflowExecution(params);

    expect(recordWorkflowExecution).toHaveBeenCalledWith(params, clientArgs);
  });
});
