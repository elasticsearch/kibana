/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution, EsWorkflowStepExecution } from '@kbn/workflows';
import type { StepExecutionField } from './step_execution_repository';

export interface WorkflowExecutionPersistence {
  getWorkflowExecutionById(
    workflowExecutionId: string,
    spaceId: string
  ): Promise<EsWorkflowExecution | null>;
  updateWorkflowExecution(
    workflowExecution: Partial<EsWorkflowExecution>,
    options?: { refresh?: boolean | 'wait_for' }
  ): Promise<void>;
}

export interface StepExecutionPersistence {
  getStepExecutionsByIds(
    stepExecutionIds: string[],
    sourceIncludes?: StepExecutionField[],
    sourceExcludes?: StepExecutionField[]
  ): Promise<EsWorkflowStepExecution[]>;
  bulkUpsert(stepExecutions: Array<Partial<EsWorkflowStepExecution>>): Promise<void>;
}

/**
 * Owns all mutable state for exactly one synchronous workflow execution.
 * Construct a fresh instance per execution; never share an instance across runs.
 */
export class InMemoryExecutionPersistence
  implements WorkflowExecutionPersistence, StepExecutionPersistence
{
  private readonly stepExecutions = new Map<string, Partial<EsWorkflowStepExecution>>();

  constructor(private execution: EsWorkflowExecution) {}

  public async getWorkflowExecutionById(
    workflowExecutionId: string,
    spaceId: string
  ): Promise<EsWorkflowExecution | null> {
    if (this.execution.id !== workflowExecutionId || this.execution.spaceId !== spaceId) {
      return null;
    }
    try {
      return structuredClone(this.execution);
    } catch (err) {
      throw new Error(
        `Failed to clone workflow execution ${workflowExecutionId}: execution state contains a non-serializable value. Root cause: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  public async updateWorkflowExecution(
    workflowExecution: Partial<EsWorkflowExecution>,
    _options?: { refresh?: boolean | 'wait_for' }
  ): Promise<void> {
    // Strip identity fields — they locate the document and must not be mutated.
    const { id: _id, spaceId: _spaceId, ...update } = workflowExecution;
    this.execution = { ...this.execution, ...update };
  }
  public async getStepExecutionsByIds(
    ids: string[],
    sourceIncludes?: StepExecutionField[],
    sourceExcludes?: StepExecutionField[]
  ): Promise<EsWorkflowStepExecution[]> {
    return ids.flatMap((id) => {
      const execution = this.stepExecutions.get(id);
      if (!execution) {
        return [];
      }
      if (!isCompleteStepExecution(execution)) {
        throw new Error(
          `Step execution ${id} was read before its required fields were initialized`
        );
      }
      let copy: Record<string, unknown>;
      try {
        copy = structuredClone(execution) as Record<string, unknown>;
      } catch (err) {
        throw new Error(
          `Failed to clone step execution ${id}: step execution state contains a non-serializable value. Root cause: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      if (sourceIncludes?.length) {
        for (const key of Object.keys(copy)) {
          if (!sourceIncludes.includes(key as StepExecutionField)) {
            delete copy[key];
          }
        }
      }
      if (sourceExcludes?.length) {
        for (const key of sourceExcludes) {
          delete copy[key];
        }
      }
      return [copy as EsWorkflowStepExecution];
    });
  }

  public async bulkUpsert(executions: Array<Partial<EsWorkflowStepExecution>>): Promise<void> {
    for (const update of executions) {
      if (!update.id) {
        throw new Error('Step execution ID is required for in-memory upsert');
      }
      this.stepExecutions.set(update.id, {
        ...this.stepExecutions.get(update.id),
        ...update,
      });
    }
  }
}

const isCompleteStepExecution = (
  execution: Partial<EsWorkflowStepExecution>
): execution is EsWorkflowStepExecution =>
  typeof execution.spaceId === 'string' &&
  typeof execution.id === 'string' &&
  typeof execution.stepId === 'string' &&
  Array.isArray(execution.scopeStack) &&
  typeof execution.workflowRunId === 'string' &&
  typeof execution.workflowId === 'string' &&
  execution.status !== undefined &&
  typeof execution.startedAt === 'string' &&
  typeof execution.topologicalIndex === 'number' &&
  typeof execution.globalExecutionIndex === 'number' &&
  typeof execution.stepExecutionIndex === 'number';
