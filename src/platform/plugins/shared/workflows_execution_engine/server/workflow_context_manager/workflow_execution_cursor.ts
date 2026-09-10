/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StackFrame } from '@kbn/workflows';
import type { GraphNodeUnion, WorkflowGraph } from '@kbn/workflows/graph';
import { WorkflowScopeStack } from './workflow_scope_stack';
import { canWriteExecution } from '../workflow_execution_loop/execution_fence';

export interface WorkflowExecutionCursorInit {
  nodeId?: string;
  stackFrames?: StackFrame[];
  workflowExecutionGraph: WorkflowGraph;
  navigationOrder?: readonly string[];
}

/** Public surface of {@link WorkflowExecutionCursor} for typing mocks and loop params. */
export interface WorkflowExecutionCursorApi {
  readonly isExecuting: boolean;
  readonly error: Error | undefined;
  captureError(caught: unknown): void;
  clearError(): void;
  start(): void;
  stop(): void;
  commitPendingNavigation(): void;
  readonly currentNode: GraphNodeUnion | null;
  readonly nextNode: GraphNodeUnion | null;
  navigateToNode(nodeId: string): void;
  navigateToNextNode(): void;
  navigateToAfterNode(nodeId: string): void;
  readonly currentStackFrames: StackFrame[];
  setCurrentScopeId(scopeId?: string): void;
}

/**
 * In-memory cursor for workflow graph iteration: pending node navigation (`nextNodeId`),
 * whether the execution and persistence loops keep running (`isExecuting`), controlled with
 * {@link WorkflowExecutionCursor.start} and {@link WorkflowExecutionCursor.stop}.
 */
export class WorkflowExecutionCursor implements WorkflowExecutionCursorApi {
  private readonly workflowGraph: WorkflowGraph;
  private readonly navigationOrder: readonly string[];
  private currentNodeId: string | undefined;
  private nextNodeId: string | undefined;
  private executing = true;
  private stackFrames: StackFrame[];
  private workflowError: Error | undefined;

  constructor(init: WorkflowExecutionCursorInit) {
    this.workflowGraph = init.workflowExecutionGraph;
    this.navigationOrder = init.navigationOrder ?? this.workflowGraph.topologicalOrder;
    this.currentNodeId = init.nodeId || this.workflowGraph.topologicalOrder[0];
    this.stackFrames = init.stackFrames ?? [];
  }

  /**
   * Whether the execution is currently running.
   */
  public get isExecuting(): boolean {
    return this.executing;
  }

  public get error(): Error | undefined {
    return this.workflowError;
  }

  /**
   * Records a execution-level error from a caught/thrown value.
   * Synchronous so callers may invoke it after `await` without tripping `require-atomic-updates`.
   */
  public captureError(caught: unknown): void {
    if (!canWriteExecution()) return;
    this.workflowError = caught instanceof Error ? caught : new Error(String(caught));
  }

  /**
   * Clears the execution-level error.
   */
  public clearError(): void {
    if (!canWriteExecution()) return;
    this.workflowError = undefined;
  }

  /**
   * Starts the execution cursor: execution and persistence loops run while `isExecuting` is true.
   * Called when the top-level workflow execution loop begins.
   */
  public start(): void {
    if (!canWriteExecution()) return;
    this.executing = true;
  }

  /**
   * Stops the execution and persistence loops (`isExecuting` becomes false).
   *
   * Called from step logic to break out early, from task abort, and from the top-level loop `finally`
   * after a run (success or error). Workflow status may still be RUNNING unless callers update it.
   */
  public stop(): void {
    if (!canWriteExecution()) return;
    this.executing = false;
  }

  /**
   * Promotes `nextNodeId` to `currentNodeId` and rebuilds the scope stack from the graph.
   * Used after a normal `runNode` cycle and after each error-bubbling step once `navigateToNode` has set `nextNodeId`.
   */
  commitPendingNavigation(): void {
    if (!canWriteExecution()) return;
    this.currentNodeId = this.nextNodeId;
    this.syncScopeStack();
  }

  public get currentNode(): GraphNodeUnion | null {
    if (!this.currentNodeId) {
      return null;
    }

    return this.workflowGraph.getNode(this.currentNodeId);
  }

  public get nextNode(): GraphNodeUnion | null {
    if (!this.nextNodeId) {
      return null;
    }

    return this.workflowGraph.getNode(this.nextNodeId);
  }

  public restorePosition(nodeId: string, stackFrames: StackFrame[]): void {
    if (!canWriteExecution()) return;
    this.navigateToNode(nodeId);
    this.stackFrames = stackFrames;
    this.commitPendingNavigation();
  }

  public clearPendingNavigation(): void {
    if (!canWriteExecution()) return;
    this.nextNodeId = undefined;
  }

  public navigateToNode(nodeId: string): void {
    if (!canWriteExecution()) return;
    if (!this.navigationOrder.includes(nodeId)) {
      throw new Error(`Node with ID ${nodeId} is not part of the workflow graph`);
    }

    this.nextNodeId = nodeId;
  }

  public navigateToNextNode(): void {
    if (!canWriteExecution()) return;
    this.nextNodeId = this.nodeAfter(this.currentNodeId);
  }

  public navigateToAfterNode(nodeId: string): void {
    if (!canWriteExecution()) return;
    this.nextNodeId = this.nodeAfter(nodeId);
  }

  public get currentStackFrames(): StackFrame[] {
    return this.stackFrames;
  }

  public setCurrentScopeId(scopeId?: string): void {
    if (!canWriteExecution()) return;
    if (!this.currentNode) {
      return;
    }

    this.stackFrames = WorkflowScopeStack.fromStackFrames(this.stackFrames).enterScope({
      nodeId: this.currentNode.id,
      nodeType: this.currentNode.type,
      stepId: this.currentNode.stepId,
      scopeId,
    }).stackFrames;
  }

  private nodeAfter(nodeId: string | undefined): string | undefined {
    const topologicalOrder = this.navigationOrder;
    const index = topologicalOrder.findIndex((id) => id === nodeId);
    if (index >= 0 && index < topologicalOrder.length - 1) {
      return topologicalOrder[index + 1];
    }
    return undefined;
  }

  private syncScopeStack(): void {
    if (!this.currentNodeId) {
      return;
    }

    const scopesMap = new Map<string, string | undefined>();

    for (const scope of this.stackFrames) {
      for (const nestedScope of scope.nestedScopes) {
        scopesMap.set(nestedScope.nodeId, nestedScope.scopeId);
      }
    }

    const nodesStack = this.workflowGraph.getNodeStack(this.currentNodeId);

    let currentNodeScope = new WorkflowScopeStack();

    for (const nodeId of nodesStack) {
      const nodeFromGraph = this.workflowGraph.getNode(nodeId);

      currentNodeScope = currentNodeScope.enterScope({
        nodeId: nodeFromGraph.id,
        nodeType: nodeFromGraph.type,
        stepId: nodeFromGraph.stepId,
        scopeId: scopesMap.get(nodeFromGraph.id),
      });
    }

    this.stackFrames = currentNodeScope.stackFrames;
  }
}
