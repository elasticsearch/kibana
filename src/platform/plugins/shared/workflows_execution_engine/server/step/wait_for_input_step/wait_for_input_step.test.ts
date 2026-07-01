/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import type { WaitForInputStep } from '@kbn/workflows';
import type { WaitForInputGraphNode } from '@kbn/workflows/graph';
import { WaitForInputStepSchema } from '@kbn/workflows/spec/schema';
import { WaitForInputStepImpl } from './wait_for_input_step';
import type { ConnectorExecutor } from '../../connector_executor';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { ContextDependencies } from '../../workflow_context_manager/types';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';

describe('WaitForInputStepImpl', () => {
  let underTest: WaitForInputStepImpl;

  let node: WaitForInputGraphNode;
  let mockStepExecutionRuntime: jest.Mocked<StepExecutionRuntime>;
  let mockWorkflowRuntime: jest.Mocked<WorkflowExecutionRuntimeManager>;
  let workflowLogger: IWorkflowEventLogger;
  let mockConnectorExecutor: jest.Mocked<ConnectorExecutor>;
  let mockDependencies: ContextDependencies;

  beforeEach(() => {
    node = {
      id: 'wait-for-input-step',
      type: 'waitForInput',
      stepId: 'wait-for-input-step',
      stepType: 'waitForInput',
      configuration: {
        name: 'wait-for-input-step',
        type: 'waitForInput',
        with: { message: 'Please approve' },
      } as WaitForInputStep,
    };

    mockStepExecutionRuntime = {
      tryEnterWaitUntil: jest.fn().mockReturnValue(true),
      finishStep: jest.fn(),
      setInput: jest.fn(),
      updateWorkflowExecution: jest.fn(),
      stepExecutionId: 'test-step-exec-id',
      abortController: new AbortController(),
      contextManager: {
        renderValueAccordingToContext: jest.fn(<T>(v: T): T => v),
      },
    } as unknown as jest.Mocked<StepExecutionRuntime>;

    mockWorkflowRuntime = {
      navigateToNextNode: jest.fn(),
      getWorkflowExecution: jest.fn().mockReturnValue({ id: 'exec-abc', context: {} }),
    } as unknown as jest.Mocked<WorkflowExecutionRuntimeManager>;

    workflowLogger = {
      logDebug: jest.fn(),
    } as unknown as IWorkflowEventLogger;

    mockConnectorExecutor = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ConnectorExecutor>;

    mockDependencies = {
      spaceId: 'default',
      coreStart: {
        security: {
          authc: {
            apiKeys: {
              invalidateAsInternalUser: jest.fn().mockResolvedValue({}),
            },
          },
        },
      },
      cloudSetup: undefined,
    } as unknown as ContextDependencies;

    underTest = new WaitForInputStepImpl(
      node,
      mockStepExecutionRuntime,
      mockWorkflowRuntime,
      workflowLogger,
      mockConnectorExecutor,
      mockDependencies
    );
  });

  describe('first run — entering wait state', () => {
    beforeEach(() => {
      mockStepExecutionRuntime.tryEnterWaitUntil.mockReturnValue(true);
    });

    it('should call tryEnterWaitUntil with no date and WAITING_FOR_INPUT status', async () => {
      await underTest.run();

      expect(mockStepExecutionRuntime.tryEnterWaitUntil).toHaveBeenCalledWith(
        undefined,
        ExecutionStatus.WAITING_FOR_INPUT
      );
    });

    it('should call setInput with the step with config on first run', async () => {
      await underTest.run();
      expect(
        mockStepExecutionRuntime.contextManager.renderValueAccordingToContext
      ).toHaveBeenCalledWith('Please approve');
      expect(mockStepExecutionRuntime.setInput).toHaveBeenCalledWith({
        message: 'Please approve',
      });
    });

    it('should render message with the workflow context and persist schema verbatim', async () => {
      const schema = {
        type: 'object',
        properties: { approved: { type: 'boolean', title: '{{ do not touch }}' } },
      };
      node.configuration.with = {
        message: '{{inputs.message}}',
        schema,
      } as WaitForInputStep['with'];
      (
        mockStepExecutionRuntime.contextManager.renderValueAccordingToContext as jest.Mock
      ).mockImplementation((v: unknown) => (v === '{{inputs.message}}' ? 'hello world' : v));

      underTest = new WaitForInputStepImpl(
        node,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        workflowLogger,
        mockConnectorExecutor,
        mockDependencies
      );
      await underTest.run();

      expect(mockStepExecutionRuntime.setInput).toHaveBeenCalledWith({
        message: 'hello world',
        schema,
      });
    });

    it('should not call setInput when the with block is absent', async () => {
      node.configuration = {
        name: 'wait-for-input-step',
        type: 'waitForInput',
      } as WaitForInputStep;
      underTest = new WaitForInputStepImpl(
        node,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        workflowLogger,
        mockConnectorExecutor,
        mockDependencies
      );
      await underTest.run();
      expect(mockStepExecutionRuntime.setInput).not.toHaveBeenCalled();
    });

    it('should not finish the step on first run', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.finishStep).not.toHaveBeenCalled();
    });

    it('should not navigate on first run', async () => {
      await underTest.run();
      expect(mockWorkflowRuntime.navigateToNextNode).not.toHaveBeenCalled();
    });

    it('should not update workflow execution context on first run', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.updateWorkflowExecution).not.toHaveBeenCalled();
    });
  });

  describe('resume run — exiting wait state with input', () => {
    const resumeInput = { approved: true, comments: 'Looks good' };

    beforeEach(() => {
      mockStepExecutionRuntime.tryEnterWaitUntil.mockReturnValue(false);
      mockWorkflowRuntime.getWorkflowExecution.mockReturnValue({
        id: 'exec-abc',
        context: { resumeInput, resumedBy: 'jane.doe', otherKey: 'preserved' },
      } as any);
    });

    it('should call finishStep with the resumeInput from context', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.finishStep).toHaveBeenCalledWith({
        response: resumeInput,
        respondedBy: 'jane.doe',
      });
    });

    it('should not call setInput on resume run', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.setInput).not.toHaveBeenCalled();
    });

    it('should clear resumeInput from context while preserving other keys', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.updateWorkflowExecution).toHaveBeenCalledWith({
        context: { resumedBy: 'jane.doe', otherKey: 'preserved' },
      });
    });

    it('should call finishStep before navigating', async () => {
      const callOrder: string[] = [];
      mockStepExecutionRuntime.finishStep.mockImplementation(() => {
        callOrder.push('finishStep');
      });
      mockWorkflowRuntime.navigateToNextNode.mockImplementation(() => {
        callOrder.push('navigateToNextNode');
      });

      await underTest.run();

      expect(callOrder).toEqual(['finishStep', 'navigateToNextNode']);
    });

    it('should navigate to the next node', async () => {
      await underTest.run();
      expect(mockWorkflowRuntime.navigateToNextNode).toHaveBeenCalled();
    });

    it('should emit a hitl:resumed audit log event with responder identity', async () => {
      await underTest.run();
      expect(workflowLogger.logDebug).toHaveBeenCalledWith(
        'Workflow exec-abc resumed by jane.doe',
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'hitl:resumed',
            category: ['workflow'],
            outcome: 'success',
          }),
          labels: expect.objectContaining({
            responder: 'jane.doe',
            execution_id: 'exec-abc',
          }),
        })
      );
    });
  });

  describe('resume run — exiting wait state with no input', () => {
    beforeEach(() => {
      mockStepExecutionRuntime.tryEnterWaitUntil.mockReturnValue(false);
      mockWorkflowRuntime.getWorkflowExecution.mockReturnValue({
        id: 'exec-abc',
        context: {},
      } as any);
    });

    it('should call finishStep with undefined when resumeInput is absent', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.finishStep).toHaveBeenCalledWith({
        response: {},
        respondedBy: 'unknown',
      });
    });

    it('should not throw when resumeInput is absent', async () => {
      await expect(underTest.run()).resolves.not.toThrow();
    });

    it('should not call updateWorkflowExecution when resumeInput is absent', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.updateWorkflowExecution).not.toHaveBeenCalled();
    });

    it('should still navigate to the next node', async () => {
      await underTest.run();
      expect(mockWorkflowRuntime.navigateToNextNode).toHaveBeenCalled();
    });
  });

  describe('aborted runtime — race with workflow-level timeout', () => {
    // Regression: when the workflow-level timeout monitor fires in parallel
    // with a resume iteration, it aborts the step runtime and calls
    // `failStep(timeoutError)`. Without this guard the waitForInput step
    // proceeded to re-enter its wait state, overwriting `status: FAILED` back
    // to `status: WAITING_FOR_INPUT` (error/finishedAt survived because
    // `updateStep` spreads). The zombie step then permanently reappeared in
    // the Inbox because `listWaitingForInputSteps` filters only on status.
    beforeEach(() => {
      mockStepExecutionRuntime.abortController.abort();
    });

    it('should not call tryEnterWaitUntil when the runtime is already aborted', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.tryEnterWaitUntil).not.toHaveBeenCalled();
    });

    it('should not mutate step state when the runtime is already aborted', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.setInput).not.toHaveBeenCalled();
      expect(mockStepExecutionRuntime.finishStep).not.toHaveBeenCalled();
      expect(mockStepExecutionRuntime.updateWorkflowExecution).not.toHaveBeenCalled();
      expect(mockWorkflowRuntime.navigateToNextNode).not.toHaveBeenCalled();
    });

    it('should emit an observable hitl:aborted debug event', async () => {
      await underTest.run();
      expect(workflowLogger.logDebug).toHaveBeenCalledWith(
        expect.stringContaining('run aborted before wait-entry'),
        expect.objectContaining({ event: { action: 'hitl:aborted' } })
      );
    });
  });

  describe('resume run — exiting wait state with null context', () => {
    beforeEach(() => {
      mockStepExecutionRuntime.tryEnterWaitUntil.mockReturnValue(false);
      mockWorkflowRuntime.getWorkflowExecution.mockReturnValue({
        id: 'exec-abc',
        context: null,
      } as any);
    });

    it('should not throw when context is null', async () => {
      await expect(underTest.run()).resolves.not.toThrow();
    });

    it('should call finishStep with undefined', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.finishStep).toHaveBeenCalledWith({
        response: {},
        respondedBy: 'unknown',
      });
    });

    it('should not call updateWorkflowExecution when context is null', async () => {
      await underTest.run();
      expect(mockStepExecutionRuntime.updateWorkflowExecution).not.toHaveBeenCalled();
    });
  });
});

describe('WaitForInputStepSchema', () => {
  it('should accept a step without schema', () => {
    const result = WaitForInputStepSchema.safeParse({
      name: 'approve',
      type: 'waitForInput',
      with: { message: 'Please approve' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept a step with a valid JSON Schema', () => {
    const result = WaitForInputStepSchema.safeParse({
      name: 'approve',
      type: 'waitForInput',
      with: {
        message: 'Approve isolation?',
        schema: {
          properties: {
            approved: { type: 'boolean', default: true },
            reason: { type: 'string' },
          },
          required: ['approved'],
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.with?.schema?.properties).toHaveProperty('approved');
      expect(result.data.with?.schema?.required).toEqual(['approved']);
    }
  });

  it('should accept a step with no with block', () => {
    const result = WaitForInputStepSchema.safeParse({
      name: 'approve',
      type: 'waitForInput',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a step with invalid schema properties', () => {
    const result = WaitForInputStepSchema.safeParse({
      name: 'approve',
      type: 'waitForInput',
      with: {
        message: 'Approve?',
        schema: {
          properties: 'not-an-object',
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
