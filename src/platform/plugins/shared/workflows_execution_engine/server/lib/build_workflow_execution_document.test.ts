/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowExecutionEngineModel } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { buildWorkflowExecutionDocument } from './build_workflow_execution_document';
import {
  MISSING_EXECUTION_IDENTITY_ERROR_TYPE,
  MISSING_EXECUTION_IDENTITY_MESSAGE,
  UNKNOWN_EXECUTION_IDENTITY,
} from './execution_identity';

const baseWorkflow: WorkflowExecutionEngineModel = {
  id: 'workflow-1',
  name: 'Test Workflow',
  enabled: true,
  definition: {
    name: 'Test Workflow',
    version: '1',
    enabled: true,
    triggers: [],
    steps: [],
  },
  yaml: 'name: Test Workflow',
  isTestRun: false,
};

const baseParams = {
  workflow: baseWorkflow,
  context: { spaceId: 'default' },
  defaultTriggeredBy: 'manual',
  authenticatedUser: 'user-1',
  now: new Date('2024-06-01T12:00:00.000Z'),
  maxEventChainDepth: 10,
  getConcurrencyGroupKey: () => null,
};

describe('buildWorkflowExecutionDocument', () => {
  it('uses a caller-provided execution ID', () => {
    expect(
      buildWorkflowExecutionDocument({ ...baseParams, executionId: 'caller-execution-id' }).id
    ).toBe('caller-execution-id');
  });

  it('sets version when workflow has version', () => {
    const workflowExecution = buildWorkflowExecutionDocument({
      ...baseParams,
      workflow: { ...baseWorkflow, version: 3 },
    });

    expect(workflowExecution.version).toBe(3);
  });

  it('omits version when workflow has no version', () => {
    const workflowExecution = buildWorkflowExecutionDocument(baseParams);

    expect(workflowExecution.version).toBeUndefined();
  });

  it('omits version when workflow has an invalid numeric version', () => {
    const workflowExecution = buildWorkflowExecutionDocument({
      ...baseParams,
      workflow: { ...baseWorkflow, version: Number.NaN },
    });

    expect(workflowExecution.version).toBeUndefined();
  });

  it('builds core execution fields', () => {
    const workflowExecution = buildWorkflowExecutionDocument(baseParams);

    expect(workflowExecution).toMatchObject({
      spaceId: 'default',
      workflowId: 'workflow-1',
      status: ExecutionStatus.PENDING,
      executedBy: 'user-1',
      triggeredBy: 'manual',
      createdAt: '2024-06-01T12:00:00.000Z',
    });
    expect(workflowExecution.id).toBeDefined();
  });

  it('fails the execution immediately when no identity is attached', () => {
    const workflowExecution = buildWorkflowExecutionDocument({
      ...baseParams,
      authenticatedUser: undefined,
    });

    expect(workflowExecution).toMatchObject({
      status: ExecutionStatus.FAILED,
      executedBy: UNKNOWN_EXECUTION_IDENTITY,
      finishedAt: '2024-06-01T12:00:00.000Z',
      error: {
        type: MISSING_EXECUTION_IDENTITY_ERROR_TYPE,
        message: MISSING_EXECUTION_IDENTITY_MESSAGE,
      },
    });
  });

  it('does not treat a real principal named unknown as a missing identity', () => {
    const workflowExecution = buildWorkflowExecutionDocument({
      ...baseParams,
      authenticatedUser: 'unknown',
    });

    expect(workflowExecution).toMatchObject({
      status: ExecutionStatus.PENDING,
      executedBy: 'unknown',
    });
    expect(workflowExecution.error).toBeUndefined();
    expect(workflowExecution.finishedAt).toBeUndefined();
  });

  it('copies managed workflow billable metadata', () => {
    const workflowExecution = buildWorkflowExecutionDocument({
      ...baseParams,
      workflow: {
        ...baseWorkflow,
        managed: true,
        billable: true,
      },
    });

    expect(workflowExecution).toMatchObject({
      managed: true,
      billable: true,
    });
  });
});
