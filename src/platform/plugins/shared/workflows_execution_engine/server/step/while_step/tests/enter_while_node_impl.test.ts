/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WhileStep } from '@kbn/workflows';
import type { EnterWhileNode } from '@kbn/workflows/graph';
import type { StepExecutionRuntime } from '../../../workflow_context_manager/step_execution_runtime';
import type { StepIoService } from '../../../workflow_context_manager/step_io_service';
import type { WorkflowExecutionRuntimeManager } from '../../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../../workflow_event_logger';
import { EnterWhileNodeImpl } from '../enter_while_node_impl';

describe('EnterWhileNodeImpl', () => {
  let node: EnterWhileNode;
  let workflowExecutionRuntimeManager: WorkflowExecutionRuntimeManager;
  let stepExecutionRuntime: StepExecutionRuntime;
  let workflowLogger: IWorkflowEventLogger;
  let stepIoService: StepIoService;
  let underTest: EnterWhileNodeImpl;

  beforeEach(() => {
    node = {
      id: 'testStep',
      type: 'enter-while',
      stepId: 'testStep',
      stepType: 'while',
      exitNodeId: 'exitNode',
      configuration: {
        condition: 'steps.testStep.inner_step.output.status : "success"',
      } as WhileStep,
    };
    workflowExecutionRuntimeManager = {} as unknown as WorkflowExecutionRuntimeManager;
    workflowExecutionRuntimeManager.navigateToNextNode = jest.fn();
    workflowExecutionRuntimeManager.navigateToNode = jest.fn();
    workflowExecutionRuntimeManager.enterScope = jest.fn();

    stepExecutionRuntime = {} as unknown as StepExecutionRuntime;
    stepExecutionRuntime.startStep = jest.fn();
    stepExecutionRuntime.finishStep = jest.fn();
    stepExecutionRuntime.getCurrentStepState = jest.fn();
    stepExecutionRuntime.setCurrentStepState = jest.fn();
    stepExecutionRuntime.setInput = jest.fn();

    workflowLogger = {} as unknown as IWorkflowEventLogger;
    workflowLogger.logDebug = jest.fn();

    stepIoService = {
      pinLoopSource: jest.fn(),
      unpinLoopScope: jest.fn(),
    } as unknown as StepIoService;

    underTest = new EnterWhileNodeImpl(
      node,
      workflowExecutionRuntimeManager,
      stepExecutionRuntime,
      workflowLogger,
      stepIoService
    );
  });

  describe('on the first enter', () => {
    beforeEach(() => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue(undefined);
    });

    it('should start the step', () => {
      underTest.run();

      expect(stepExecutionRuntime.startStep).toHaveBeenCalledWith();
    });

    it('should set input with the condition', () => {
      underTest.run();

      expect(stepExecutionRuntime.setInput).toHaveBeenCalledWith({
        condition: 'steps.testStep.inner_step.output.status : "success"',
      });
    });

    it('should pin the condition source outputs for the loop scope', () => {
      underTest.run();

      expect(stepIoService.pinLoopSource).toHaveBeenCalledWith(
        'testStep',
        'steps.testStep.inner_step.output.status : "success"'
      );
    });

    it('should initialize while state with iteration 0', () => {
      underTest.run();

      expect(stepExecutionRuntime.setCurrentStepState).toHaveBeenCalledTimes(1);
      expect(stepExecutionRuntime.setCurrentStepState).toHaveBeenCalledWith({
        iteration: 0,
      });
    });

    it('should enter the iteration scope', () => {
      underTest.run();

      expect(workflowExecutionRuntimeManager.enterScope).toHaveBeenCalledWith('0');
    });

    it('should navigate to the next node (body)', () => {
      underTest.run();

      expect(workflowExecutionRuntimeManager.navigateToNextNode).toHaveBeenCalled();
    });

    it('should log a debug message', () => {
      underTest.run();

      expect(workflowLogger.logDebug).toHaveBeenCalledWith(
        'While step "testStep" starting first iteration.',
        { workflow: { step_id: 'testStep' } }
      );
    });
  });

  describe('on subsequent iterations', () => {
    beforeEach(() => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        iteration: 0,
      });
    });

    it('should advance iteration counter', () => {
      underTest.run();

      expect(stepExecutionRuntime.setCurrentStepState).toHaveBeenCalledTimes(1);
      expect(stepExecutionRuntime.setCurrentStepState).toHaveBeenCalledWith({
        iteration: 1,
      });
    });

    it('should enter new scope with the iteration index', () => {
      underTest.run();

      expect(workflowExecutionRuntimeManager.enterScope).toHaveBeenCalledWith('1');
    });

    it('should enter scope only once', () => {
      underTest.run();

      expect(workflowExecutionRuntimeManager.enterScope).toHaveBeenCalledTimes(1);
    });

    it('should not start the step again', () => {
      underTest.run();

      expect(stepExecutionRuntime.startStep).not.toHaveBeenCalled();
    });

    it('should navigate to the next node (body)', () => {
      underTest.run();

      expect(workflowExecutionRuntimeManager.navigateToNextNode).toHaveBeenCalled();
    });

    it('should handle higher iteration counts', () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        iteration: 4,
      });

      underTest.run();

      expect(stepExecutionRuntime.setCurrentStepState).toHaveBeenCalledWith({
        iteration: 5,
      });
      expect(workflowExecutionRuntimeManager.enterScope).toHaveBeenCalledWith('5');
    });
  });
});
