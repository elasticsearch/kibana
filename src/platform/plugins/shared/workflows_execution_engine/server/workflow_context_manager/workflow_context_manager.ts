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
import { KQLSyntaxError } from '@kbn/es-query';
import { evaluateKql } from '@kbn/eval-kql';
import {
  type EsWorkflowStepExecution,
  type SerializedError,
  type StackFrame,
  type StepContext,
  type WorkflowContext,
} from '@kbn/workflows';
import type { GraphNodeUnion, WorkflowGraph } from '@kbn/workflows/graph';
import { buildWorkflowContext } from './build_workflow_context';
import type { StepIoService } from './step_io_service';
import type { ContextDependencies } from './types';
import type { StepExecutionMetadata, WorkflowExecutionState } from './workflow_execution_state';
import { WorkflowScopeStack } from './workflow_scope_stack';
import {
  callKibanaApi,
  type CallKibanaApiParams,
  type CallKibanaApiResult,
} from '../lib/call_kibana_api';
import type { WorkflowTemplatingEngine } from '../templating_engine';
import { buildStepExecutionId, isTemplateExpression } from '../utils';
import { isSerializedError } from '../utils/errors';

export interface ContextManagerInit {
  // New properties for logging
  templateEngine: WorkflowTemplatingEngine;
  workflowExecutionGraph: WorkflowGraph;
  workflowExecutionState: WorkflowExecutionState;
  stepIoService: StepIoService;
  node: GraphNodeUnion;
  stackFrames: StackFrame[];
  // New properties for internal actions
  esClient: ElasticsearchClient; // ES client (user-scoped if available, fallback otherwise)
  fakeRequest: KibanaRequest;
  coreStart: CoreStart; // For using Kibana's internal HTTP client
  dependencies: ContextDependencies;
}

interface ScopeEntry {
  topFrame: NonNullable<ReturnType<WorkflowScopeStack['getCurrentScope']>>;
  stepExecution: StepExecutionMetadata | undefined;
}

type ContextPathSegment = string | number;
type ContextPath = ContextPathSegment[];

export class WorkflowContextManager {
  private workflowExecutionGraph: WorkflowGraph;
  private workflowExecutionState: WorkflowExecutionState;
  private stepIoService: StepIoService;
  private esClient: ElasticsearchClient;
  private templateEngine: WorkflowTemplatingEngine;
  private fakeRequest: KibanaRequest;
  private coreStart: CoreStart;
  private dependencies: ContextDependencies;

  private stackFrames: StackFrame[];
  public readonly node: GraphNodeUnion;

  /**
   * Cached predecessors for this node. Since `node` is readonly and the graph is immutable
   * during execution, the result of `getAllPredecessors` is constant for the lifetime of
   * the instance. Computed once on first access to avoid redundant O(V+E) DAG traversals
   * on every `getContext()` call (invoked 5-10x per step via renderValueAccordingToContext, etc.).
   */
  private predecessorsCache: GraphNodeUnion[] | undefined;

  private get predecessors(): ReadonlyArray<GraphNodeUnion> {
    if (!this.predecessorsCache) {
      this.predecessorsCache = this.workflowExecutionGraph.getAllPredecessors(this.node.id);
    }
    return this.predecessorsCache;
  }

  public get scopeStack(): WorkflowScopeStack {
    return WorkflowScopeStack.fromStackFrames(this.stackFrames);
  }

  constructor(init: ContextManagerInit) {
    this.workflowExecutionGraph = init.workflowExecutionGraph;
    this.workflowExecutionState = init.workflowExecutionState;
    this.stepIoService = init.stepIoService;
    this.esClient = init.esClient;
    this.fakeRequest = init.fakeRequest;
    this.coreStart = init.coreStart;
    this.node = init.node;
    this.stackFrames = init.stackFrames;
    this.templateEngine = init.templateEngine;
    this.dependencies = init.dependencies;
  }

  /**
   * Pre-warms the execution state by rehydrating any evicted step outputs
   * that will be needed by `getContext()`. Must be called before `getContext()`.
   *
   * This exists so that `getContext()` and all its synchronous callers
   * (`renderValueAccordingToContext`, `evaluateBooleanExpressionInContext`, etc.)
   * remain synchronous. When nothing has been evicted, this is a no-op with
   * zero overhead.
   */
  public async ensureContextReady(): Promise<void> {
    await this.stepIoService.prepareForRead({
      node: this.node,
      predecessorsResolver: () => this.predecessors,
    });
  }

  // Any change here should be reflected in the 'getContextSchemaForPath' function for frontend validation to work
  // src/platform/plugins/shared/workflows_management/public/features/workflow_context/lib/get_context_for_path.ts
  public getContext(): StepContext {
    const stepContext: StepContext = {
      ...this.buildWorkflowContext(),
      steps: {},
      variables: this.getVariables(),
    };

    this.predecessors.forEach((node) => {
      const stepId = node.stepId;
      const stepData = this.getStepData(stepId);

      if (stepData) {
        stepContext.steps[stepId] = {};
        if (stepData.runStepResult) {
          stepContext.steps[stepId] = {
            ...stepContext.steps[stepId],
            ...stepData.runStepResult,
          };
        }

        if (stepData.stepState) {
          stepContext.steps[stepId] = {
            ...stepContext.steps[stepId],
            ...stepData.stepState,
          };
        }
      }
    });

    this.enrichStepContextAccordingToStepScope(stepContext);
    this.enrichStepContextWithMockedData(stepContext);
    return stepContext;
  }

  /**
   * Recursively resolves template expressions in any value (string, object, array, or primitive).
   *
   * This method traverses the input value and replaces all template expressions (e.g., `{{workflow.id}}`,
   * `{{steps.step1.output}}`) with their actual values from the current workflow execution context.
   *
   * @param obj - The value to render. Can be:
   *   - A string with template expressions: `"{{workflow.name}}"`
   *   - An object with string properties: `{ name: "{{workflow.name}}", id: "{{workflow.id}}" }`
   *   - An array: `["{{step1.output}}", "static value"]`
   *   - A nested structure combining any of the above
   *   - Primitive values (numbers, booleans) are returned as-is
   *
   * @returns The same type as the input, with all template expressions resolved to their actual values
   *
   * @example
   * ```typescript
   * // Render a simple string
   * const result = contextManager.renderValueAccordingToContext("Workflow: {{workflow.name}}");
   * // => "Workflow: My Workflow"
   *
   * // Render an object with templates
   * const config = contextManager.renderValueAccordingToContext({
   *   url: "{{steps.fetchData.output.apiUrl}}",
   *   headers: { "X-Request-Id": "{{execution.id}}" }
   * });
   * // => { url: "https://api.example.com", headers: { "X-Request-Id": "exec-123" } }
   * ```
   */
  public renderValueAccordingToContext<T>(obj: T, additionalContext?: Record<string, unknown>): T {
    return this.renderValueWithContext(obj, this.getRenderingContext(obj), additionalContext);
  }

  public renderValueWithContext<T>(
    obj: T,
    context: Record<string, unknown>,
    additionalContext?: Record<string, unknown>
  ): T {
    return this.templateEngine.render(obj, { ...context, ...additionalContext });
  }

  public evaluateExpressionInContext(template: string): unknown {
    const context = this.getContext();
    return this.templateEngine.evaluateExpression(template, context);
  }

  public evaluateBooleanExpressionInContext(
    condition: string | boolean | undefined,
    additionalContext?: Record<string, unknown>
  ): boolean {
    const renderedCondition = this.renderValueAccordingToContext(condition, additionalContext);

    if (typeof renderedCondition === 'boolean') {
      return renderedCondition;
    }
    if (typeof renderedCondition === 'undefined') {
      return false;
    }

    if (typeof renderedCondition === 'string') {
      try {
        return evaluateKql(renderedCondition, this.getContext());
      } catch (error) {
        if (error instanceof KQLSyntaxError) {
          throw new Error(
            `Syntax error in condition "${condition}" for step ${this.node.stepId}: ${String(
              error
            )}`
          );
        }
        throw error;
      }
    }

    throw new Error(
      `Invalid condition.` +
        `Got ${JSON.stringify(
          condition
        )} (type: ${typeof condition}), but expected boolean or string. ` +
        `When using templating syntax, the expression must evaluate to a boolean or string (KQL expression).`
    );
  }

  /**
   * Get the Elasticsearch client for internal actions
   * This client is already user-scoped if fakeRequest was available during initialization
   */
  public getEsClientAsUser(): ElasticsearchClient {
    return this.esClient;
  }

  public getWorkflowSpaceId(): string {
    return this.workflowExecutionState.getWorkflowExecution().spaceId;
  }

  /**
   * Get the fake request from task manager for Kibana API authentication
   */
  public getFakeRequest(): KibanaRequest {
    return this.fakeRequest;
  }

  /**
   * Get CoreStart for accessing Kibana's internal services
   */
  public getCoreStart(): CoreStart {
    return this.coreStart;
  }

  /**
   * Calls a Kibana API route on the running Kibana instance, using the workflow's fake
   * request for authentication and propagating event-chain headers so the receiving handler
   * keeps the same chain-depth context.
   *
   * The transport (currently `fetch`) is an implementation detail; the public surface is
   * intentionally narrow so it can be swapped to an in-process call later without affecting
   * callers. Throws on non-2xx responses.
   */
  public async callKibanaApi<T = unknown>(
    params: CallKibanaApiParams
  ): Promise<CallKibanaApiResult<T>> {
    return callKibanaApi<T>(
      {
        fakeRequest: this.fakeRequest,
        coreStart: this.coreStart,
        cloudSetup: this.dependencies.cloudSetup,
        workflowRunId: this.workflowExecutionState.getWorkflowExecution().id,
      },
      params
    );
  }

  /**
   * Get variables from all completed data.set steps in the workflow execution.
   * Variables are retrieved from step outputs, which are persisted in execution state.
   * This ensures variables survive across wait steps and task resumptions.
   * Steps are processed in execution order to ensure consistent variable assignment.
   */
  public getVariables(): Record<string, unknown> {
    return this.stepIoService.getDataSetVariables();
  }

  /**
   * Get dependencies
   */
  public getDependencies(): ContextDependencies {
    return this.dependencies;
  }

  private buildWorkflowContext(): WorkflowContext {
    const workflowExecution = this.workflowExecutionState.getWorkflowExecution();
    return buildWorkflowContext(workflowExecution, this.coreStart, this.dependencies);
  }

  private getRenderingContext(value: unknown): StepContext {
    if (!this.stackFramesAllowNarrowing()) {
      return this.getContext();
    }

    const referencedVariableSegments = this.templateEngine.extractGlobalVariableSegments(value);
    if (referencedVariableSegments === null) {
      return this.getContext();
    }

    return this.getContextForVariableSegments(referencedVariableSegments);
  }

  // Active scopes (foreach/while/retry/if) bind new top-level identifiers and
  // merge into steps[stepId] via enrichStepContextAccordingToStepScope, which
  // doesn't compose with the partial steps map the narrowing path builds.
  private stackFramesAllowNarrowing(): boolean {
    return this.stackFrames.every((frame) =>
      frame.nestedScopes.every((scope) => scope.nodeType === 'enter-timeout-zone')
    );
  }

  private getContextForVariableSegments(referencedVariableSegments: ContextPath[]): StepContext {
    const hasUnsupportedStepPath = referencedVariableSegments.some(
      (path) => path[0] === 'steps' && typeof path[1] !== 'string'
    );
    if (hasUnsupportedStepPath) {
      return this.getContext();
    }

    const referencedRoots = new Set(
      referencedVariableSegments.flatMap((path) => (typeof path[0] === 'string' ? [path[0]] : []))
    );

    const stepContext: StepContext = {
      ...this.buildWorkflowContext(),
      steps: {},
      variables: referencedRoots.has('variables') ? this.getVariables() : {},
    };

    if (referencedRoots.has('steps')) {
      this.populateReferencedStepPaths(stepContext, referencedVariableSegments);
    }

    this.enrichStepContextAccordingToStepScope(stepContext);
    this.enrichStepContextWithMockedData(stepContext);
    return stepContext;
  }

  private populateReferencedStepPaths(
    stepContext: StepContext,
    referencedVariableSegments: ContextPath[]
  ): void {
    const pathsByStepId = new Map<string, ContextPath[]>();

    for (const path of referencedVariableSegments) {
      if (path[0] === 'steps') {
        const [, stepId, ...stepPath] = path;
        if (typeof stepId !== 'string') {
          return;
        }

        const existing = pathsByStepId.get(stepId);
        if (existing) {
          existing.push(stepPath);
        } else {
          pathsByStepId.set(stepId, [stepPath]);
        }
      }
    }

    for (const [stepId, requestedPaths] of pathsByStepId) {
      const stepData = this.getStepData(stepId);
      if (stepData) {
        const mergedStepData = {
          ...stepData.runStepResult,
          ...(stepData.stepState ?? {}),
        };
        stepContext.steps[stepId] ??= {};
        const partialStepData = stepContext.steps[stepId];
        for (const requestedPath of requestedPaths) {
          if (requestedPath.length === 0) {
            Object.assign(partialStepData, mergedStepData);
          } else {
            const { pathExists, value } = this.readValueAtPath(mergedStepData, requestedPath);
            if (pathExists) {
              this.writeValueAtPath(partialStepData, requestedPath, value);
            }
          }
        }
      }
    }
  }

  private readValueAtPath(
    value: unknown,
    propertyPath: ContextPath
  ): { pathExists: boolean; value: unknown } {
    let result = value;

    for (const segment of propertyPath) {
      if (result === null || result === undefined || typeof result !== 'object') {
        return { pathExists: false, value: undefined };
      }

      const resultAsRecord = result as Record<string | number, unknown>;
      if (!(segment in resultAsRecord)) {
        return { pathExists: false, value: undefined };
      }

      result = resultAsRecord[segment];
    }

    return { pathExists: true, value: result };
  }

  private writeValueAtPath(
    target: Record<string, unknown>,
    propertyPath: ContextPath,
    value: unknown
  ): void {
    let currentTarget: Record<string, unknown> = target;

    for (const [index, segment] of propertyPath.entries()) {
      const targetKey = String(segment);
      const isLeaf = index === propertyPath.length - 1;

      if (isLeaf) {
        currentTarget[targetKey] = value;
        return;
      }

      const existingValue = currentTarget[targetKey];
      if (existingValue === null || typeof existingValue !== 'object') {
        currentTarget[targetKey] = {};
      }

      currentTarget = currentTarget[targetKey] as Record<string, unknown>;
    }
  }

  private enrichStepContextWithMockedData(stepContext: StepContext): void {
    const contextOverride: StepContext | undefined =
      this.workflowExecutionState.getWorkflowExecution().context?.contextOverride;

    if (contextOverride) {
      stepContext.consts = {
        ...stepContext.consts,
        ...(contextOverride.consts || {}),
      };

      stepContext.inputs = {
        ...stepContext.inputs,
        ...(contextOverride.inputs || {}),
      };

      stepContext.event = {
        ...stepContext.event,
        ...(contextOverride.event || {}),
      } as StepContext['event'];

      stepContext.execution = {
        ...stepContext.execution,
        ...(contextOverride.execution || {}),
      };

      stepContext.workflow = {
        ...stepContext.workflow,
        ...(contextOverride.workflow || {}),
      };

      if (!stepContext.foreach) {
        stepContext.foreach = contextOverride.foreach;
      }

      Object.entries(contextOverride.steps || {}).forEach(([stepId, stepData]) => {
        if (!stepContext.steps[stepId]) {
          stepContext.steps[stepId] = stepData;
        }
      });
    }
  }

  private enrichStepContextAccordingToStepScope(stepContext: StepContext): void {
    let scopeStack = WorkflowScopeStack.fromStackFrames(
      this.workflowExecutionState.getWorkflowExecution().scopeStack
    );

    const executionId = this.workflowExecutionState.getWorkflowExecution().id;
    const scopeEntries: Array<ScopeEntry> = [];
    const foreachEntries: Array<ScopeEntry> = [];
    const whileEntries: Array<ScopeEntry> = [];

    while (!scopeStack.isEmpty()) {
      const topFrame = scopeStack.getCurrentScope();
      scopeStack = scopeStack.exitScope();
      const stepExecution = this.workflowExecutionState.getStepExecution(
        buildStepExecutionId(executionId, topFrame.stepId, scopeStack.stackFrames)
      );
      scopeEntries.push({ topFrame, stepExecution });
      if (stepExecution?.stepType === 'foreach') {
        foreachEntries.push({ topFrame, stepExecution });
      }
      if (stepExecution?.stepType === 'while') {
        whileEntries.push({ topFrame, stepExecution });
      }
    }

    // When there is only one foreach frame (e.g. single-step run with subgraph), use
    // contextOverride.foreach as the parent so inner expressions like {{foreach.item}} resolve.
    const contextOverride =
      this.workflowExecutionState.getWorkflowExecution().context?.contextOverride;
    if (foreachEntries.length === 1 && contextOverride?.foreach != null) {
      stepContext.foreach = contextOverride.foreach;
    }

    // Build foreach context in outer-to-inner order so inner expressions like
    // {{foreach.item}} resolve against the outer foreach context.
    for (const { stepExecution } of foreachEntries.toReversed()) {
      if (stepExecution) {
        const foreachCtx = this.buildForeachContext(stepExecution, stepContext);
        stepContext.foreach = foreachCtx;
        /**
         * Merge foreach context into step context so that inner foreach can
         * access the outer context.
         */
        if (stepExecution.stepId && foreachCtx) {
          if (!stepContext.steps[stepExecution.stepId]) {
            stepContext.steps[stepExecution.stepId] = {};
          }
          const { item, items, index, total } = foreachCtx;
          Object.assign(stepContext.steps[stepExecution.stepId], { item, items, index, total });
        }
      }
    }

    // Build while context in outer-to-inner order so the last write is the
    // innermost while scope — {{while.iteration}} resolves to the closest
    // enclosing while loop.
    for (const { stepExecution } of whileEntries.toReversed()) {
      if (stepExecution) {
        const whileCtx = this.buildWhileContext(stepExecution);
        stepContext.while = whileCtx;
        if (stepExecution.stepId && whileCtx) {
          if (!stepContext.steps[stepExecution.stepId]) {
            stepContext.steps[stepExecution.stepId] = {};
          }
          Object.assign(stepContext.steps[stepExecution.stepId], {
            iteration: whileCtx.iteration,
          });
        }
      }
    }

    // Apply fallback scope error in original (innermost-first) order.
    for (const { topFrame, stepExecution } of scopeEntries) {
      if (topFrame.scopeId === 'fallback' && stepExecution) {
        // This is not good approach, but we can't do it better right now.
        // The problem is that Context is dynamic depending on the step scopes (like whether the current step is inside foreach, fallback path, etc)
        // but here we are trying to mutate the static StepContext object.
        // Proper solution would be to have dynamic context object that would resolve properties on demand,
        // but it requires significant changes in the codebase.
        // So for now, we just set the error on the context when we are in fallback scope.
        const rawError = stepExecution.state?.error;
        if (isSerializedError(rawError)) {
          stepContext.error = rawError;
        }
      }
    }
  }

  /**
   * Builds the foreach context by combining the persisted state (index, total)
   * with items derived by re-evaluating the foreach expression at resolution time.
   * This avoids storing the entire items array in the step execution state on every iteration.
   */
  private buildForeachContext(
    stepExecution: StepExecutionMetadata,
    stepContext: StepContext
  ): StepContext['foreach'] {
    const foreachState = stepExecution.state ?? {};
    const index = typeof foreachState.index === 'number' ? foreachState.index : 0;
    const total = typeof foreachState.total === 'number' ? foreachState.total : 0;

    // Re-evaluate the foreach expression (stored in the step input at entry
    // time) to derive the full items array and current item without
    // persisting them in state. Input lives in `StepIoService` (lifecycle
    // metadata vs IO data are owned separately); a foreach is non-terminal
    // while iterating, so its input is never evicted by post-flush input
    // eviction — the service read is safe here.
    const foreachInput = this.stepIoService.getStepInput(stepExecution.id);
    const foreachExpression = this.extractForeachExpression(foreachInput);
    const items = foreachExpression
      ? this.resolveForeachItems(foreachExpression, stepContext)
      : undefined;

    const availableItems = items ?? [];

    return {
      items: availableItems,
      item: availableItems[index],
      index,
      total,
    };
  }

  private buildWhileContext(stepExecution: StepExecutionMetadata): StepContext['while'] {
    const whileState = stepExecution.state ?? {};
    const iteration = typeof whileState.iteration === 'number' ? whileState.iteration : 0;
    return { iteration };
  }

  /**
   * Extracts the foreach expression string from a step execution's input.
   * The input is typed as JsonValue, so we narrow it to a record and pull the `foreach` key.
   */
  private extractForeachExpression(input: EsWorkflowStepExecution['input']): string | undefined {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
      const { foreach: expression } = input;
      return typeof expression === 'string' ? expression : undefined;
    }
    return undefined;
  }

  /**
   * Evaluates a foreach expression against the given context and returns the resulting array.
   * Mirrors the evaluation logic in EnterForeachNodeImpl.processForeachConfiguration / getItems.
   */
  private resolveForeachItems(
    foreachExpression: string,
    context: Record<string, unknown>
  ): unknown[] | undefined {
    try {
      let resolvedValue: unknown;

      if (isTemplateExpression(foreachExpression)) {
        resolvedValue = this.templateEngine.evaluateExpression(foreachExpression, context);
      } else {
        resolvedValue = this.templateEngine.render(foreachExpression, context);
      }

      if (typeof resolvedValue === 'string') {
        try {
          resolvedValue = JSON.parse(resolvedValue);
        } catch {
          return undefined;
        }
      }

      return Array.isArray(resolvedValue) ? resolvedValue : undefined;
    } catch {
      return undefined;
    }
  }

  private getStepData(stepId: string):
    | {
        runStepResult: {
          input: unknown;
          output: unknown;
          error: SerializedError | undefined;
        };
        stepState: Record<string, unknown> | undefined;
      }
    | undefined {
    const io = this.stepIoService.getLatestStepIO(stepId);
    if (!io) {
      return;
    }
    const latestStepExecution = this.workflowExecutionState.getLatestStepExecution(stepId);
    return {
      runStepResult: {
        input: io.input,
        output: io.output,
        error: io.error,
      },
      stepState: latestStepExecution?.state,
    };
  }
}
