/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { HttpFetchQuery, HttpSetup } from '@kbn/core/public';
import type {
  ChildWorkflowExecutionItem,
  CreateWorkflowCommand,
  EsWorkflowStepExecution,
  GetAvailableConnectorsResponse,
  RunStepCommand,
  RunWorkflowResponseDto,
  TestWorkflowResponseDto,
  UpdatedWorkflowResponseDto,
  ValidateWorkflowResponseDto,
  WorkflowAggsDto,
  WorkflowDetailDto,
  WorkflowExecutionDto,
  WorkflowExecutionListDto,
  WorkflowListDto,
  WorkflowMgetResponseDto,
  WorkflowsSearchParams,
  WorkflowStatsDto,
  WorkflowStepExecutionListDto,
} from '@kbn/workflows';

import type { z } from '@kbn/zod/v4';
import type {
  BulkCreateWorkflowsParams,
  BulkCreateWorkflowsResponse,
  ExportWorkflowsParams,
  ExportWorkflowsResponse,
  GetAggsParams,
  GetExecutionLogsParams,
  GetExecutionParams,
  GetSchemaParams,
  GetWorkflowExecutionsParams,
  GetWorkflowStepExecutionsParams,
  MgetWorkflowsParams,
  RestoreWorkflowVersionParams,
  RestoreWorkflowVersionResponseDto,
  ResumeExecutionParams,
  RunWorkflowOptions,
  SearchTriggerEventLogParams,
  SearchTriggerEventLogResult,
  TestWorkflowParams,
  UpdateWorkflowParams,
  ValidateWorkflowParams,
  WorkflowExecutionLogsResponse,
  WorkflowsConfig,
} from './types';

const BASE = '/api/workflows';
const INTERNAL_BASE = '/internal/workflows';
const API_VERSION = '2023-10-31';
const INTERNAL_API_VERSION = '1';

export class WorkflowApi {
  constructor(private readonly http: HttpSetup) {}

  // ---------------------------------------------------------------------------
  // Workflow CRUD
  // ---------------------------------------------------------------------------

  async getWorkflows(params: WorkflowsSearchParams = {}): Promise<WorkflowListDto> {
    return this.http.get(BASE, {
      query: params as HttpFetchQuery,
      version: API_VERSION,
    });
  }

  async getWorkflow(id: string): Promise<WorkflowDetailDto> {
    return this.http.get(`${BASE}/workflow/${encodeURIComponent(id)}`, {
      version: API_VERSION,
    });
  }

  async createWorkflow(params: CreateWorkflowCommand): Promise<WorkflowDetailDto> {
    return this.http.post(`${BASE}/workflow`, {
      body: JSON.stringify(params),
      version: API_VERSION,
    });
  }

  async updateWorkflow(
    id: string,
    params: UpdateWorkflowParams
  ): Promise<UpdatedWorkflowResponseDto> {
    return this.http.put(`${BASE}/workflow/${encodeURIComponent(id)}`, {
      body: JSON.stringify(params),
      version: API_VERSION,
    });
  }

  async deleteWorkflow(id: string): Promise<void> {
    return this.http.delete(`${BASE}/workflow/${encodeURIComponent(id)}`, {
      version: API_VERSION,
    });
  }

  // ---------------------------------------------------------------------------
  // Workflow bulk operations
  // ---------------------------------------------------------------------------

  async bulkCreateWorkflows({
    workflows,
    overwrite,
  }: BulkCreateWorkflowsParams): Promise<BulkCreateWorkflowsResponse> {
    return this.http.post(BASE, {
      query: { overwrite: overwrite ?? false },
      body: JSON.stringify({ workflows }),
      version: API_VERSION,
    });
  }

  async bulkDeleteWorkflows(ids: string[]): Promise<void> {
    return this.http.delete(BASE, {
      body: JSON.stringify({ ids }),
      version: API_VERSION,
    });
  }

  async mgetWorkflows({ ids, source }: MgetWorkflowsParams): Promise<WorkflowMgetResponseDto> {
    return this.http.post(`${BASE}/mget`, {
      body: JSON.stringify({ ids, source }),
      version: API_VERSION,
    });
  }

  // ---------------------------------------------------------------------------
  // Workflow operations
  // ---------------------------------------------------------------------------

  async cloneWorkflow(id: string): Promise<WorkflowDetailDto> {
    return this.http.post(`${BASE}/workflow/${encodeURIComponent(id)}/clone`, {
      version: API_VERSION,
    });
  }

  async validateWorkflow({ yaml }: ValidateWorkflowParams): Promise<ValidateWorkflowResponseDto> {
    return this.http.post(`${BASE}/validate`, {
      body: JSON.stringify({ yaml }),
      version: INTERNAL_API_VERSION, // temporary until we have a reliable validate endpoint
    });
  }

  async exportWorkflows({ ids }: ExportWorkflowsParams): Promise<ExportWorkflowsResponse> {
    return this.http.post(`${BASE}/export`, {
      body: JSON.stringify({ ids }),
      version: API_VERSION,
    });
  }

  async getStats(): Promise<WorkflowStatsDto> {
    return this.http.get(`${BASE}/stats`, {
      version: API_VERSION,
    });
  }

  async getAggs({ fields, managed }: GetAggsParams): Promise<WorkflowAggsDto> {
    return this.http.get(`${BASE}/aggs`, {
      query: { fields, ...(managed ? { managed } : {}) },
      version: API_VERSION,
    });
  }

  async getConnectors(): Promise<GetAvailableConnectorsResponse> {
    return this.http.get(`${BASE}/connectors`, {
      version: API_VERSION,
    });
  }

  async getSchema({ loose }: GetSchemaParams): Promise<z.core.JSONSchema.JSONSchema | null> {
    return this.http.get(`${BASE}/schema`, {
      query: { loose },
      version: API_VERSION,
    });
  }

  // ---------------------------------------------------------------------------
  // Execution operations
  // ---------------------------------------------------------------------------

  async runWorkflow(
    id: string,
    { inputs, metadata }: RunWorkflowOptions
  ): Promise<RunWorkflowResponseDto> {
    return this.http.post(`${BASE}/workflow/${encodeURIComponent(id)}/run`, {
      body: JSON.stringify({ inputs, metadata }),
      version: API_VERSION,
    });
  }

  async testWorkflow(params: TestWorkflowParams): Promise<TestWorkflowResponseDto> {
    return this.http.post(`${BASE}/test`, {
      body: JSON.stringify(params),
      version: API_VERSION,
    });
  }

  async testStep(params: RunStepCommand): Promise<TestWorkflowResponseDto> {
    return this.http.post(`${BASE}/step/test`, {
      body: JSON.stringify(params),
      version: API_VERSION,
    });
  }

  async getWorkflowExecutions(
    workflowId: string,
    params?: GetWorkflowExecutionsParams
  ): Promise<WorkflowExecutionListDto> {
    return this.http.get(`${BASE}/workflow/${encodeURIComponent(workflowId)}/executions`, {
      query: params as HttpFetchQuery,
      version: API_VERSION,
    });
  }

  async getWorkflowStepExecutions(
    workflowId: string,
    params?: GetWorkflowStepExecutionsParams
  ): Promise<WorkflowStepExecutionListDto> {
    return this.http.get(`${BASE}/workflow/${encodeURIComponent(workflowId)}/executions/steps`, {
      query: params as HttpFetchQuery,
      version: API_VERSION,
    });
  }

  async getExecution(
    executionId: string,
    params?: GetExecutionParams
  ): Promise<WorkflowExecutionDto> {
    return this.http.get(`${BASE}/executions/${encodeURIComponent(executionId)}`, {
      query: params as HttpFetchQuery,
      version: API_VERSION,
    });
  }

  async cancelExecution(executionId: string): Promise<void> {
    return this.http.post(`${BASE}/executions/${encodeURIComponent(executionId)}/cancel`, {
      version: API_VERSION,
    });
  }

  async cancelAllWorkflowExecutions(workflowId: string): Promise<void> {
    return this.http.post(`${BASE}/workflow/${encodeURIComponent(workflowId)}/executions/cancel`, {
      version: API_VERSION,
    });
  }

  async getStepExecution(
    executionId: string,
    stepExecutionId: string
  ): Promise<EsWorkflowStepExecution> {
    return this.http.get(
      `${BASE}/executions/${encodeURIComponent(executionId)}/step/${encodeURIComponent(
        stepExecutionId
      )}`,
      { version: API_VERSION }
    );
  }

  async resumeExecution(executionId: string, { input }: ResumeExecutionParams): Promise<void> {
    return this.http.post(`${BASE}/executions/${encodeURIComponent(executionId)}/resume`, {
      body: JSON.stringify({ input }),
      version: API_VERSION,
    });
  }

  async getExecutionLogs(
    executionId: string,
    params?: GetExecutionLogsParams
  ): Promise<WorkflowExecutionLogsResponse> {
    return this.http.get(`${BASE}/executions/${encodeURIComponent(executionId)}/logs`, {
      query: params as HttpFetchQuery,
      version: API_VERSION,
    });
  }

  async getChildrenExecutions(executionId: string): Promise<ChildWorkflowExecutionItem[]> {
    return this.http.get(`${BASE}/executions/${encodeURIComponent(executionId)}/children`, {
      version: API_VERSION,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal operations
  // ---------------------------------------------------------------------------

  async getConfig(): Promise<WorkflowsConfig> {
    return this.http.get(`${INTERNAL_BASE}/config`, {
      version: INTERNAL_API_VERSION,
    });
  }

  async searchTriggerEvents(
    params: SearchTriggerEventLogParams
  ): Promise<SearchTriggerEventLogResult> {
    return this.http.post(`${INTERNAL_BASE}/trigger_events/_search`, {
      body: JSON.stringify(params),
      version: INTERNAL_API_VERSION,
    });
  }

  async restoreWorkflowVersion(
    workflowId: string,
    eventId: string,
    { signal }: RestoreWorkflowVersionParams = {}
  ): Promise<RestoreWorkflowVersionResponseDto> {
    return this.http.post(
      `${INTERNAL_BASE}/workflow/${encodeURIComponent(workflowId)}/history/${encodeURIComponent(
        eventId
      )}/restore`,
      {
        version: INTERNAL_API_VERSION,
        signal,
      }
    );
  }
}
