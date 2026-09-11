/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import type { DataStreamsStart } from '@kbn/core-data-streams-server';
import type { SyncLogDrain } from './sync_log_drain';
import type {
  BaseLogsParams,
  ExecutionLogsParams,
  IWorkflowEventLogger,
  IWorkflowEventLoggerService,
  LogsByLevelParams,
  StepLogsParams,
  WorkflowEventLoggerContext,
} from './types';
import { WorkflowEventLogger } from './workflow_event_logger';
import type { LogSearchResult, SearchLogsParams } from '../repositories/logs_repository';
import { LogsRepository } from '../repositories/logs_repository';

export class WorkflowEventLoggerService implements IWorkflowEventLoggerService {
  private logsRepository: LogsRepository;
  constructor(
    dataStreams: DataStreamsStart,
    private readonly logger: Logger,
    private readonly enableConsoleLogging: boolean = false,
    /** When provided, all loggers created by this service will route their
     *  `flushEvents` calls to this drain instead of writing to ES inline.
     *  Pass only on the synchronous execution path. */
    private readonly syncLogDrain?: SyncLogDrain
  ) {
    this.logsRepository = new LogsRepository(dataStreams, logger);
  }

  public createLogger(context: WorkflowEventLoggerContext): IWorkflowEventLogger {
    return new WorkflowEventLogger(
      this.logsRepository,
      this.logger,
      context,
      { enableConsoleLogging: this.enableConsoleLogging },
      this.syncLogDrain
    );
  }

  public createWorkflowLogger(workflowId: string, workflowName?: string): IWorkflowEventLogger {
    return this.createLogger({
      workflowId,
      workflowName,
    });
  }

  public createExecutionLogger(
    workflowId: string,
    executionId: string,
    workflowName?: string
  ): IWorkflowEventLogger {
    return this.createLogger({
      workflowId,
      workflowName,
      executionId,
    });
  }

  public createStepLogger(
    workflowId: string,
    executionId: string,
    stepId: string,
    stepName?: string,
    stepType?: string,
    workflowName?: string
  ): IWorkflowEventLogger {
    return this.createLogger({
      workflowId,
      workflowName,
      executionId,
      stepId,
      stepName,
      stepType,
    });
  }

  private transformPaginationParams(params: BaseLogsParams): Partial<SearchLogsParams> {
    const { size = 200, page = 1, ...rest } = params;
    return {
      ...rest,
      limit: size,
      offset: (page - 1) * size,
    };
  }

  public getExecutionLogs(params: ExecutionLogsParams): Promise<LogSearchResult> {
    if (!params.executionId) {
      this.logger.error('Execution logs: Execution ID is required');
      throw new Error('Execution logs: Execution ID is required');
    }

    return this.logsRepository.searchLogs(this.transformPaginationParams(params));
  }

  public getStepLogs(params: StepLogsParams): Promise<LogSearchResult> {
    if (!params.executionId || !params.stepExecutionId) {
      this.logger.error('Step logs: Execution ID and step execution ID are required');
      throw new Error('Step logs: Execution ID and step execution ID are required');
    }

    return this.logsRepository.searchLogs(this.transformPaginationParams(params));
  }

  public async getLogsByLevel(params: LogsByLevelParams): Promise<LogSearchResult> {
    if (!params.level) {
      this.logger.error('Logs by level: Level is required');
      throw new Error('Logs by level: Level is required');
    }

    return this.logsRepository.searchLogs(this.transformPaginationParams(params));
  }

  public async searchLogs(params: SearchLogsParams): Promise<LogSearchResult> {
    return this.logsRepository.searchLogs(this.transformPaginationParams(params));
  }

  public async getRecentLogs(limit: number = 100): Promise<LogSearchResult> {
    try {
      return await this.logsRepository.getRecentLogs(limit);
    } catch (error) {
      this.logger.error('Failed to get recent workflow logs', error);
      throw error;
    }
  }
}
