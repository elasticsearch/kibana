/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { EsWorkflowExecution } from '@kbn/workflows';
import {
  ExecutionStatus,
  NonTerminalExecutionStatuses,
  TerminalExecutionStatuses,
} from '@kbn/workflows';
import { WorkflowExecutionNotFoundError } from '@kbn/workflows/common/errors';

import { cancelWorkflow } from './cancel_workflow';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import type { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

const buildExecution = (overrides: Partial<EsWorkflowExecution> = {}): EsWorkflowExecution =>
  ({
    id: 'exec-1',
    spaceId: 'default',
    status: ExecutionStatus.RUNNING,
    ...overrides,
  } as EsWorkflowExecution);

const buildRepository = (
  execution: EsWorkflowExecution | null
): jest.Mocked<
  Pick<WorkflowExecutionRepository, 'getWorkflowExecutionById' | 'updateWorkflowExecution'>
> => ({
  getWorkflowExecutionById: jest.fn().mockResolvedValue(execution),
  updateWorkflowExecution: jest.fn().mockResolvedValue(undefined),
});

const buildTaskManager = (): jest.Mocked<Pick<WorkflowTaskManager, 'forceRunIdleTasks'>> => ({
  forceRunIdleTasks: jest.fn().mockResolvedValue(undefined),
});

const buildCancelParams = ({
  workflowExecutionRepository,
  workflowTaskManager,
}: {
  workflowExecutionRepository: ReturnType<typeof buildRepository>;
  workflowTaskManager: ReturnType<typeof buildTaskManager>;
}) => ({
  workflowExecutionId: 'exec-1',
  spaceId: 'default',
  schedulingRequest: { headers: {} } as KibanaRequest,
  workflowExecutionRepository:
    workflowExecutionRepository as unknown as WorkflowExecutionRepository,
  workflowTaskManager: workflowTaskManager as unknown as WorkflowTaskManager,
  taskManager: {
    schedule: jest.fn().mockResolvedValue(undefined),
  } as unknown as TaskManagerStartContract,
  logger: loggingSystemMock.create().get() as Logger,
});

describe('cancelWorkflow', () => {
  const workflowExecutionId = 'exec-1';
  const spaceId = 'default';
  const schedulingRequest = { headers: {} } as KibanaRequest;

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-08-05T20:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('throws WorkflowExecutionNotFoundError when the execution does not exist', async () => {
    const workflowExecutionRepository = buildRepository(null);
    const workflowTaskManager = buildTaskManager();

    await expect(
      cancelWorkflow(buildCancelParams({ workflowExecutionRepository, workflowTaskManager }))
    ).rejects.toBeInstanceOf(WorkflowExecutionNotFoundError);

    expect(workflowExecutionRepository.getWorkflowExecutionById).toHaveBeenCalledWith(
      workflowExecutionId,
      spaceId
    );
    expect(workflowExecutionRepository.updateWorkflowExecution).not.toHaveBeenCalled();
    expect(workflowTaskManager.forceRunIdleTasks).not.toHaveBeenCalled();
  });

  it.each(TerminalExecutionStatuses)(
    'returns silently and writes nothing when the execution is already in terminal status %s',
    async (status) => {
      const workflowExecutionRepository = buildRepository(buildExecution({ status }));
      const workflowTaskManager = buildTaskManager();

      await cancelWorkflow(buildCancelParams({ workflowExecutionRepository, workflowTaskManager }));

      expect(workflowExecutionRepository.updateWorkflowExecution).not.toHaveBeenCalled();
      expect(workflowTaskManager.forceRunIdleTasks).not.toHaveBeenCalled();
    }
  );

  it.each(NonTerminalExecutionStatuses)(
    'sets cancelRequested and triggers forceRunIdleTasks for non-terminal status %s',
    async (status) => {
      const workflowExecutionRepository = buildRepository(buildExecution({ status }));
      const workflowTaskManager = buildTaskManager();

      await cancelWorkflow(buildCancelParams({ workflowExecutionRepository, workflowTaskManager }));

      expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledTimes(1);
      const updateArg = workflowExecutionRepository.updateWorkflowExecution.mock.calls[0][0];

      expect(updateArg).toEqual(
        expect.objectContaining({
          id: workflowExecutionId,
          cancelRequested: true,
          cancellationReason: 'Cancelled by user',
          cancelledAt: '2025-08-05T20:00:00.000Z',
          cancelledBy: 'system',
        })
      );

      // PENDING and QUEUED flip to CANCELLED synchronously; everything else lets the execution
      // loop finalise the status via cancelWorkflowIfRequested.
      if (status === ExecutionStatus.PENDING || status === ExecutionStatus.QUEUED) {
        expect(updateArg.status).toBe(ExecutionStatus.CANCELLED);
      } else {
        expect(updateArg).not.toHaveProperty('status');
      }

      expect(workflowTaskManager.forceRunIdleTasks).toHaveBeenCalledTimes(1);
      expect(workflowTaskManager.forceRunIdleTasks).toHaveBeenCalledWith(workflowExecutionId, {
        spaceId,
        fakeRequest: schedulingRequest,
      });
    }
  );

  it('routes WAITING_FOR_INPUT cancels through the unified path (no synchronous status flip)', async () => {
    const workflowExecutionRepository = buildRepository(
      buildExecution({ status: ExecutionStatus.WAITING_FOR_INPUT })
    );
    const workflowTaskManager = buildTaskManager();

    await cancelWorkflow(buildCancelParams({ workflowExecutionRepository, workflowTaskManager }));

    const updateArg = workflowExecutionRepository.updateWorkflowExecution.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('status');
    expect(updateArg.cancelRequested).toBe(true);

    expect(workflowTaskManager.forceRunIdleTasks).toHaveBeenCalledWith(workflowExecutionId, {
      spaceId,
      fakeRequest: schedulingRequest,
    });
  });

  it('passes through forceRunIdleTasks errors to the caller', async () => {
    const workflowExecutionRepository = buildRepository(
      buildExecution({ status: ExecutionStatus.RUNNING })
    );
    const workflowTaskManager = buildTaskManager();
    workflowTaskManager.forceRunIdleTasks.mockRejectedValueOnce(new Error('TM unavailable'));

    await expect(
      cancelWorkflow(buildCancelParams({ workflowExecutionRepository, workflowTaskManager }))
    ).rejects.toThrow('TM unavailable');

    expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledTimes(1);
  });

  it('forwards an undefined schedulingRequest to forceRunIdleTasks', async () => {
    const workflowExecutionRepository = buildRepository(
      buildExecution({ status: ExecutionStatus.RUNNING })
    );
    const workflowTaskManager = buildTaskManager();

    await cancelWorkflow({
      ...buildCancelParams({ workflowExecutionRepository, workflowTaskManager }),
      schedulingRequest: undefined,
    });

    expect(workflowTaskManager.forceRunIdleTasks).toHaveBeenCalledWith(workflowExecutionId, {
      spaceId,
      fakeRequest: undefined,
    });
  });

  it('drains the concurrency queue when cancelling a queued execution under queue concurrency', async () => {
    const workflowExecutionRepository = {
      ...buildRepository(
        buildExecution({
          status: ExecutionStatus.QUEUED,
          concurrencyGroupKey: 'group-a',
          workflowDefinition: {
            name: 'wf',
            enabled: true,
            version: '1',
            triggers: [],
            steps: [],
            settings: { concurrency: { key: 'group-a', strategy: 'queue', max: 1 } },
          },
        })
      ),
      countExecutionsByConcurrencyGroupAndStatuses: jest.fn().mockResolvedValue(0),
      getOldestQueuedExecutionIdByConcurrencyGroup: jest.fn().mockResolvedValue(null),
    };
    const workflowTaskManager = buildTaskManager();

    await cancelWorkflow(buildCancelParams({ workflowExecutionRepository, workflowTaskManager }));

    expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({ id: workflowExecutionId, status: ExecutionStatus.CANCELLED }),
      { refresh: 'wait_for' }
    );
    expect(
      workflowExecutionRepository.countExecutionsByConcurrencyGroupAndStatuses
    ).toHaveBeenCalled();
  });

  it('does not refresh when cancelling queued execution without schedulingRequest', async () => {
    const workflowExecutionRepository = buildRepository(
      buildExecution({
        status: ExecutionStatus.QUEUED,
        concurrencyGroupKey: 'group-a',
        workflowDefinition: {
          name: 'wf',
          enabled: true,
          version: '1',
          triggers: [],
          steps: [],
          settings: { concurrency: { key: 'group-a', strategy: 'queue', max: 1 } },
        },
      })
    );
    const workflowTaskManager = buildTaskManager();

    await cancelWorkflow({
      ...buildCancelParams({ workflowExecutionRepository, workflowTaskManager }),
      schedulingRequest: undefined,
    });

    expect(workflowExecutionRepository.updateWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({ id: workflowExecutionId, status: ExecutionStatus.CANCELLED }),
      {}
    );
  });
});
