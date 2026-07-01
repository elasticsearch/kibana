/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';
import type {
  WorkflowExecutionListItemDto,
  WorkflowExecutionCollapseField,
  WorkflowExecutionSortField,
  WorkflowExecutionSortOrder,
} from '@kbn/workflows';
import type {
  WorkflowsManagementApi,
  WorkflowsServerPluginSetup,
} from '@kbn/workflows-management-plugin/server';
import {
  SignificantEventsWorkflowStatus,
  type SignificantEventsWorkflowStatusResult,
} from '@kbn/significant-events-schema';

export interface WorkflowExecutionQueryParams {
  size?: number;
  statuses?: ExecutionStatus[];
  concurrencyGroupKey?: string;
  sortField?: WorkflowExecutionSortField;
  sortOrder?: WorkflowExecutionSortOrder;
  collapse?: WorkflowExecutionCollapseField;
}

interface WorkflowExecutionGetParams {
  id: string;
  spaceId: string;
  options?: Parameters<WorkflowsManagementApi['getWorkflowExecution']>[2];
}

interface WorkflowExecutionCancelParams {
  id: string;
  spaceId: string;
  request: KibanaRequest;
}

/**
 * Generic adapter over the workflow management API.
 * `TInput` types the inputs passed to `execute`; the cast to
 * `Record<string, unknown>` for the underlying API is done internally.
 */
export class WorkflowExecutionService<TInput extends object = {}> {
  private readonly managementApi: WorkflowsServerPluginSetup['management'];
  private readonly workflowId: string;
  private readonly workflowSpaceId: string;

  constructor({
    managementApi,
    workflowId,
    workflowSpaceId,
  }: {
    managementApi: WorkflowsServerPluginSetup['management'];
    workflowId: string;
    workflowSpaceId: string;
  }) {
    this.managementApi = managementApi;
    this.workflowId = workflowId;
    this.workflowSpaceId = workflowSpaceId;
  }

  static classifyExecutionStatus(
    status: ExecutionStatus
  ): Exclude<
    SignificantEventsWorkflowStatus,
    SignificantEventsWorkflowStatus.NotStarted | SignificantEventsWorkflowStatus.BeingCanceled
  > {
    switch (status) {
      case ExecutionStatus.PENDING:
      case ExecutionStatus.QUEUED:
      case ExecutionStatus.RUNNING:
      case ExecutionStatus.WAITING:
      case ExecutionStatus.WAITING_FOR_INPUT:
      case ExecutionStatus.WAITING_FOR_CHILD:
        return SignificantEventsWorkflowStatus.InProgress;
      case ExecutionStatus.COMPLETED:
        return SignificantEventsWorkflowStatus.Completed;
      case ExecutionStatus.FAILED:
      case ExecutionStatus.TIMED_OUT:
        return SignificantEventsWorkflowStatus.Failed;
      case ExecutionStatus.CANCELLED:
      case ExecutionStatus.SKIPPED:
        return SignificantEventsWorkflowStatus.Canceled;
      default: {
        const _exhaustiveCheck: never = status;
        throw new Error(`Unhandled ExecutionStatus: ${_exhaustiveCheck}`);
      }
    }
  }

  static getFailureMessage({
    execution,
    workflowId,
  }: {
    execution: Pick<WorkflowExecutionListItemDto, 'status' | 'error'>;
    workflowId: string;
  }): string {
    if (execution.status === ExecutionStatus.TIMED_OUT) {
      return `Workflow ${workflowId} timed out`;
    }
    return execution.error?.message ?? 'Unknown error';
  }

  /**
   * Maps an existing execution to a status result, attaching the failure message
   * for failed runs.
   */
  static toStatusResult({
    execution,
    workflowId,
  }: {
    execution: WorkflowExecutionListItemDto;
    workflowId: string;
  }): SignificantEventsWorkflowStatusResult {
    const status = WorkflowExecutionService.classifyExecutionStatus(execution.status);

    if (status === SignificantEventsWorkflowStatus.Failed) {
      return {
        status: SignificantEventsWorkflowStatus.Failed,
        executionId: execution.id,
        error: WorkflowExecutionService.getFailureMessage({ execution, workflowId }),
      };
    }

    return { status, executionId: execution.id };
  }

  async getStatus({
    spaceId,
    queryParams,
  }: {
    spaceId: string;
    queryParams?: WorkflowExecutionQueryParams;
  }): Promise<SignificantEventsWorkflowStatusResult> {
    const lastExecution = await this.getLastExecution(spaceId, queryParams);

    if (!lastExecution) {
      return { status: SignificantEventsWorkflowStatus.NotStarted, executionId: null };
    }

    return WorkflowExecutionService.toStatusResult({
      execution: lastExecution,
      workflowId: this.workflowId,
    });
  }

  /**
   * `TInput` is cast to `Record<string, unknown>` at the wire boundary — it
   * enforces the input shape for callers but not the underlying management API call.
   */
  async execute({
    executionSpaceId,
    inputs,
    request,
  }: {
    executionSpaceId: string;
    inputs?: TInput;
    request: KibanaRequest;
  }): Promise<string> {
    const workflow = await this.managementApi.getWorkflow(this.workflowId, this.workflowSpaceId);

    if (!workflow || !workflow.definition) {
      throw new Error(`Workflow ${this.workflowId} not found`);
    }

    return this.managementApi.runWorkflow(
      { ...workflow, definition: workflow.definition },
      executionSpaceId,
      inputs ?? {},
      request
    );
  }

  async cancelLatest({
    spaceId,
    request,
    concurrencyGroupKey,
  }: {
    spaceId: string;
    request: KibanaRequest;
    concurrencyGroupKey?: string;
  }): Promise<string | null> {
    const lastExecution = await this.getLastExecution(
      spaceId,
      concurrencyGroupKey !== undefined ? { concurrencyGroupKey } : undefined
    );

    if (lastExecution && !isTerminalStatus(lastExecution.status)) {
      await this.managementApi.cancelWorkflowExecution(lastExecution.id, spaceId, request);
      return lastExecution.id;
    }

    return null;
  }

  async getExecutions(params: WorkflowExecutionQueryParams, spaceId: string) {
    return this.managementApi.getWorkflowExecutions(
      { workflowId: this.workflowId, ...params },
      spaceId
    );
  }

  async getLastExecution(
    spaceId: string,
    queryParams?: WorkflowExecutionQueryParams
  ): Promise<WorkflowExecutionListItemDto | null> {
    const { results } = await this.getExecutions(
      { sortField: 'createdAt', sortOrder: 'desc', ...queryParams, size: 1 },
      spaceId
    );
    return results[0] ?? null;
  }

  async getExecution({ id, spaceId, options }: WorkflowExecutionGetParams) {
    return this.managementApi.getWorkflowExecution(id, spaceId, options);
  }

  async cancelExecution({ id, spaceId, request }: WorkflowExecutionCancelParams): Promise<void> {
    return this.managementApi.cancelWorkflowExecution(id, spaceId, request);
  }
}
