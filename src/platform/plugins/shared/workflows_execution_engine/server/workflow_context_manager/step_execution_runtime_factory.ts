/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart, KibanaRequest } from '@kbn/core/server';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { StackFrame } from '@kbn/workflows';
import type { WorkflowGraph } from '@kbn/workflows/graph';
import { StepExecutionRuntime } from './step_execution_runtime';
import type { StepIoService } from './step_io_service';
import type { ContextDependencies } from './types';
import { WorkflowContextManager } from './workflow_context_manager';
import type { WorkflowExecutionState } from './workflow_execution_state';
import { WorkflowScopeStack } from './workflow_scope_stack';
import { WorkflowTemplatingEngine } from '../templating_engine';
import { buildStepExecutionId } from '../utils';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

/**
 * Guards against duplicate node entries in stack frames by removing the current node if it exists on top.
 *
 * This defensive function ensures stack frame consistency before creating a step execution runtime.
 * During workflow execution, scope entry (via `enterScope()`) can occur for the same node that is
 * about to execute, resulting in the node appearing on top of its own stack frames. This function
 * detects and removes such self-references to prevent context resolution issues and maintain clean
 * execution state.
 *
 * @param nodeId - The ID of the node for which the step execution runtime is being created
 * @param stackFrames - The current stack frames from the workflow execution
 * @returns Modified stack frames with the current node removed if it was on top, otherwise unchanged
 *
 * @example
 * ```typescript
 * // Scenario: "enter-foreach" node just called enterScope() for itself
 * // stackFrames = [{stepId: "loop", nestedScopes: [{nodeId: "enter-foreach", ...}]}]
 * const cleaned = removeCurrentNodeFromStackFrames("enter-foreach", stackFrames);
 * // cleaned = [] - the self-reference is removed
 * ```
 */
function removeCurrentNodeFromStackFrames(nodeId: string, stackFrames: StackFrame[]): StackFrame[] {
  const workflowScopeStack = WorkflowScopeStack.fromStackFrames(stackFrames);

  if (workflowScopeStack.isEmpty()) {
    return stackFrames;
  }

  const onTop = workflowScopeStack.getCurrentScope();

  if (onTop.nodeId === nodeId) {
    return workflowScopeStack.exitScope().stackFrames;
  }

  return stackFrames;
}

/**
 * Factory class responsible for creating StepExecutionRuntime instances.
 *
 * This class separates the step execution runtime initialization logic from the
 * step execution runtime itself, providing a clean abstraction for runtime creation.
 * It encapsulates the complex setup required for step execution including workflow state,
 * graph navigation, logging, and context management.
 *
 * @example
 * ```typescript
 * const factory = new StepExecutionRuntimeFactory({
 *   workflowExecutionState,
 *   workflowExecutionGraph,
 *   workflowLogger,
 *   esClient,
 *   fakeRequest,
 *   coreStart
 * });
 *
 * const runtime = factory.createStepExecutionRuntime({
 *   node: graphNode,
 *   stackFrames: currentStackFrames
 * });
 * ```
 */
export class StepExecutionRuntimeFactory {
  constructor(
    private params: {
      workflowExecutionState: WorkflowExecutionState;
      stepIoService: StepIoService;
      workflowExecutionGraph: WorkflowGraph;
      workflowLogger: IWorkflowEventLogger;
      esClient: ElasticsearchClient; // ES client (user-scoped if available, fallback otherwise)
      fakeRequest: KibanaRequest;
      coreStart: CoreStart;
      dependencies: ContextDependencies;
    }
  ) {}

  createStepExecutionRuntime({
    nodeId,
    stackFrames,
  }: {
    nodeId: string;
    stackFrames: StackFrame[];
  }): StepExecutionRuntime {
    const node = this.params.workflowExecutionGraph.getNode(nodeId);
    const workflowExecution = this.params.workflowExecutionState.getWorkflowExecution();

    // Guard against duplicate node entries in stack frames by removing self-references.
    // During workflow execution, a node may call enterScope() for itself before executing,
    // causing the node to appear on top of its own stack frames. This removes such self-references
    // to prevent context resolution issues during step execution.
    const modifiedStackFrames = removeCurrentNodeFromStackFrames(nodeId, stackFrames);

    const stepExecutionId = buildStepExecutionId(
      workflowExecution.id,
      node.stepId,
      modifiedStackFrames
    );

    const stepLogger = this.params.workflowLogger.createStepLogger(
      stepExecutionId,
      node.stepId,
      node.stepId,
      node.stepType
    );
    const contextManager = new WorkflowContextManager({
      templateEngine: new WorkflowTemplatingEngine({
        liquidSettings: workflowExecution.workflowDefinition?.settings?.liquid,
      }),
      workflowExecutionGraph: this.params.workflowExecutionGraph,
      workflowExecutionState: this.params.workflowExecutionState,
      stepIoService: this.params.stepIoService,
      node,
      stackFrames: modifiedStackFrames,
      esClient: this.params.esClient,
      fakeRequest: this.params.fakeRequest,
      coreStart: this.params.coreStart,
      dependencies: this.params.dependencies,
    });
    return new StepExecutionRuntime({
      stepExecutionId,
      workflowExecutionGraph: this.params.workflowExecutionGraph,
      workflowExecutionState: this.params.workflowExecutionState,
      stepIoService: this.params.stepIoService,
      stepLogger,
      stackFrames: modifiedStackFrames,
      node,
      contextManager,
    });
  }
}
