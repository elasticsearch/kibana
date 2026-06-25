/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ExitForeachNode, WorkflowGraph } from '@kbn/workflows/graph';
import type { StepExecutionRuntime } from '../../../workflow_context_manager/step_execution_runtime';
import type { StepIoService } from '../../../workflow_context_manager/step_io_service';
import type { WorkflowExecutionRuntimeManager } from '../../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../../workflow_event_logger';
import { ExitForeachNodeImpl } from '../exit_foreach_node_impl';

describe('ExitForeachNodeImpl', () => {
  let node: ExitForeachNode;
  let wfExecutionRuntimeManager: WorkflowExecutionRuntimeManager;
  let stepExecutionRuntime: StepExecutionRuntime;
  let workflowLogger: IWorkflowEventLogger;
  let stepIoService: StepIoService;
  let workflowGraph: WorkflowGraph;
  let underTest: ExitForeachNodeImpl;

  beforeEach(() => {
    node = {
      id: 'testStep',
      stepId: 'testStep',
      stepType: 'foreach',
      type: 'exit-foreach',
      startNodeId: 'foreachStartNode',
    };
    wfExecutionRuntimeManager = {} as unknown as WorkflowExecutionRuntimeManager;
    wfExecutionRuntimeManager.navigateToNextNode = jest.fn();
    wfExecutionRuntimeManager.navigateToNode = jest.fn();

    stepExecutionRuntime = {} as unknown as StepExecutionRuntime;
    stepExecutionRuntime.finishStep = jest.fn();
    stepExecutionRuntime.getCurrentStepState = jest.fn();
    stepExecutionRuntime.setCurrentStepState = jest.fn();

    workflowLogger = {} as unknown as IWorkflowEventLogger;
    workflowLogger.logDebug = jest.fn();

    stepIoService = {
      evictStaleLoopOutputs: jest.fn(),
      unpinForeachScope: jest.fn(),
    } as unknown as StepIoService;

    workflowGraph = {
      getInnerStepIds: jest.fn().mockReturnValue(new Set(['innerStep'])),
    } as unknown as WorkflowGraph;

    underTest = new ExitForeachNodeImpl(
      node,
      stepExecutionRuntime,
      wfExecutionRuntimeManager,
      workflowLogger,
      stepIoService,
      workflowGraph
    );
  });

  describe('when no foreach step', () => {
    beforeEach(() => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue(undefined);
    });

    it('should throw an error', () => {
      expect(() => underTest.run()).toThrow(
        new Error(`Foreach state for step ${node.stepId} not found`)
      );
    });
  });

  describe('when there are more items to process', () => {
    beforeEach(() => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 3,
      });
    });

    it('should go to the start node', async () => {
      await underTest.run();

      expect(wfExecutionRuntimeManager.navigateToNode).toHaveBeenCalledWith(node.startNodeId);
    });

    it('should not finish the foreach step and not set step state', async () => {
      await underTest.run();

      expect(stepExecutionRuntime.finishStep).not.toHaveBeenCalled();
      expect(stepExecutionRuntime.setCurrentStepState).not.toHaveBeenCalled();
    });

    it('should not evict stale loop outputs when looping back', async () => {
      await underTest.run();

      expect(stepIoService.evictStaleLoopOutputs).not.toHaveBeenCalled();
    });
  });

  describe('when no more items to process', () => {
    beforeEach(() => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 2,
        total: 3,
      });
    });

    it('should finish the foreach step', async () => {
      await underTest.run();

      expect(stepExecutionRuntime.finishStep).toHaveBeenCalledWith();
    });

    it('should go to the next step', async () => {
      await underTest.run();

      expect(wfExecutionRuntimeManager.navigateToNextNode).toHaveBeenCalled();
    });

    it('should log debug message', async () => {
      await underTest.run();

      expect(workflowLogger.logDebug).toHaveBeenCalledWith(
        `Exiting foreach step \"${node.stepId}\" after processing all items. Processed 3 of 3 items.`,
        { workflow: { step_id: node.stepId } }
      );
    });

    it('should throw an error if max-iterations limit is reached with on-limit fail', () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 5,
      });
      node.maxIterations = 2;
      node.onLimit = 'fail';
      expect(() => underTest.run()).toThrow(
        `Foreach step "${node.stepId}" exceeded max-iterations limit of 2. Processed 2 of 5 items.`
      );
    });

    it('should not finish the step when on-limit is fail', () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 5,
      });
      node.maxIterations = 2;
      node.onLimit = 'fail';
      try {
        underTest.run();
      } catch {
        // expected
      }
      expect(stepExecutionRuntime.finishStep).not.toHaveBeenCalled();
    });

    it('should finish and navigate to next node when max-iterations reached with on-limit continue', async () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 5,
      });
      node.maxIterations = 2;
      node.onLimit = 'continue';

      await underTest.run();

      expect(stepExecutionRuntime.finishStep).toHaveBeenCalled();
      expect(wfExecutionRuntimeManager.navigateToNextNode).toHaveBeenCalled();
    });

    it('should log that max-iterations limit was reached when on-limit is continue', async () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 5,
      });
      node.maxIterations = 2;
      node.onLimit = 'continue';

      await underTest.run();

      expect(workflowLogger.logDebug).toHaveBeenCalledWith(
        `Exiting foreach step "${node.stepId}" after reached max-iterations limit of 2. Processed 2 of 5 items.`,
        { workflow: { step_id: node.stepId } }
      );
    });

    it('should not navigate back to start node when max-iterations reached with on-limit continue', async () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 5,
      });
      node.maxIterations = 2;
      node.onLimit = 'continue';

      await underTest.run();

      expect(wfExecutionRuntimeManager.navigateToNode).not.toHaveBeenCalled();
    });

    it('should evict stale loop outputs before throwing on max-iterations with on-limit fail', () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 5,
      });
      node.maxIterations = 2;
      node.onLimit = 'fail';

      expect(() => underTest.run()).toThrow();
      expect(stepIoService.evictStaleLoopOutputs).toHaveBeenCalledWith(new Set(['innerStep']));
    });

    it('should evict stale loop outputs when loop completes', async () => {
      await underTest.run();

      expect(workflowGraph.getInnerStepIds).toHaveBeenCalledWith('testStep');
      expect(stepIoService.evictStaleLoopOutputs).toHaveBeenCalledWith(new Set(['innerStep']));
    });

    it('should release the source pin when the loop completes normally', async () => {
      await underTest.run();

      expect(stepIoService.unpinForeachScope).toHaveBeenCalledWith('testStep');
    });

    it('should evict stale loop outputs when max-iterations reached with on-limit continue', async () => {
      (stepExecutionRuntime.getCurrentStepState as jest.Mock).mockReturnValue({
        index: 1,
        total: 5,
      });
      node.maxIterations = 2;
      node.onLimit = 'continue';

      await underTest.run();

      expect(stepIoService.evictStaleLoopOutputs).toHaveBeenCalled();
    });
  });
});
