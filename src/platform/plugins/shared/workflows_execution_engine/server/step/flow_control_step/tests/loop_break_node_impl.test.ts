/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LoopBreakNode, WorkflowGraph } from '@kbn/workflows/graph';
import type { StepExecutionRuntime } from '../../../workflow_context_manager/step_execution_runtime';
import type { StepExecutionRuntimeFactory } from '../../../workflow_context_manager/step_execution_runtime_factory';
import type { StepIoService } from '../../../workflow_context_manager/step_io_service';
import type { WorkflowExecutionRuntimeManager } from '../../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../../workflow_event_logger';
import { LoopBreakNodeImpl } from '../loop_break_node_impl';

describe('LoopBreakNodeImpl', () => {
  let node: LoopBreakNode;
  let stepExecutionRuntime: StepExecutionRuntime;
  let wfExecutionRuntimeManager: WorkflowExecutionRuntimeManager;
  let workflowLogger: IWorkflowEventLogger;
  let stepExecutionRuntimeFactory: StepExecutionRuntimeFactory;
  let stepIoService: StepIoService;
  let workflowGraph: WorkflowGraph;
  let underTest: LoopBreakNodeImpl;

  beforeEach(() => {
    node = {
      id: 'break_step',
      stepId: 'break_step',
      stepType: 'loop.break',
      type: 'loop-break',
      loopExitNodeId: 'exitForeach_my_loop',
      loopStepId: 'my_loop',
    };

    stepExecutionRuntime = {
      startStep: jest.fn(),
      finishStep: jest.fn(),
    } as unknown as StepExecutionRuntime;

    wfExecutionRuntimeManager = {
      navigateToNextNode: jest.fn(),
      navigateToNode: jest.fn(),
      navigateToAfterNode: jest.fn(),
      unwindScopes: jest.fn(),
    } as unknown as WorkflowExecutionRuntimeManager;

    workflowLogger = {
      logDebug: jest.fn(),
    } as unknown as IWorkflowEventLogger;

    stepExecutionRuntimeFactory = {} as StepExecutionRuntimeFactory;

    stepIoService = {
      evictStaleLoopOutputs: jest.fn(),
      unpinForeachScope: jest.fn(),
    } as unknown as StepIoService;

    workflowGraph = {
      getInnerStepIds: jest.fn().mockReturnValue(new Set(['innerAction'])),
    } as unknown as WorkflowGraph;

    underTest = new LoopBreakNodeImpl(
      node,
      stepExecutionRuntime,
      wfExecutionRuntimeManager,
      workflowLogger,
      stepExecutionRuntimeFactory,
      stepIoService,
      workflowGraph
    );
  });

  it('should start and finish the step with navigateToNode output', () => {
    underTest.run();

    expect(stepExecutionRuntime.startStep).toHaveBeenCalled();
    expect(stepExecutionRuntime.finishStep).toHaveBeenCalledWith({
      navigateToNode: 'exitForeach_my_loop',
    });
  });

  it('should unwind scopes inclusively and navigate past the exit node', () => {
    underTest.run();

    expect(wfExecutionRuntimeManager.unwindScopes).toHaveBeenCalledWith(
      stepExecutionRuntimeFactory,
      expect.any(Function),
      { inclusive: true }
    );
    expect(wfExecutionRuntimeManager.navigateToAfterNode).toHaveBeenCalledWith(
      'exitForeach_my_loop'
    );
  });

  it('should evict stale loop outputs after unwinding scopes', () => {
    underTest.run();

    expect(workflowGraph.getInnerStepIds).toHaveBeenCalledWith('my_loop');
    expect(stepIoService.evictStaleLoopOutputs).toHaveBeenCalledWith(new Set(['innerAction']));
  });

  it('should unpin the loop source scope so it can be evicted after break', () => {
    // loop.break navigates *past* the exit-foreach node, so
    // ExitForeachNodeImpl.run() (which holds the only unpinForeachScope call)
    // never runs. Without an explicit unpin here, the loop source output stays
    // pinned for the rest of the execution and can never be evicted.
    underTest.run();

    expect(stepIoService.unpinForeachScope).toHaveBeenCalledWith('my_loop');
  });
});
