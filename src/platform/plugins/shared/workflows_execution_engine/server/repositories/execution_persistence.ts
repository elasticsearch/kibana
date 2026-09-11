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

  private execution: EsWorkflowExecution;

  constructor(execution: EsWorkflowExecution) {
    try {
      this.execution = structuredClone(execution);
    } catch (err) {
      throw new Error(
        `Failed to initialise workflow execution persistence: execution state contains a non-serializable value. Root cause: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

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
    try {
      this.execution = { ...this.execution, ...structuredClone(update) };
    } catch (err) {
      throw new Error(
        `Failed to update workflow execution: update contains a non-serializable value. Root cause: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
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
        copy = structuredClone(execution) as unknown as Record<string, unknown>;
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
      // Mirror the ES-backed normalisation: when the caller explicitly requested
      // `output` but the stored value is absent, return null (FAILED) rather than
      // leaving the key missing (evicted). The engine relies on this distinction.
      if (
        sourceIncludes?.includes('output') &&
        !sourceExcludes?.includes('output') &&
        copy.output === undefined
      ) {
        copy.output = null;
      }
      return [copy as unknown as EsWorkflowStepExecution];
    });
  }

  public async bulkUpsert(executions: Array<Partial<EsWorkflowStepExecution>>): Promise<void> {
    for (const update of executions) {
      if (!update.id) {
        throw new Error('Step execution ID is required for in-memory upsert');
      }
      const merged = { ...this.stepExecutions.get(update.id), ...update };
      try {
        this.stepExecutions.set(update.id, structuredClone(merged));
      } catch (err) {
        throw new Error(
          `Failed to store step execution ${
            update.id
          }: state contains a non-serializable value. Root cause: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
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
