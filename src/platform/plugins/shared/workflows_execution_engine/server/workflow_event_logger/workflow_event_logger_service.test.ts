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
import { WorkflowEventLoggerService } from './workflow_event_logger_service';
import type { LogsRepository, WorkflowLogEvent } from '../repositories/logs_repository';

const createLoggerMock = () =>
  ({
    error: jest.fn(),
  } as unknown as Logger);

describe('WorkflowEventLoggerService', () => {
  it('maps paging fields for repository search helpers', async () => {
    const service = new WorkflowEventLoggerService({} as DataStreamsStart, createLoggerMock());
    const repository = { searchLogs: jest.fn().mockResolvedValue({ total: 0, logs: [] }) };
    (service as any).logsRepository = repository;

    await service.getExecutionLogs({
      executionId: 'exec-1',
      page: 2,
      size: 50,
      sortField: 'timestamp',
    });

    expect(repository.searchLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'exec-1',
        limit: 50,
        offset: 50,
      })
    );
  });

  it('throws validation errors for missing required params', async () => {
    const logger = createLoggerMock();
    const service = new WorkflowEventLoggerService({} as DataStreamsStart, logger);

    expect(() => service.getExecutionLogs({} as any)).toThrow(
      'Execution logs: Execution ID is required'
    );
    expect(() => service.getStepLogs({ executionId: 'exec-1' } as any)).toThrow(
      'Step logs: Execution ID and step execution ID are required'
    );
    await expect(service.getLogsByLevel({} as any)).rejects.toThrow(
      'Logs by level: Level is required'
    );
    expect(logger.error).toHaveBeenCalledTimes(3);
  });

  it('returns contextual logger instances from convenience factories', () => {
    const service = new WorkflowEventLoggerService(
      {} as DataStreamsStart,
      createLoggerMock(),
      true
    );
    const createLoggerSpy = jest.spyOn(service, 'createLogger');

    service.createWorkflowLogger('wf-1', 'workflow');
    service.createExecutionLogger('wf-1', 'exec-1', 'workflow');
    service.createStepLogger('wf-1', 'exec-1', 'step-1', 'Step', 'wait', 'workflow');

    expect(createLoggerSpy).toHaveBeenNthCalledWith(1, {
      workflowId: 'wf-1',
      workflowName: 'workflow',
    });
    expect(createLoggerSpy).toHaveBeenNthCalledWith(2, {
      workflowId: 'wf-1',
      workflowName: 'workflow',
      executionId: 'exec-1',
    });
    expect(createLoggerSpy).toHaveBeenNthCalledWith(3, {
      workflowId: 'wf-1',
      workflowName: 'workflow',
      executionId: 'exec-1',
      stepId: 'step-1',
      stepName: 'Step',
      stepType: 'wait',
    });
  });

  it('rethrows repository failures from getRecentLogs', async () => {
    const logger = createLoggerMock();
    const service = new WorkflowEventLoggerService({} as DataStreamsStart, logger);
    const repositoryError = new Error('repository down');
    const repository = { getRecentLogs: jest.fn().mockRejectedValue(repositoryError) };
    (service as any).logsRepository = repository;

    await expect(service.getRecentLogs(10)).rejects.toThrow(repositoryError);
    expect(repository.getRecentLogs).toHaveBeenCalledWith(10);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to get recent workflow logs',
      repositoryError
    );
  });
});

/**
 * Machine-checked invariant: when a SyncLogDrain is injected into the service,
 * every logger the service creates must route flushEvents to the drain — never
 * to logsRepository.createLogs inline. This pins the "sync call produces no
 * inline ES write" guarantee so it cannot silently regress.
 */
describe('WorkflowEventLoggerService — sync log drain integration', () => {
  const makeDrain = () => ({ enqueue: jest.fn() });
  const makeLogsRepository = () =>
    ({ createLogs: jest.fn() } as unknown as jest.Mocked<LogsRepository>);

  it('routes flushEvents through the drain; createLogs is never called inline', async () => {
    const drain = makeDrain();
    const service = new WorkflowEventLoggerService(
      {} as DataStreamsStart,
      createLoggerMock(),
      false,
      drain as any
    );
    (service as any).logsRepository = makeLogsRepository();

    const workflowLogger = service.createLogger({
      workflowId: 'wf-sync',
      executionId: 'exec-sync',
    });
    workflowLogger.logInfo('sync event');
    await workflowLogger.flushEvents();

    const logsRepository = (service as any).logsRepository as jest.Mocked<LogsRepository>;
    expect(logsRepository.createLogs).not.toHaveBeenCalled();
    expect(drain.enqueue).toHaveBeenCalledTimes(1);
    const enqueuedEvents = drain.enqueue.mock.calls[0][0] as WorkflowLogEvent[];
    expect(enqueuedEvents).toHaveLength(1);
    expect(enqueuedEvents[0].message).toBe('sync event');
  });

  it('propagates the drain to step loggers so per-step flushes also avoid inline ES writes', async () => {
    const drain = makeDrain();
    const service = new WorkflowEventLoggerService(
      {} as DataStreamsStart,
      createLoggerMock(),
      false,
      drain as any
    );
    (service as any).logsRepository = makeLogsRepository();

    const stepLogger = service.createStepLogger(
      'wf-1',
      'exec-1',
      'step-1',
      'Step',
      'ai.prompt',
      'workflow'
    );
    stepLogger.logInfo('step event');
    await stepLogger.flushEvents();

    const logsRepository = (service as any).logsRepository as jest.Mocked<LogsRepository>;
    expect(logsRepository.createLogs).not.toHaveBeenCalled();
    expect(drain.enqueue).toHaveBeenCalledTimes(1);
  });
});
