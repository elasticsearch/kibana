/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { executeWorkflow } from './execute_workflow';

type WorkflowApi = WorkflowsServerPluginSetup['management'];

const mockSetAttribute = jest.fn();
const mockUpdateName = jest.fn();
const mockSpanFactory = jest.fn((_name: string, _opts: unknown, fn: (span?: unknown) => unknown) =>
  fn({ setAttribute: mockSetAttribute, updateName: mockUpdateName })
);

jest.mock('@kbn/inference-tracing', () => ({
  withActiveInferenceSpan: (...args: unknown[]) =>
    (mockSpanFactory as unknown as (...a: unknown[]) => unknown)(...args),
  ElasticGenAIAttributes: { InferenceSpanKind: 'InferenceSpanKind' },
  GenAISemanticConventions: {
    GenAIOperationName: 'gen_ai.operation.name',
    GenAIWorkflowName: 'gen_ai.workflow.name',
  },
}));

jest.mock('./get_execution_state', () => ({
  toWorkflowExecutionState: jest.fn((execution) => ({
    execution_id: execution.id,
    status: execution.status,
    workflow_id: execution.workflowId,
    started_at: execution.startedAt,
    finished_at: execution.finishedAt,
    workflow_name: execution.workflowDefinition.name,
  })),
}));

describe('executeWorkflow', () => {
  const request = httpServerMock.createKibanaRequest();
  let mockWorkflowApi: jest.Mocked<WorkflowApi>;

  const workflowExecution = {
    id: 'exec-1',
    workflowId: 'wf-1',
    status: ExecutionStatus.COMPLETED,
    startedAt: '2025-01-01T00:00:00.000Z',
    finishedAt: '2025-01-01T00:00:01.000Z',
    workflowDefinition: {
      name: 'Test Workflow',
      steps: [],
    },
    stepExecutions: [],
  };

  beforeEach(() => {
    mockWorkflowApi = {
      executeWorkflow: jest.fn().mockResolvedValue({
        workflowExecutionId: 'exec-1',
        execution: workflowExecution,
      }),
    } as unknown as jest.Mocked<WorkflowApi>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('forwards metadata to executeWorkflow when provided (saved workflow)', async () => {
    const result = await executeWorkflow({
      workflowId: 'wf-1',
      workflowParams: {},
      request,
      spaceId: 'default',
      workflowApi: mockWorkflowApi,
      waitForCompletion: false,
      metadata: { agent_id: 'agent-abc' },
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockWorkflowApi.executeWorkflow).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      inputs: {},
      request,
      spaceId: 'default',
      waitForCompletion: false,
      completionTimeoutSec: 120,
      metadata: { agent_id: 'agent-abc' },
    });
    expect(mockSetAttribute).toHaveBeenCalledWith('gen_ai.workflow.name', 'Test Workflow');
  });

  it('passes undefined metadata to executeWorkflow when not provided', async () => {
    const result = await executeWorkflow({
      workflowId: 'wf-1',
      workflowParams: {},
      request,
      spaceId: 'default',
      workflowApi: mockWorkflowApi,
      waitForCompletion: false,
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockWorkflowApi.executeWorkflow).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      inputs: {},
      request,
      spaceId: 'default',
      waitForCompletion: false,
      completionTimeoutSec: 120,
      metadata: undefined,
    });
  });

  it('returns error when workflow is not found', async () => {
    mockWorkflowApi.executeWorkflow.mockRejectedValue(new Error("Workflow 'missing' not found."));

    const result = await executeWorkflow({
      workflowId: 'missing',
      workflowParams: {},
      request,
      spaceId: 'default',
      workflowApi: mockWorkflowApi,
    });

    expect(result.success).toBe(false);
    expect(mockWorkflowApi.executeWorkflow).toHaveBeenCalled();
  });

  it('returns error when workflow is disabled', async () => {
    mockWorkflowApi.executeWorkflow.mockRejectedValue(
      new Error("Workflow 'wf-1' is disabled and cannot be executed.")
    );

    const result = await executeWorkflow({
      workflowId: 'wf-1',
      workflowParams: {},
      request,
      spaceId: 'default',
      workflowApi: mockWorkflowApi,
    });

    expect(result.success).toBe(false);
    expect(mockWorkflowApi.executeWorkflow).toHaveBeenCalled();
  });

  it('forwards inline yaml and omits workflow id from span attributes when not provided', async () => {
    const result = await executeWorkflow({
      yaml: 'version: "1"\nname: foo\ntriggers:\n  - type: manual\nsteps: []\n',
      workflowParams: { foo: 'bar' },
      request,
      spaceId: 'default',
      workflowApi: mockWorkflowApi,
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockWorkflowApi.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        yaml: 'version: "1"\nname: foo\ntriggers:\n  - type: manual\nsteps: []\n',
        workflowId: undefined,
        name: undefined,
        inputs: { foo: 'bar' },
      })
    );
    expect(mockSpanFactory).toHaveBeenCalledWith(
      'invoke_workflow ephemeral',
      expect.objectContaining({
        attributes: expect.not.objectContaining({ 'elastic.workflow.id': expect.anything() }),
      }),
      expect.any(Function)
    );
  });

  it('forwards inline yaml with explicit workflowId and includes it in span attributes', async () => {
    await executeWorkflow({
      yaml: 'version: "1"\nname: foo\ntriggers:\n  - type: manual\nsteps: []\n',
      workflowId: 'preview-id',
      name: 'preview',
      workflowParams: {},
      request,
      spaceId: 'default',
      workflowApi: mockWorkflowApi,
    });

    expect(mockWorkflowApi.executeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        yaml: 'version: "1"\nname: foo\ntriggers:\n  - type: manual\nsteps: []\n',
        workflowId: 'preview-id',
        name: 'preview',
      })
    );
    expect(mockSpanFactory).toHaveBeenCalledWith(
      'invoke_workflow preview-id',
      expect.objectContaining({
        attributes: expect.objectContaining({ 'elastic.workflow.id': 'preview-id' }),
      }),
      expect.any(Function)
    );
  });
});
