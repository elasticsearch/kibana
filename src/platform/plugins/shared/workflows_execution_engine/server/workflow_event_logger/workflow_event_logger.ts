/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { merge } from 'lodash';
import type { Logger } from '@kbn/core/server';
import { ExecutionError } from '@kbn/workflows/server';
import type { SyncLogDrain } from './sync_log_drain';
import type {
  IWorkflowEventLogger,
  WorkflowEventFlushOptions,
  WorkflowEventLoggerContext,
  WorkflowEventLoggerOptions,
} from './types';
import type { LogsRepository, WorkflowLogEvent } from '../repositories/logs_repository';
import { isWorkflowTaskManagerAbortSignal } from '../workflow_task_shutdown';

export class WorkflowEventLogger implements IWorkflowEventLogger {
  private eventQueue: WorkflowLogEvent[] = [];
  private timings: Map<string, Date> = new Map();

  constructor(
    private logsRepository: LogsRepository,
    private logger: Logger,
    private context: WorkflowEventLoggerContext = {},
    private options: WorkflowEventLoggerOptions = {},
    /** When provided, `flushEvents` routes events to this drain instead of writing
     *  to Elasticsearch inline. Used exclusively by the synchronous execution path
     *  to keep the hot path free of blocking ES round-trips. */
    private readonly syncLogDrain?: SyncLogDrain
  ) {}

  public logEvent(eventProperties: Partial<WorkflowLogEvent>): void {
    const event: WorkflowLogEvent = this.createBaseEvent();

    // Merge context, default properties, and provided properties
    merge(event, eventProperties);

    // Log to console if enabled
    if (this.options.enableConsoleLogging) {
      this.logToConsole(event);
    }

    this.queueEvent(event);
  }

  public logInfo(message: string, additionalData: Partial<WorkflowLogEvent> = {}): void {
    this.logEvent({
      message,
      level: 'info',
      event: {
        action: 'log',
        category: ['workflow'],
        type: ['info'],
        provider: 'workflow-engine',
        ...additionalData.event,
      },
      ...additionalData,
    });
  }

  public logError(
    message: string,
    error?: Error,
    additionalData: Partial<WorkflowLogEvent> = {}
  ): void {
    const errorData: Partial<WorkflowLogEvent> = {};

    if (error) {
      errorData.error = ExecutionError.fromError(error).toSerializableObject();
    }

    this.logEvent({
      message,
      level: 'error',
      event: {
        action: 'error',
        category: ['workflow'],
        type: ['error'],
        provider: 'workflow-engine',
        outcome: 'failure',
        ...additionalData.event,
      },
      ...errorData,
      ...additionalData,
    });
  }

  public logWarn(message: string, additionalData: Partial<WorkflowLogEvent> = {}): void {
    this.logEvent({
      message,
      level: 'warn',
      event: {
        action: 'warning',
        category: ['workflow'],
        type: ['info'],
        provider: 'workflow-engine',
        ...additionalData.event,
      },
      ...additionalData,
    });
  }

  public logDebug(message: string, additionalData: Partial<WorkflowLogEvent> = {}): void {
    this.logEvent({
      message,
      level: 'debug',
      event: {
        action: 'debug',
        category: ['workflow'],
        type: ['info'],
        provider: 'workflow-engine',
        ...additionalData.event,
      },
      ...additionalData,
    });
  }

  public startTiming(event: WorkflowLogEvent): void {
    const timingKey = this.getTimingKey(event);
    this.timings.set(timingKey, new Date());

    // Log start event
    this.logEvent({
      ...event,
      event: {
        ...event.event,
        action: event.event?.action ? `${event.event.action}-start` : 'timing-start',
        start: new Date().toISOString(),
      },
    });
  }

  public stopTiming(event: WorkflowLogEvent): void {
    const timingKey = this.getTimingKey(event);
    const startTime = this.timings.get(timingKey);

    if (startTime) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logEvent({
        ...event,
        event: {
          ...event.event,
          action: event.event?.action ? `${event.event.action}-complete` : 'timing-complete',
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          duration,
          outcome: event.event?.outcome || 'success',
        },
      });

      this.timings.delete(timingKey);
    }
  }

  public createStepLogger(
    stepExecutionId: string,
    stepId: string,
    stepName?: string,
    stepType?: string
  ): IWorkflowEventLogger {
    return new WorkflowEventLogger(
      this.logsRepository,
      this.logger,
      {
        ...this.context,
        stepExecutionId,
        stepId,
        stepName,
        stepType,
      },
      this.options,
      this.syncLogDrain
    );
  }

  private createBaseEvent(): WorkflowLogEvent {
    return {
      '@timestamp': new Date().toISOString(),
      message: '',
      spaceId: this.context.spaceId,
      workflow: {
        id: this.context.workflowId,
        name: this.context.workflowName,
        execution_id: this.context.executionId,
        step_id: this.context.stepId,
        step_execution_id: this.context.stepExecutionId,
        step_name: this.context.stepName,
        step_type: this.context.stepType,
      },
      event: {
        provider: 'workflow-engine',
      },
      tags: ['workflow'],
    };
  }

  private logToConsole(event: WorkflowLogEvent): void {
    const message = event.message || '';

    // Format workflow context metadata
    const meta: Record<string, unknown> = {
      workflow: {
        name: event.workflow?.name,
        execution_id: event.workflow?.execution_id,
        step_name: event.workflow?.step_name,
        step_type: event.workflow?.step_type,
      },
      event: event.event,
      tags: event.tags,
    };

    // Add error details if present
    if (event.error) {
      meta.error = event.error;
    }

    // Use Kibana's structured logger with appropriate level
    switch (event.level) {
      case 'error':
        this.logger.error(`🔄 WORKFLOW: ${message}`, meta);
        break;
      case 'warn':
        this.logger.warn(`🔄 WORKFLOW: ${message}`, meta);
        break;
      case 'debug':
        this.logger.debug(`🔄 WORKFLOW: ${message}`, meta);
        break;
      case 'trace':
        this.logger.trace(`🔄 WORKFLOW: ${message}`, meta);
        break;
      default:
        this.logger.info(`🔄 WORKFLOW: ${message}`, meta);
    }
  }

  private getTimingKey(event: WorkflowLogEvent): string {
    return `${this.context.executionId || 'unknown'}-${event.event?.action || 'unknown'}-${
      this.context.stepId || 'workflow'
    }`;
  }

  private queueEvent(event: WorkflowLogEvent): void {
    this.eventQueue.push(event);
  }

  public async flushEvents(options: WorkflowEventFlushOptions = {}): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    // In sync execution mode, route events to the background drain so the
    // calling request is not blocked by an inline Elasticsearch write.
    if (this.syncLogDrain !== undefined) {
      this.syncLogDrain.enqueue(events);
      return;
    }

    try {
      await this.logsRepository.createLogs(events);

      this.logger.debug(`Successfully indexed ${events.length} workflow events`);
    } catch (error) {
      if (options.signal && isWorkflowTaskManagerAbortSignal(options.signal)) {
        // Best-effort flushes are used after Task Manager aborts; do not re-queue
        // because this process may not get another chance to flush them.
        this.logger.debug(`Failed to index workflow events during best-effort flush`, {
          eventsCount: events.length,
          error: { message: error instanceof Error ? error.message : String(error) },
        });
        return;
      }

      this.logger.error(`Failed to index workflow events: ${error.message}`, {
        eventsCount: events.length,
        error: error.stack,
      });

      // Re-queue events for retry (optional)
      this.eventQueue.unshift(...events);
    }
  }
}
