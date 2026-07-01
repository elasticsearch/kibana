/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { EsWorkflowExecution } from '@kbn/workflows';
import {
  ConcurrencySlotOccupyingExecutionStatuses,
  ExecutionStatus,
  TerminalExecutionStatuses,
} from '@kbn/workflows';
import type { WorkflowExecutionRepository as WorkflowExecutionRepositoryType } from '../../server/repositories/workflow_execution_repository';

export class WorkflowExecutionRepositoryMock implements Required<WorkflowExecutionRepositoryType> {
  public workflowExecutions = new Map<string, EsWorkflowExecution>();

  public getWorkflowExecutionById(
    workflowExecutionId: string,
    spaceId: string
  ): Promise<EsWorkflowExecution | null> {
    return Promise.resolve(this.workflowExecutions.get(workflowExecutionId) || null);
  }

  public createWorkflowExecution(
    workflowExecution: Partial<EsWorkflowExecution>,
    _options: { refresh?: boolean | 'wait_for' } = {}
  ): Promise<void> {
    if (!workflowExecution.id) {
      throw new Error('Workflow execution ID is required for creation');
    }

    this.workflowExecutions.set(workflowExecution.id, workflowExecution as EsWorkflowExecution);
    return Promise.resolve();
  }

  public async bulkCreateWorkflowExecutions(
    executions: Array<Partial<EsWorkflowExecution>>,
    _options: { refresh?: boolean | 'wait_for' } = {}
  ): Promise<Array<{ id: string } | { id: string; error: string }>> {
    if (executions.length === 0) {
      return [];
    }

    executions.forEach((execution) => {
      if (!execution.id) {
        throw new Error('Workflow execution ID is required for bulk create');
      }
    });

    return executions.map((execution) => {
      const id = execution.id as string;
      this.workflowExecutions.set(id, execution as EsWorkflowExecution);
      return { id };
    });
  }

  public updateWorkflowExecution(
    workflowExecution: Partial<EsWorkflowExecution>,
    _options?: { refresh?: boolean | 'wait_for' }
  ): Promise<void> {
    if (!workflowExecution.id) {
      throw new Error('Workflow execution ID is required for update');
    }

    if (!this.workflowExecutions.has(workflowExecution.id)) {
      throw new Error(`Workflow execution with ID ${workflowExecution.id} does not exist`);
    }

    this.workflowExecutions.set(workflowExecution.id, {
      ...this.workflowExecutions.get(workflowExecution.id),
      ...(workflowExecution as EsWorkflowExecution),
    });
    return Promise.resolve();
  }

  public async searchWorkflowExecutions(
    query: Record<string, unknown>,
    size: number = 10
  ): Promise<Array<{ _source: EsWorkflowExecution; _id: string; _index: string }>> {
    let results = Array.from(this.workflowExecutions.values());

    // Simple query parser for bool queries with term filters
    if (query.bool && typeof query.bool === 'object') {
      const boolQuery = query.bool as {
        must?: Array<{ term?: Record<string, unknown> }>;
        must_not?: Array<{ terms?: Record<string, unknown[]> }>;
      };

      // Apply must clauses (term filters)
      if (boolQuery.must) {
        for (const clause of boolQuery.must) {
          if (clause.term) {
            for (const [field, value] of Object.entries(clause.term)) {
              results = results.filter(
                (exec) => (exec as unknown as Record<string, unknown>)[field] === value
              );
            }
          }
        }
      }

      // Apply must_not clauses (exclusions)
      if (boolQuery.must_not) {
        for (const clause of boolQuery.must_not) {
          if (clause.terms) {
            for (const [field, values] of Object.entries(clause.terms)) {
              results = results.filter(
                (exec) => !values.includes((exec as unknown as Record<string, unknown>)[field])
              );
            }
          }
        }
      }
    }

    // Apply size limit
    results = results.slice(0, size);

    // Return in Elasticsearch hit format
    return results.map((exec) => ({
      _source: exec,
      _id: exec.id,
      _index: 'workflows-executions',
    }));
  }

  public async hasRunningExecution(
    workflowId: string,
    spaceId: string,
    triggeredBy?: string
  ): Promise<boolean> {
    let results = Array.from(this.workflowExecutions.values()).filter(
      (exec) =>
        exec.workflowId === workflowId &&
        exec.spaceId === spaceId &&
        !TerminalExecutionStatuses.includes(exec.status)
    );

    if (triggeredBy) {
      results = results.filter((exec) => exec.triggeredBy === triggeredBy);
    }

    // Return true if there's at least one running execution
    return results.length > 0;
  }

  public async getRunningExecutionsByWorkflowId(
    workflowId: string,
    spaceId: string,
    triggeredBy?: string
  ): Promise<Array<{ _source: EsWorkflowExecution; _id: string; _index: string }>> {
    let results = Array.from(this.workflowExecutions.values()).filter(
      (exec) =>
        exec.workflowId === workflowId &&
        exec.spaceId === spaceId &&
        !TerminalExecutionStatuses.includes(exec.status)
    );

    if (triggeredBy) {
      results = results.filter((exec) => exec.triggeredBy === triggeredBy);
    }

    // Return in Elasticsearch hit format, limited to 1 as per the real implementation
    return results.slice(0, 1).map((exec) => ({
      _source: exec,
      _id: exec.id,
      _index: 'workflows-executions',
    }));
  }

  public async findNonTerminalExecutionIdsByWorkflowIdPage({
    spaceId,
    workflowId,
    size,
    searchAfter,
  }: {
    spaceId: string;
    workflowId: string;
    size: number;
    searchAfter?: estypes.SortResults;
  }): Promise<{
    results: string[];
    total: number;
    nextSearchAfter?: estypes.SortResults;
  }> {
    const rows = Array.from(this.workflowExecutions.values())
      .filter(
        (exec) =>
          exec.workflowId === workflowId &&
          exec.spaceId === spaceId &&
          !TerminalExecutionStatuses.includes(exec.status)
      )
      .sort((a, b) => {
        const byCreated = a.createdAt.localeCompare(b.createdAt);
        return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
      });

    const total = rows.length;

    let startIndex = 0;
    if (searchAfter && searchAfter.length >= 2) {
      const afterCreatedAt = String(searchAfter[0]);
      const afterId = String(searchAfter[1]);
      startIndex = rows.findIndex(
        (r) => r.createdAt > afterCreatedAt || (r.createdAt === afterCreatedAt && r.id > afterId)
      );
      if (startIndex === -1) {
        return { results: [], total, nextSearchAfter: undefined };
      }
    }

    const page = rows.slice(startIndex, startIndex + size);
    const results = page.map((r) => r.id);

    let nextSearchAfter: estypes.SortResults | undefined;
    if (page.length === size && page.length > 0) {
      const last = page[page.length - 1];
      nextSearchAfter = [last.createdAt, last.id];
    }

    return { results, total, nextSearchAfter };
  }

  public async getRunningExecutionsByConcurrencyGroup(
    concurrencyGroupKey: string,
    spaceId: string,
    excludeExecutionId?: string,
    size: number = 5000
  ): Promise<string[]> {
    const results = Array.from(this.workflowExecutions.values())
      .filter(
        (exec) =>
          exec.concurrencyGroupKey === concurrencyGroupKey &&
          exec.spaceId === spaceId &&
          ConcurrencySlotOccupyingExecutionStatuses.includes(exec.status) &&
          (!excludeExecutionId || exec.id !== excludeExecutionId)
      )
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return aTime - bTime !== 0 ? aTime - bTime : a.id.localeCompare(b.id);
      })
      .map((exec) => exec.id)
      .slice(0, Math.min(size, 10000)); // Cap at ES default max_result_window

    return results;
  }

  public async countExecutionsByConcurrencyGroupAndStatuses(
    concurrencyGroupKey: string,
    spaceId: string,
    statuses: readonly ExecutionStatus[],
    excludeExecutionId?: string
  ): Promise<number> {
    return Array.from(this.workflowExecutions.values()).filter(
      (exec) =>
        exec.concurrencyGroupKey === concurrencyGroupKey &&
        exec.spaceId === spaceId &&
        statuses.includes(exec.status) &&
        (!excludeExecutionId || exec.id !== excludeExecutionId)
    ).length;
  }

  public async getOldestQueuedExecutionIdByConcurrencyGroup(
    concurrencyGroupKey: string,
    spaceId: string
  ): Promise<string | null> {
    const sorted = Array.from(this.workflowExecutions.values())
      .filter(
        (exec) =>
          exec.concurrencyGroupKey === concurrencyGroupKey &&
          exec.spaceId === spaceId &&
          exec.status === ExecutionStatus.QUEUED
      )
      .sort((a, b) => {
        const byCreated = a.createdAt.localeCompare(b.createdAt);
        return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
      });
    return sorted[0]?.id ?? null;
  }

  public async tryCasPromoteQueuedWorkflowExecutionToPending(params: {
    workflowExecutionId: string;
    spaceId: string;
  }): Promise<boolean> {
    const existing = this.workflowExecutions.get(params.workflowExecutionId);
    if (
      !existing ||
      existing.spaceId !== params.spaceId ||
      existing.status !== ExecutionStatus.QUEUED
    ) {
      return false;
    }
    this.workflowExecutions.set(params.workflowExecutionId, {
      ...existing,
      status: ExecutionStatus.PENDING,
    });
    return true;
  }

  public async bulkUpdateWorkflowExecutions(
    updates: Array<Partial<EsWorkflowExecution>>
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    // Validate all IDs are present
    for (const update of updates) {
      if (!update.id) {
        throw new Error('Workflow execution ID is required for bulk update');
      }
    }

    // Validate all executions exist (matching Elasticsearch document_missing_exception behavior)
    const missingIds: string[] = [];
    for (const update of updates) {
      if (!this.workflowExecutions.has(update.id!)) {
        missingIds.push(update.id!);
      }
    }

    if (missingIds.length > 0) {
      throw new Error(
        `Failed to update ${missingIds.length} workflow executions: ${JSON.stringify(
          missingIds.map((id) => ({
            id,
            error: { type: 'document_missing_exception', reason: 'document missing' },
            status: 404,
          }))
        )}`
      );
    }

    // Perform updates
    for (const update of updates) {
      const existing = this.workflowExecutions.get(update.id!);
      this.workflowExecutions.set(update.id!, {
        ...existing!,
        ...update,
      } as EsWorkflowExecution);
    }
  }
}
