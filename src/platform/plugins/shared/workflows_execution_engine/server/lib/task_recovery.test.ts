/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { EsWorkflowExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';

import {
  buildTaskAttemptsExhaustedMessage,
  resolveExhaustedWorkflowRunTask,
  resolveInterruptedWorkflowResumeTask,
  resolveInterruptedWorkflowRunTask,
  shouldFailOnWorkflowRunRetry,
  TASK_RECOVERY_ERROR_TYPE,
  taskRecoveryMessages,
} from './task_recovery';
import { StepExecutionRepository } from '../repositories/step_execution_repository';
import { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';

function createElasticsearchNotFoundError(): Error {
  const err = new Error('Not Found');
  (err as { meta?: { statusCode?: number } }).meta = { statusCode: 404 };
  return err;
}

describe('shouldFailOnWorkflowRunRetry', () => {
  const base = (status: ExecutionStatus): EsWorkflowExecution =>
    ({
      id: 'e1',
      spaceId: 'default',
      workflowId: 'w1',
      status,
    } as EsWorkflowExecution);

  it('returns false when terminal', () => {
    expect(shouldFailOnWorkflowRunRetry(base(ExecutionStatus.FAILED))).toBe(false);
    expect(shouldFailOnWorkflowRunRetry(base(ExecutionStatus.COMPLETED))).toBe(false);
  });

  it('returns false for waiting_for_input', () => {
    expect(shouldFailOnWorkflowRunRetry(base(ExecutionStatus.WAITING_FOR_INPUT))).toBe(false);
  });

  it('returns false for queued concurrency backlog', () => {
    expect(shouldFailOnWorkflowRunRetry(base(ExecutionStatus.QUEUED))).toBe(false);
  });

  it('returns true for running', () => {
    expect(shouldFailOnWorkflowRunRetry(base(ExecutionStatus.RUNNING))).toBe(true);
  });

  it('returns true for other non-terminal in-progress statuses (e.g. pending, waiting)', () => {
    expect(shouldFailOnWorkflowRunRetry(base(ExecutionStatus.PENDING))).toBe(true);
    expect(shouldFailOnWorkflowRunRetry(base(ExecutionStatus.WAITING))).toBe(true);
  });
});

describe('resolveInterruptedWorkflowRunTask', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let repository: WorkflowExecutionRepository;
  let stepExecutionRepository: StepExecutionRepository;
  const logger = loggingSystemMock.create().get();

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    repository = new WorkflowExecutionRepository(esClient);
    stepExecutionRepository = new StepExecutionRepository(esClient);
    jest.spyOn(stepExecutionRepository, 'markNonTerminalStepsFailed').mockResolvedValue(undefined);
  });

  it('returns run_workflow when attempts is 1', async () => {
    await expect(
      resolveInterruptedWorkflowRunTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 1,
        logger,
      })
    ).resolves.toBe('run_workflow');
    expect(esClient.get).not.toHaveBeenCalled();
  });

  it('marks failed and completes task when retrying a running execution', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.RUNNING,
      },
    } as any);
    esClient.update.mockResolvedValue({} as any);

    await expect(
      resolveInterruptedWorkflowRunTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('task_complete');

    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'x',
        doc: expect.objectContaining({
          status: ExecutionStatus.FAILED,
          finishedAt: expect.any(String),
          error: {
            type: TASK_RECOVERY_ERROR_TYPE,
            message: taskRecoveryMessages.workflowRunInterrupted,
          },
        }),
      })
    );
  });

  it('returns run_workflow when execution is missing on retry and logs a warning', async () => {
    esClient.get.mockRejectedValueOnce(createElasticsearchNotFoundError());
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    await expect(
      resolveInterruptedWorkflowRunTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'missing-id',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('run_workflow');

    expect(esClient.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no execution document for missing-id')
    );
    warnSpy.mockRestore();
  });

  it('returns task_complete without update when execution is terminal on retry', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.FAILED,
      },
    } as any);

    await expect(
      resolveInterruptedWorkflowRunTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('task_complete');

    expect(esClient.update).not.toHaveBeenCalled();
  });

  it('returns task_complete without update when execution is waiting_for_input on retry', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.WAITING_FOR_INPUT,
      },
    } as any);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    await expect(
      resolveInterruptedWorkflowRunTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('task_complete');

    expect(esClient.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('waiting_for_input'));
    warnSpy.mockRestore();
  });

  it('marks failed when retrying a pending execution (stuck before run advances state)', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.PENDING,
      },
    } as any);
    esClient.update.mockResolvedValue({} as any);

    await expect(
      resolveInterruptedWorkflowRunTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('task_complete');

    expect(esClient.update).toHaveBeenCalled();
  });
});

describe('resolveInterruptedWorkflowResumeTask', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let repository: WorkflowExecutionRepository;
  let stepExecutionRepository: StepExecutionRepository;
  const logger = loggingSystemMock.create().get();

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    repository = new WorkflowExecutionRepository(esClient);
    stepExecutionRepository = new StepExecutionRepository(esClient);
    jest.spyOn(stepExecutionRepository, 'markNonTerminalStepsFailed').mockResolvedValue(undefined);
  });

  it('returns resume_workflow when attempts is 1', async () => {
    await expect(
      resolveInterruptedWorkflowResumeTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 1,
        logger,
      })
    ).resolves.toBe('resume_workflow');
    expect(esClient.get).not.toHaveBeenCalled();
  });

  it('marks failed and completes task when retrying a running execution', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.RUNNING,
      },
    } as any);
    esClient.update.mockResolvedValue({} as any);

    await expect(
      resolveInterruptedWorkflowResumeTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('task_complete');

    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'x',
        doc: expect.objectContaining({
          status: ExecutionStatus.FAILED,
          error: {
            type: TASK_RECOVERY_ERROR_TYPE,
            message: taskRecoveryMessages.workflowResumeInterrupted,
          },
        }),
      })
    );
  });

  it('returns resume_workflow when execution is missing on retry and logs a warning', async () => {
    esClient.get.mockRejectedValueOnce(createElasticsearchNotFoundError());
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    await expect(
      resolveInterruptedWorkflowResumeTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'missing-id',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('resume_workflow');

    expect(esClient.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no execution document for missing-id')
    );
    warnSpy.mockRestore();
  });

  it('returns resume_workflow when still waiting_for_input so handler can retry', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.WAITING_FOR_INPUT,
      },
    } as any);

    await expect(
      resolveInterruptedWorkflowResumeTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('resume_workflow');

    expect(esClient.update).not.toHaveBeenCalled();
  });

  it('returns task_complete when execution is already terminal', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.COMPLETED,
      },
    } as any);

    await expect(
      resolveInterruptedWorkflowResumeTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('task_complete');

    expect(esClient.update).not.toHaveBeenCalled();
  });

  it('returns task_complete without update when execution is failed (terminal)', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'x',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.FAILED,
      },
    } as any);

    await expect(
      resolveInterruptedWorkflowResumeTask({
        workflowExecutionRepository: repository,
        stepExecutionRepository,
        workflowRunId: 'x',
        spaceId: 'default',
        taskAttempts: 2,
        logger,
      })
    ).resolves.toBe('task_complete');

    expect(esClient.update).not.toHaveBeenCalled();
  });
});

describe('resolveExhaustedWorkflowRunTask', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let repository: WorkflowExecutionRepository;
  let stepExecutionRepository: StepExecutionRepository;
  const logger = loggingSystemMock.create().get();

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    repository = new WorkflowExecutionRepository(esClient);
    stepExecutionRepository = new StepExecutionRepository(esClient);
    jest.spyOn(stepExecutionRepository, 'markNonTerminalStepsFailed').mockResolvedValue(undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing when taskAttempts is below maxAttempts', async () => {
    await resolveExhaustedWorkflowRunTask({
      workflowExecutionRepository: repository,
      stepExecutionRepository,
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskAttempts: 2,
      maxAttempts: 3,
      error: new Error('ignored'),
      logger,
    });

    expect(esClient.get).not.toHaveBeenCalled();
    expect(esClient.update).not.toHaveBeenCalled();
  });

  it('marks FAILED with TaskAttemptsExhaustedError on last attempt when execution is non-terminal', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'run-1',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.RUNNING,
      },
    } as any);
    esClient.update.mockResolvedValue({} as any);

    const thrown = new Error('handler blew up');

    await resolveExhaustedWorkflowRunTask({
      workflowExecutionRepository: repository,
      stepExecutionRepository,
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskAttempts: 3,
      maxAttempts: 3,
      error: thrown,
      logger,
    });

    expect(esClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-1',
        doc: expect.objectContaining({
          status: ExecutionStatus.FAILED,
          error: {
            type: 'TaskAttemptsExhaustedError',
            message: buildTaskAttemptsExhaustedMessage(thrown.message),
          },
        }),
      })
    );
  });

  it('does not update when execution is already terminal on last attempt', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'run-1',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.COMPLETED,
      },
    } as any);

    await resolveExhaustedWorkflowRunTask({
      workflowExecutionRepository: repository,
      stepExecutionRepository,
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskAttempts: 3,
      maxAttempts: 3,
      error: new Error('handler blew up'),
      logger,
    });

    expect(esClient.update).not.toHaveBeenCalled();
  });

  it('does not update when execution document is missing on last attempt', async () => {
    esClient.get.mockRejectedValueOnce(createElasticsearchNotFoundError());

    await resolveExhaustedWorkflowRunTask({
      workflowExecutionRepository: repository,
      stepExecutionRepository,
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskAttempts: 3,
      maxAttempts: 3,
      error: new Error('handler blew up'),
      logger,
    });

    expect(esClient.update).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs error when getWorkflowExecutionById fails with a non-404 error on last attempt', async () => {
    const serverError = new Error('Internal Server Error');
    (serverError as { meta?: { statusCode?: number } }).meta = { statusCode: 500 };
    esClient.get.mockRejectedValueOnce(serverError);

    await resolveExhaustedWorkflowRunTask({
      workflowExecutionRepository: repository,
      stepExecutionRepository,
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskAttempts: 3,
      maxAttempts: 3,
      error: new Error('handler blew up'),
      logger,
    });

    expect(esClient.update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark workflow execution run-1 as FAILED')
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Internal Server Error'));
  });

  it('logs error when marking FAILED throws on last attempt', async () => {
    esClient.get.mockResolvedValue({
      _source: {
        id: 'run-1',
        spaceId: 'default',
        workflowId: 'w',
        status: ExecutionStatus.RUNNING,
      },
    } as any);
    esClient.update.mockRejectedValueOnce(new Error('update rejected'));

    await resolveExhaustedWorkflowRunTask({
      workflowExecutionRepository: repository,
      stepExecutionRepository,
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskAttempts: 3,
      maxAttempts: 3,
      error: new Error('handler blew up'),
      logger,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark workflow execution run-1 as FAILED')
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('update rejected'));
  });
});
