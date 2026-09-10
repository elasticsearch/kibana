/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SortOrder } from '@elastic/elasticsearch/lib/api/types';
import type { LogSearchResult, WorkflowLogEvent } from '../repositories/logs_repository';

/**
 * Event Logger Service Interfaces
 */
export interface BaseLogsParams {
  // spaces
  spaceId?: string;
  // pagination
  sortField?: string;
  sortOrder?: SortOrder;
  page?: number;
  size?: number;
}

export interface SearchLogsParams extends BaseLogsParams {
  executionId?: string;
  stepExecutionId?: string;
  stepId?: string;
}

export interface ExecutionLogsParams extends BaseLogsParams {
  executionId: string;
}

export interface StepLogsParams extends BaseLogsParams {
  stepExecutionId: string;
  executionId: string;
}

export interface LogsByLevelParams extends BaseLogsParams {
  executionId?: string;
  level: string;
}

export interface IWorkflowEventLoggerService {
  createLogger(
    context: WorkflowEventLoggerContext,
    options?: WorkflowEventLoggerOptions
  ): IWorkflowEventLogger;
  createWorkflowLogger(workflowId: string, workflowName?: string): IWorkflowEventLogger;
  createExecutionLogger(
    workflowId: string,
    executionId: string,
    workflowName?: string
  ): IWorkflowEventLogger;
  createStepLogger(
    workflowId: string,
    executionId: string,
    stepId: string,
    stepName?: string,
    stepType?: string,
    workflowName?: string
  ): IWorkflowEventLogger;

  getExecutionLogs(params: ExecutionLogsParams): Promise<LogSearchResult>;
  getStepLogs(params: StepLogsParams): Promise<LogSearchResult>;
  getLogsByLevel(params: LogsByLevelParams): Promise<LogSearchResult>;
  searchLogs(params: SearchLogsParams): Promise<LogSearchResult>;
  getRecentLogs(limit?: number): Promise<LogSearchResult>;
}

/**
 * Event Logger Interfaces
 */
export interface WorkflowEventLoggerContext {
  workflowId?: string;
  workflowName?: string;
  executionId?: string;
  stepExecutionId?: string;
  stepId?: string;
  stepName?: string;
  stepType?: string;
  spaceId?: string;
}

export interface WorkflowEventLoggerOptions {
  throwOnFailure?: boolean;
  enableConsoleLogging?: boolean;
}

export interface WorkflowEventFlushOptions {
  signal?: AbortSignal;
}

export interface IWorkflowEventLogger {
  logInfo(message: string, additionalData?: Partial<WorkflowLogEvent>): void;
  logError(message: string, error?: Error, additionalData?: Partial<WorkflowLogEvent>): void;
  logWarn(message: string, additionalData?: Partial<WorkflowLogEvent>): void;
  logDebug(message: string, additionalData?: Partial<WorkflowLogEvent>): void;
  startTiming(event: WorkflowLogEvent): void;
  stopTiming(event: WorkflowLogEvent): void;
  createStepLogger(
    stepExecutionId: string,
    stepId: string,
    stepName?: string,
    stepType?: string
  ): IWorkflowEventLogger;
  flushEvents(options?: WorkflowEventFlushOptions): Promise<void>;
}
