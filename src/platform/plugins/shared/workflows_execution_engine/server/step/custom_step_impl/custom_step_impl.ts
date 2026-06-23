/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AtomicGraphNode } from '@kbn/workflows/graph';
import { ExecutionError } from '@kbn/workflows/server';
import type { ServerStepDefinition } from '@kbn/workflows-extensions/server';
import { isOneShotStepDefinition, isPollStepDefinition } from '@kbn/workflows-extensions/server';

import { OneShotStepDefinitionHandler, PollPolicyStepHandler } from './step_definition_handlers';
import type { CustomStepDefinitionHandler } from './types';
import type { ConnectorExecutor } from '../../connector_executor';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import { BaseAtomicNodeImplementation } from '../node_implementation';
import type { BaseStep, CancellableNode, RunStepResult } from '../node_implementation';

/**
 * Implementation for custom registered step types.
 *
 * This class executes custom step types registered via the registerStepType API.
 * It validates input against the step's schema, executes the handler function,
 * and validates the output.
 *
 * When the step definition provides an `onCancel` handler, instances expose
 * the `CancellableNode.onCancel` method so the execution engine can invoke
 * cleanup on cancellation.
 */
export class CustomStepImpl
  extends BaseAtomicNodeImplementation<BaseStep>
  implements CancellableNode
{
  private stepHandler: CustomStepDefinitionHandler | undefined;

  constructor(
    private node: AtomicGraphNode,
    private stepDefinition: ServerStepDefinition,
    stepExecutionRuntime: StepExecutionRuntime,
    connectorExecutor: ConnectorExecutor,
    workflowExecutionRuntime: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger
  ) {
    const baseStep: BaseStep = {
      name: node.stepId,
      stepId: node.stepId,
      type: node.stepType,
      'max-step-size': node.configuration['max-step-size'],
    };
    super(baseStep, stepExecutionRuntime, connectorExecutor, workflowExecutionRuntime);

    this.stepHandler = this.resolveStepHandler();
  }

  public async onCancel(): Promise<void> {
    if (!this.stepHandler) {
      throw new Error(`Step "${this.node.stepType}" has no executable phase.`);
    }

    await this.stepHandler.onCancel(
      this.getInput(),
      this.node.configuration.with,
      this.getRenderedConfig()
    );
  }

  /**
   * Get and validate the input for this step
   */
  public override getInput(): Record<string, unknown> {
    const withData = this.node.configuration.with || {};
    return this.stepExecutionRuntime.contextManager.renderValueAccordingToContext(withData);
  }

  /**
   * Execute the custom step handler
   */
  protected override async _run(input: unknown): Promise<RunStepResult> {
    if (!this.stepHandler) {
      throw new Error(`Step "${this.node.stepType}" has no executable phase.`);
    }

    try {
      return await this.stepHandler.run(
        input,
        this.node.configuration.with,
        this.getRenderedConfig()
      );
    } catch (err) {
      const error = ExecutionError.fromError(err).toSerializableObject();
      return { input, output: undefined, error };
    }
  }

  private getRenderedConfig(): Record<string, unknown> {
    const configShape = this.stepDefinition.configSchema?.shape;
    if (!configShape) {
      return {};
    }

    const config = Object.fromEntries(
      Object.keys(configShape)
        .filter((key) => Object.hasOwn(this.node.configuration, key))
        .map((key) => [key, this.node.configuration[key]])
    );

    return this.stepExecutionRuntime.contextManager.renderValueAccordingToContext(config);
  }

  private resolveStepHandler(): CustomStepDefinitionHandler {
    if (isPollStepDefinition(this.stepDefinition)) {
      return new PollPolicyStepHandler(
        this.stepDefinition,
        this.node,
        this.stepExecutionRuntime,
        this.workflowLogger
      );
    }

    if (isOneShotStepDefinition(this.stepDefinition)) {
      return new OneShotStepDefinitionHandler(
        this.stepDefinition,
        this.node,
        this.stepExecutionRuntime,
        this.workflowLogger
      );
    }

    throw new Error(`Unknown step definition type provided`);
  }
}
