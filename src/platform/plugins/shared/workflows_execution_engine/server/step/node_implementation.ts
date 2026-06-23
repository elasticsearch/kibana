/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import apm from 'elastic-apm-node';
import type { ByteSizeValue } from '@kbn/config-schema';
import type { SerializedError } from '@kbn/workflows';
import { ExecutionError } from '@kbn/workflows/server';
import {
  DEFAULT_MAX_STEP_SIZE,
  parseByteSize,
  ResponseSizeLimitError,
  safeOutputSize,
} from './errors';
import type { ConnectorExecutor } from '../connector_executor';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';

export interface RunStepResult {
  input?: unknown;
  output?: unknown;
  error?: SerializedError | undefined;
  /**
   * When true, the step has handed control back to the scheduler (e.g. a
   * durable poll step that put itself in WAITING state). The base run loop
   * skips finishStep/failStep/navigateToNextNode so the persisted WAITING
   * record drives the resume flow instead.
   */
  suspended?: true;
}

// TODO: To remove it and replace with AtomicGraphNode
// Base step interface
export interface BaseStep {
  stepId: string;
  name: string;
  type: string;
  'max-step-size'?: string;
}

export type StepDefinition = BaseStep;

/**
 * Interface for node implementations within the workflow execution engine.
 * These implementations define the behavior of various workflow steps.
 */
export interface NodeImplementation {
  /**
   * Executes the node's logic.
   */
  run(): Promise<void> | void;
}

/**
 * Node implementation that can catch errors within its scope.
 * For example, retry steps or continue steps.
 */
export interface NodeWithErrorCatching {
  /**
   * Handles errors that occur within the node's execution context.
   * @param failedContext The context of the failed step execution.
   */
  catchError(failedContext: StepExecutionRuntime): Promise<void> | void;
}

/**
 * Node implementation monitoring its scope.
 * For example, timeout zones.
 * @param monitoredContext The context of the monitored step execution.
 */
export interface MonitorableNode {
  /**
   * Monitors the execution context of the node.
   * @param monitoredContext The context of the monitored step execution.
   */
  monitor(monitoredContext: StepExecutionRuntime): Promise<void> | void;
}

/**
 * Node implementation with explicit cancellation cleanup.
 *
 * Steps that hold external resources (child workflow executions, long-running
 * connections, etc.) implement this to perform teardown when cancelled.
 * `onCancel` is called after the abort signal fires and the step is marked
 * as cancelled — it fires in both the running and waiting states, giving
 * the step a guaranteed cleanup entry point without re-invoking `run()`.
 *
 * Implementations must be idempotent.
 */
export interface CancellableNode {
  onCancel(): Promise<void> | void;
}

export const isCancellableNode = (
  node: NodeImplementation
): node is NodeImplementation & CancellableNode => {
  return typeof (node as unknown as CancellableNode).onCancel === 'function';
};

export abstract class BaseAtomicNodeImplementation<TStep extends BaseStep>
  implements NodeImplementation
{
  protected step: TStep;
  protected stepExecutionRuntime: StepExecutionRuntime;
  protected connectorExecutor: ConnectorExecutor | undefined;
  protected workflowExecutionRuntime: WorkflowExecutionRuntimeManager;

  constructor(
    step: TStep,
    stepExecutionRuntime: StepExecutionRuntime,
    connectorExecutor: ConnectorExecutor | undefined,
    workflowExecutionRuntime: WorkflowExecutionRuntimeManager
  ) {
    this.step = step;
    this.stepExecutionRuntime = stepExecutionRuntime;
    this.connectorExecutor = connectorExecutor;
    this.workflowExecutionRuntime = workflowExecutionRuntime;

    // Graph nodes use `stepId` instead of `name`. When the factory passes a
    // graph node directly (e.g. for ES/Kibana steps), bridge the gap so that
    // error messages and APM spans always have a human-readable step name.
    if (!this.step.name) {
      const graphStepId = step.stepId;
      if (graphStepId) {
        this.step.name = graphStepId;
      }
    }

    // Auto-populate max-step-size from the graph node configuration.
    // This ensures every step respects the YAML limit regardless of how
    // the subclass constructs its step object.
    if (!this.step['max-step-size']) {
      if (
        'configuration' in stepExecutionRuntime.node &&
        stepExecutionRuntime.node.configuration?.['max-step-size']
      ) {
        this.step['max-step-size'] = stepExecutionRuntime.node.configuration?.['max-step-size'];
      }
    }
  }

  public getName(): string {
    return this.step.name;
  }

  public getInput(): Record<string, unknown> {
    return {};
  }

  public async run(): Promise<void> {
    // If the execution is already aborted, do not start the step, navigate to make the execution finish properly
    if (this.stepExecutionRuntime.abortController.signal.aborted) {
      this.workflowExecutionRuntime.navigateToNextNode();
      return;
    }

    let input: Record<string, unknown> = {};
    this.stepExecutionRuntime.startStep();

    // Create APM span for step execution visibility in traces
    const stepSpan = apm.startSpan(`step: ${this.step.name}`, 'workflow', this.step.type);
    if (stepSpan) {
      stepSpan.setLabel('step_name', this.step.name);
      stepSpan.setLabel('step_type', this.step.type);
      stepSpan.setLabel('step_id', this.stepExecutionRuntime.stepExecutionId);
    }

    let suspended = false;
    try {
      input = await this.getInput();
      this.stepExecutionRuntime.setInput(input);
      const result = await this._run(input);

      // Layer 2: Enforce output size limit before storing in execution state.
      // This is the generic catch-all that protects every step type against
      // context growth. Layer 1 (pre-emptive I/O enforcement) may have
      // already caught this at the transport level.
      let measuredOutputSize: number | undefined;
      if (result.output != null) {
        const maxBytes = this.getMaxResponseBytes();
        if (maxBytes > 0) {
          const outputSize = safeOutputSize(result.output);
          // Fail closed on non-serializable outputs (null sentinel) — the
          // value cannot be persisted to ES, so silently allowing it through
          // would leak a payload of unknown size into in-memory state and
          // bypass both the size limit and eviction.
          if (outputSize === null) {
            throw new ResponseSizeLimitError(maxBytes, this.step.name);
          }
          if (outputSize > maxBytes) {
            throw new ResponseSizeLimitError(maxBytes, this.step.name, {
              actualBytes: outputSize,
            });
          }
          // Forward the already-computed size to finishStep so the IO service
          // can decide eviction without re-serialising. Zero-byte outputs are
          // forwarded so the step still counts toward stats.
          measuredOutputSize = outputSize;
        }
      }

      // Don't update step execution runtime if abort was initiated
      if (this.stepExecutionRuntime.abortController.signal.aborted) {
        if (stepSpan) {
          stepSpan.setOutcome('unknown');
          stepSpan.end();
        }
        return;
      }

      // The step (e.g. a durable poll) put itself in WAITING. Skip
      // finishStep/failStep/navigateToNextNode — the persisted WAITING
      // record drives the resume flow instead.
      if (result.suspended) {
        suspended = true;
        if (stepSpan) {
          stepSpan.setOutcome('unknown');
        }
        return;
      }

      if (result.error) {
        // Pass partial output (e.g. token-usage metadata accumulated before a
        // stream error) so it is persisted and reachable via
        // `steps.x.output.metadata.usage` even when the step fails.
        this.stepExecutionRuntime.failStep(
          new ExecutionError(result.error),
          result.output ?? undefined
        );
        if (stepSpan) {
          stepSpan.setOutcome('failure');
        }
      } else {
        this.stepExecutionRuntime.finishStep(result.output, measuredOutputSize);
        if (stepSpan) {
          stepSpan.setOutcome('success');
        }
      }
    } catch (error) {
      const result = this.handleFailure(input, error);
      this.stepExecutionRuntime.failStep(result.error || error);
      if (stepSpan) {
        stepSpan.setOutcome('failure');
      }
    } finally {
      if (stepSpan) {
        stepSpan.end();
      }
    }

    if (!suspended) {
      this.workflowExecutionRuntime.navigateToNextNode();
    }
  }

  // Subclasses implement this to execute the step logic
  protected abstract _run(input: Record<string, unknown>): Promise<RunStepResult>;

  /**
   * Resolves the maximum step size in bytes.
   * Resolution order: step-level > workflow settings > plugin config > DEFAULT_MAX_STEP_SIZE.
   * Returns 0 if the configured value is explicitly "0" (disables the limit).
   * Returns the default on invalid/unparseable values to avoid crashing the step.
   */
  protected getMaxResponseBytes(): number {
    try {
      // 1. Step-level override (from YAML — auto-populated in constructor)
      const stepLimit = this.step['max-step-size'];
      if (stepLimit) {
        return parseByteSize(stepLimit);
      }

      // 2. Workflow-level override (from YAML settings, via runtime — not user-facing context)
      const workflowSettings =
        this.stepExecutionRuntime.workflowExecution?.workflowDefinition?.settings;
      const workflowLimit = workflowSettings?.['max-step-size'];
      if (workflowLimit) {
        return parseByteSize(workflowLimit);
      }

      // 3. Plugin config default (from kibana.yml)
      const pluginConfig = this.stepExecutionRuntime.contextManager.getDependencies().config;
      if (pluginConfig?.maxResponseSize) {
        const configValue = pluginConfig.maxResponseSize;
        return typeof configValue === 'number'
          ? configValue
          : (configValue as ByteSizeValue).getValueInBytes();
      }

      // 4. Hardcoded fallback
      return parseByteSize(DEFAULT_MAX_STEP_SIZE);
    } catch {
      return parseByteSize(DEFAULT_MAX_STEP_SIZE);
    }
  }

  // Helper for handling on-failure, retries, etc.
  protected handleFailure(input: Record<string, unknown>, error: Error): RunStepResult {
    return {
      input,
      output: undefined,
      error: ExecutionError.fromError(error),
    };
  }
}
