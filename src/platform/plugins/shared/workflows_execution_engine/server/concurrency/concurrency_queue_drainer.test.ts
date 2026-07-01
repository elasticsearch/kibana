/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { ExecutionStatus } from '@kbn/workflows';
import {
  drainConcurrencyQueueSlots,
  maybeDrainConcurrencyQueueAfterTerminal,
} from './concurrency_queue_drainer';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';

describe('drainConcurrencyQueueSlots', () => {
  const scheduleMock = jest.fn().mockResolvedValue(undefined);
  const baseParams = {
    taskManager: { schedule: scheduleMock } as unknown as TaskManagerStartContract,
    logger: { debug: jest.fn(), warn: jest.fn() } as unknown as Logger,
    spaceId: 'default',
    concurrencyGroupKey: 'g1',
    concurrencySettings: { key: 'g1', strategy: 'queue' as const, max: 1 },
    request: {} as unknown as KibanaRequest,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules at most one promotion per drain when max is 1 and slot count reflects the new pending doc', async () => {
    const countMock = jest.fn().mockResolvedValueOnce(0).mockResolvedValue(1);
    const workflowExecutionRepository = {
      countExecutionsByConcurrencyGroupAndStatuses: countMock,
      getOldestQueuedExecutionIdByConcurrencyGroup: jest.fn().mockResolvedValue('exec-queued-1'),
      tryCasPromoteQueuedWorkflowExecutionToPending: jest.fn().mockResolvedValue(true),
      getWorkflowExecutionById: jest.fn().mockResolvedValue({
        id: 'exec-queued-1',
        spaceId: 'default',
        triggeredBy: 'manual',
        status: ExecutionStatus.PENDING,
      }),
      updateWorkflowExecution: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowExecutionRepository;

    await drainConcurrencyQueueSlots({
      ...baseParams,
      workflowExecutionRepository,
    });

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(countMock).toHaveBeenCalledTimes(2);
  });

  it('promotes twice in one drain when max is 2 and slot count stays below max', async () => {
    const countMock = jest
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValue(2);
    const oldestMock = jest
      .fn()
      .mockResolvedValueOnce('exec-q1')
      .mockResolvedValueOnce('exec-q2')
      .mockResolvedValue(null);
    const promoteMock = jest.fn().mockResolvedValue(true);
    const getByIdMock = jest.fn().mockImplementation((_id: string) =>
      Promise.resolve({
        id: _id,
        spaceId: 'default',
        triggeredBy: 'manual',
        status: ExecutionStatus.PENDING,
      })
    );

    const workflowExecutionRepository = {
      countExecutionsByConcurrencyGroupAndStatuses: countMock,
      getOldestQueuedExecutionIdByConcurrencyGroup: oldestMock,
      tryCasPromoteQueuedWorkflowExecutionToPending: promoteMock,
      getWorkflowExecutionById: getByIdMock,
      updateWorkflowExecution: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowExecutionRepository;

    await drainConcurrencyQueueSlots({
      ...baseParams,
      workflowExecutionRepository,
      concurrencySettings: { key: 'g1', strategy: 'queue', max: 2 },
    });

    expect(scheduleMock).toHaveBeenCalledTimes(2);
  });

  it('marks corrupt promoted docs as skipped and continues draining', async () => {
    const countMock = jest
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValue(1);
    const oldestMock = jest
      .fn()
      .mockResolvedValueOnce('exec-corrupt')
      .mockResolvedValueOnce('exec-valid')
      .mockResolvedValue(null);
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const getByIdMock = jest
      .fn()
      .mockResolvedValueOnce({
        status: ExecutionStatus.PENDING,
        spaceId: undefined,
      })
      .mockResolvedValueOnce({
        id: 'exec-valid',
        spaceId: 'default',
        triggeredBy: 'manual',
        status: ExecutionStatus.PENDING,
      });

    const workflowExecutionRepository = {
      countExecutionsByConcurrencyGroupAndStatuses: countMock,
      getOldestQueuedExecutionIdByConcurrencyGroup: oldestMock,
      tryCasPromoteQueuedWorkflowExecutionToPending: jest.fn().mockResolvedValue(true),
      getWorkflowExecutionById: getByIdMock,
      updateWorkflowExecution: updateMock,
    } as unknown as WorkflowExecutionRepository;

    await drainConcurrencyQueueSlots({
      ...baseParams,
      workflowExecutionRepository,
      concurrencySettings: { key: 'g1', strategy: 'queue', max: 2 },
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'exec-corrupt',
        status: ExecutionStatus.SKIPPED,
        cancellationReason: expect.stringContaining('missing id or spaceId'),
      }),
      { refresh: 'wait_for' }
    );
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workflow:exec-valid:manual' }),
      expect.any(Object)
    );
  });

  it('defaults missing triggeredBy to manual when scheduling', async () => {
    const countMock = jest.fn().mockResolvedValueOnce(0).mockResolvedValue(1);
    const workflowExecutionRepository = {
      countExecutionsByConcurrencyGroupAndStatuses: countMock,
      getOldestQueuedExecutionIdByConcurrencyGroup: jest.fn().mockResolvedValue('exec-queued-1'),
      tryCasPromoteQueuedWorkflowExecutionToPending: jest.fn().mockResolvedValue(true),
      getWorkflowExecutionById: jest.fn().mockResolvedValue({
        id: 'exec-queued-1',
        spaceId: 'default',
        triggeredBy: undefined,
        status: ExecutionStatus.PENDING,
      }),
      updateWorkflowExecution: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowExecutionRepository;

    await drainConcurrencyQueueSlots({
      ...baseParams,
      workflowExecutionRepository,
    });

    expect(scheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workflow:exec-queued-1:manual' }),
      expect.any(Object)
    );
  });
});

describe('maybeDrainConcurrencyQueueAfterTerminal', () => {
  const scheduleMock = jest.fn().mockResolvedValue(undefined);
  const debugMock = jest.fn();
  const baseParams = {
    taskManager: { schedule: scheduleMock } as unknown as TaskManagerStartContract,
    logger: { debug: debugMock, warn: jest.fn() } as unknown as Logger,
    workflowRunId: 'exec-finished',
    spaceId: 'default',
    fakeRequest: {} as unknown as KibanaRequest,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drains when the execution is terminal under queue concurrency', async () => {
    const getByIdMock = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'exec-finished',
        spaceId: 'default',
        status: ExecutionStatus.FAILED,
        concurrencyGroupKey: 'g1',
        workflowDefinition: {
          name: 'wf',
          enabled: true,
          version: '1',
          triggers: [],
          steps: [],
          settings: { concurrency: { key: 'g1', strategy: 'queue', max: 1 } },
        },
      })
      .mockResolvedValueOnce({
        id: 'exec-q1',
        spaceId: 'default',
        triggeredBy: 'manual',
        status: ExecutionStatus.PENDING,
      });
    const workflowExecutionRepository = {
      getWorkflowExecutionById: getByIdMock,
      countExecutionsByConcurrencyGroupAndStatuses: jest
        .fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValue(1),
      getOldestQueuedExecutionIdByConcurrencyGroup: jest.fn().mockResolvedValue('exec-q1'),
      tryCasPromoteQueuedWorkflowExecutionToPending: jest.fn().mockResolvedValue(true),
      updateWorkflowExecution: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowExecutionRepository;

    await maybeDrainConcurrencyQueueAfterTerminal({
      ...baseParams,
      workflowExecutionRepository,
    });

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(debugMock).toHaveBeenCalledWith(
      'Promoted queued execution exec-q1 to pending and scheduled workflow:run (group g1)'
    );
  });

  it('does not drain when the execution is not terminal', async () => {
    const workflowExecutionRepository = {
      getWorkflowExecutionById: jest.fn().mockResolvedValue({
        id: 'exec-finished',
        status: ExecutionStatus.QUEUED,
        concurrencyGroupKey: 'g1',
        workflowDefinition: {
          settings: { concurrency: { key: 'g1', strategy: 'queue', max: 1 } },
        },
      }),
    } as unknown as WorkflowExecutionRepository;

    await maybeDrainConcurrencyQueueAfterTerminal({
      ...baseParams,
      workflowExecutionRepository,
    });

    expect(scheduleMock).not.toHaveBeenCalled();
    expect(debugMock).not.toHaveBeenCalled();
  });

  it('does not drain when concurrency strategy is not queue', async () => {
    const workflowExecutionRepository = {
      getWorkflowExecutionById: jest.fn().mockResolvedValue({
        id: 'exec-finished',
        status: ExecutionStatus.FAILED,
        concurrencyGroupKey: 'g1',
        workflowDefinition: {
          settings: { concurrency: { key: 'g1', strategy: 'drop', max: 1 } },
        },
      }),
    } as unknown as WorkflowExecutionRepository;

    await maybeDrainConcurrencyQueueAfterTerminal({
      ...baseParams,
      workflowExecutionRepository,
    });

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('logs debug and swallows drain errors', async () => {
    const workflowExecutionRepository = {
      getWorkflowExecutionById: jest.fn().mockResolvedValue({
        id: 'exec-finished',
        status: ExecutionStatus.FAILED,
        concurrencyGroupKey: 'g1',
        workflowDefinition: {
          settings: { concurrency: { key: 'g1', strategy: 'queue', max: 1 } },
        },
      }),
      countExecutionsByConcurrencyGroupAndStatuses: jest
        .fn()
        .mockRejectedValue(new Error('ES unavailable')),
    } as unknown as WorkflowExecutionRepository;

    await maybeDrainConcurrencyQueueAfterTerminal({
      ...baseParams,
      workflowExecutionRepository,
    });

    expect(debugMock).toHaveBeenCalledWith(
      'maybeDrainConcurrencyQueueAfterTerminal: drain failed for execution exec-finished: ES unavailable'
    );
  });
});
