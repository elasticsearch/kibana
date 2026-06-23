/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConcurrencySettings, LiquidSettings, WorkflowContext } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import { WorkflowTemplatingEngine } from '../templating_engine';
import type { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

/**
 * Manages concurrency control for workflow executions.
 *
 * Scope:
 * - Evaluating concurrency group keys from static strings or template expressions
 * - Enforcing concurrency limits per group
 * - Implementing collision strategies (drop, cancel-in-progress)
 */
export class ConcurrencyManager {
  private readonly workflowTaskManager: WorkflowTaskManager;
  private readonly workflowExecutionRepository: WorkflowExecutionRepository;

  constructor(
    workflowTaskManager: WorkflowTaskManager,
    workflowExecutionRepository: WorkflowExecutionRepository
  ) {
    this.workflowTaskManager = workflowTaskManager;
    this.workflowExecutionRepository = workflowExecutionRepository;
  }

  /**
   * Evaluates a concurrency key from workflow settings and execution context.
   *
   * @param concurrencySettings - The concurrency settings from workflow definition
   * @param context - The workflow execution context for template evaluation
   * @returns The evaluated concurrency group key, or null if key is not set/empty.
   *          If template evaluation fails or returns null/undefined, returns the key as-is
   *          (treating it as a static string, as the user may have intended literal text).
   */
  public evaluateConcurrencyKey(
    concurrencySettings: ConcurrencySettings | undefined,
    context: WorkflowContext,
    liquidSettings?: LiquidSettings
  ): string | null {
    if (!concurrencySettings?.key) {
      return null;
    }

    const keyExpression = concurrencySettings.key.trim();

    try {
      const templatingEngine = new WorkflowTemplatingEngine({ liquidSettings });
      const rendered = templatingEngine.render(keyExpression, context as Record<string, unknown>);

      if (rendered === '') {
        return null;
      }

      return rendered;
    } catch (error) {
      return keyExpression;
    }
  }

  /**
   * Checks concurrency limits and applies the collision strategy if needed.
   *
   * For 'cancel-in-progress' strategy:
   * - Queries for non-terminal executions with the same concurrency group key
   * - If limit is exceeded, cancels the oldest execution(s) to make room
   * - Returns true if the new execution can proceed, false otherwise
   *
   * For 'drop' strategy:
   * - Queries for non-terminal executions with the same concurrency group key
   * - If limit is exceeded, marks the new execution as SKIPPED and returns false
   * - Returns true if the new execution can proceed, false otherwise
   *
   * @param concurrencySettings - The concurrency settings from workflow definition
   * @param concurrencyGroupKey - The evaluated concurrency group key
   * @param currentExecutionId - The ID of the current execution to check
   * @param spaceId - The space ID of the execution
   * @returns Promise<boolean> - true if execution can proceed, false otherwise
   */
  public async checkConcurrency(
    concurrencySettings: ConcurrencySettings | undefined,
    concurrencyGroupKey: string | null,
    currentExecutionId: string,
    spaceId: string
  ): Promise<boolean> {
    // If no concurrency settings or key, allow execution to proceed
    if (!concurrencySettings || !concurrencyGroupKey) {
      return true;
    }

    const strategy = concurrencySettings.strategy;
    const maxConcurrency = concurrencySettings.max ?? 1;

    // Query for non-terminal execution IDs in the same concurrency group
    const runningExecutionIds =
      await this.workflowExecutionRepository.getRunningExecutionsByConcurrencyGroup(
        concurrencyGroupKey,
        spaceId,
        currentExecutionId
      );

    const activeCount = runningExecutionIds.length;

    // If we're within the limit, allow execution to proceed
    if (activeCount < maxConcurrency) {
      return true;
    }

    // Handle 'drop' strategy: mark new execution as SKIPPED if limit is exceeded
    if (strategy === 'drop') {
      const skipTimestamp = new Date().toISOString();
      await this.workflowExecutionRepository.updateWorkflowExecution({
        id: currentExecutionId,
        status: ExecutionStatus.SKIPPED,
        cancelRequested: true,
        cancellationReason: `Dropped due to concurrency limit (max: ${maxConcurrency})`,
        cancelledAt: skipTimestamp,
        cancelledBy: 'system',
      });
      return false; // Drop the new execution
    }

    // Handle 'cancel-in-progress' strategy: cancel oldest execution(s) to make room
    if (strategy === 'cancel-in-progress') {
      // Calculate how many executions to cancel
      const executionsToCancel = activeCount - maxConcurrency + 1;

      // Cancel the oldest executions (they're already sorted by createdAt ascending)
      const executionIdsToCancel = runningExecutionIds.slice(0, executionsToCancel);

      // Bulk update all executions to cancelled status in a single ES request
      const cancellationTimestamp = new Date().toISOString();
      await this.workflowExecutionRepository.bulkUpdateWorkflowExecutions(
        executionIdsToCancel.map((id) => ({
          id,
          status: ExecutionStatus.CANCELLED,
          cancelRequested: true,
          cancellationReason: `Cancelled due to concurrency limit (max: ${maxConcurrency})`,
          cancelledAt: cancellationTimestamp,
          cancelledBy: 'system',
        }))
      );

      // Propagate cancellation to running tasks (can be done in parallel)
      await Promise.all(
        executionIdsToCancel.map((id) => this.workflowTaskManager.forceRunIdleTasks(id))
      );

      return true; // Execution can proceed after cancelling old ones
    }

    return true;
  }
}
