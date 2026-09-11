/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type EsWorkflowExecution, ExecutionStatus } from '@kbn/workflows';
import { InMemoryExecutionPersistence } from './execution_persistence';

describe('InMemoryExecutionPersistence', () => {
  const execution = {
    id: 'execution-1',
    spaceId: 'space-1',
    workflowId: 'workflow-1',
    isTestRun: false,
    status: ExecutionStatus.PENDING,
    context: {},
    workflowDefinition: {
      version: '1',
      name: 'Test workflow',
      enabled: true,
      triggers: [],
      steps: [],
    },
    yaml: '',
    scopeStack: [],
    createdAt: '2026-07-21T00:00:00.000Z',
    error: null,
    startedAt: '2026-07-21T00:00:00.000Z',
    finishedAt: '',
    cancelRequested: false,
    duration: 0,
  } satisfies EsWorkflowExecution;

  it('keeps workflow updates process-local', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.updateWorkflowExecution({
      id: execution.id,
      status: ExecutionStatus.RUNNING,
    });

    await expect(
      persistence.getWorkflowExecutionById(execution.id, execution.spaceId)
    ).resolves.toEqual(expect.objectContaining({ status: ExecutionStatus.RUNNING }));
    await expect(
      persistence.getWorkflowExecutionById(execution.id, 'another-space')
    ).resolves.toBeNull();
  });

  it('returns a defensive copy from getWorkflowExecutionById', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    const result = await persistence.getWorkflowExecutionById(execution.id, execution.spaceId);
    result!.status = ExecutionStatus.RUNNING;

    await expect(
      persistence.getWorkflowExecutionById(execution.id, execution.spaceId)
    ).resolves.toEqual(expect.objectContaining({ status: ExecutionStatus.PENDING }));
  });

  it('deep-isolates nested fields returned from getWorkflowExecutionById', async () => {
    const persistence = new InMemoryExecutionPersistence({
      ...execution,
      context: { key: 'original' },
      scopeStack: [{ stepId: 'root', nestedScopes: [] }],
    });
    const result = await persistence.getWorkflowExecutionById(execution.id, execution.spaceId);
    (result!.context as Record<string, unknown>).key = 'mutated';
    result!.scopeStack.push({ stepId: 'injected', nestedScopes: [] });

    const fresh = await persistence.getWorkflowExecutionById(execution.id, execution.spaceId);
    expect(fresh!.context).toEqual({ key: 'original' });
    expect(fresh!.scopeStack).toHaveLength(1);
  });

  it('throws a descriptive error when workflow execution state contains a non-cloneable value', async () => {
    const persistence = new InMemoryExecutionPersistence({
      ...execution,
      context: { fn: () => {} } as any,
    });
    await expect(
      persistence.getWorkflowExecutionById(execution.id, execution.spaceId)
    ).rejects.toThrow(/Failed to clone workflow execution execution-1.*non-serializable/);
  });

  it('does not overwrite identity fields via updateWorkflowExecution', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.updateWorkflowExecution({
      id: 'hijacked-id',
      spaceId: 'hijacked-space',
      status: ExecutionStatus.RUNNING,
    });

    await expect(
      persistence.getWorkflowExecutionById(execution.id, execution.spaceId)
    ).resolves.toEqual(
      expect.objectContaining({
        id: execution.id,
        spaceId: execution.spaceId,
        status: ExecutionStatus.RUNNING,
      })
    );
  });

  it('does not share state between execution-scoped instances', async () => {
    const first = new InMemoryExecutionPersistence(execution);
    const secondExecution = { ...execution, id: 'execution-2' };
    const second = new InMemoryExecutionPersistence(secondExecution);

    await first.updateWorkflowExecution({ status: ExecutionStatus.RUNNING });

    await expect(
      second.getWorkflowExecutionById(secondExecution.id, secondExecution.spaceId)
    ).resolves.toEqual(expect.objectContaining({ status: ExecutionStatus.PENDING }));
  });

  it('deep-isolates nested fields returned from getStepExecutionsByIds', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.bulkUpsert([
      {
        id: 'step-deep',
        spaceId: 'space-1',
        stepId: 'step-deep',
        scopeStack: [{ stepId: 'root', nestedScopes: [] }],
        workflowRunId: execution.id,
        workflowId: execution.workflowId,
        status: ExecutionStatus.RUNNING,
        startedAt: '2026-07-21T00:00:00.000Z',
        topologicalIndex: 0,
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
      },
    ]);
    const [result] = await persistence.getStepExecutionsByIds(['step-deep']);
    result.scopeStack.push({ stepId: 'injected', nestedScopes: [] });

    const [fresh] = await persistence.getStepExecutionsByIds(['step-deep']);
    expect(fresh.scopeStack).toHaveLength(1);
  });

  it('throws a descriptive error when step execution state contains a non-cloneable value', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.bulkUpsert([
      {
        id: 'step-err',
        spaceId: 'space-1',
        stepId: 'step-err',
        scopeStack: [],
        workflowRunId: execution.id,
        workflowId: execution.workflowId,

        status: (() => {}) as any,
        startedAt: '2026-07-21T00:00:00.000Z',
        topologicalIndex: 0,
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
      },
    ]);
    await expect(persistence.getStepExecutionsByIds(['step-err'])).rejects.toThrow(
      /Failed to clone step execution step-err.*non-serializable/
    );
  });

  it('returns a defensive copy from getStepExecutionsByIds', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.bulkUpsert([
      {
        id: 'step-copy',
        spaceId: 'space-1',
        stepId: 'step-copy',
        scopeStack: [],
        workflowRunId: execution.id,
        workflowId: execution.workflowId,
        status: ExecutionStatus.RUNNING,
        startedAt: '2026-07-21T00:00:00.000Z',
        topologicalIndex: 0,
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
      },
    ]);
    const [result] = await persistence.getStepExecutionsByIds(['step-copy']);
    result.status = ExecutionStatus.COMPLETED;

    await expect(persistence.getStepExecutionsByIds(['step-copy'])).resolves.toEqual([
      expect.objectContaining({ status: ExecutionStatus.RUNNING }),
    ]);
  });

  it('applies sourceIncludes projection to step executions', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.bulkUpsert([
      {
        id: 'step-proj',
        spaceId: 'space-1',
        stepId: 'step-proj',
        scopeStack: [],
        workflowRunId: execution.id,
        workflowId: execution.workflowId,
        status: ExecutionStatus.RUNNING,
        startedAt: '2026-07-21T00:00:00.000Z',
        topologicalIndex: 0,
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
      },
    ]);
    const [result] = await persistence.getStepExecutionsByIds(['step-proj'], ['id', 'status']);
    expect(result).toEqual({ id: 'step-proj', status: ExecutionStatus.RUNNING });
  });

  it('applies sourceExcludes projection to step executions', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.bulkUpsert([
      {
        id: 'step-excl',
        spaceId: 'space-1',
        stepId: 'step-excl',
        scopeStack: [],
        workflowRunId: execution.id,
        workflowId: execution.workflowId,
        status: ExecutionStatus.RUNNING,
        startedAt: '2026-07-21T00:00:00.000Z',
        topologicalIndex: 0,
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
      },
    ]);
    const [result] = await persistence.getStepExecutionsByIds(['step-excl'], undefined, ['status']);
    expect(result).not.toHaveProperty('status');
    expect(result).toHaveProperty('id', 'step-excl');
  });

  it('merges step lifecycle and IO updates without an external repository', async () => {
    const persistence = new InMemoryExecutionPersistence(execution);
    await persistence.bulkUpsert([
      {
        id: 'step-1',
        spaceId: 'space-1',
        stepId: 'step-1',
        scopeStack: [],
        workflowRunId: execution.id,
        workflowId: execution.workflowId,
        status: ExecutionStatus.RUNNING,
        startedAt: '2026-07-21T00:00:00.000Z',
        topologicalIndex: 0,
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
      },
      { id: 'step-1', output: { content: 'result' } },
    ]);

    await expect(persistence.getStepExecutionsByIds(['step-1'])).resolves.toEqual([
      expect.objectContaining({
        id: 'step-1',
        status: ExecutionStatus.RUNNING,
        output: { content: 'result' },
      }),
    ]);
  });
});
