/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createUiamProvisioningTaskRunner,
  type UiamProvisioningRunTaskOutcome,
} from './create_uiam_provisioning_task_runner';
import { failedProvisioningRunTelemetry } from './build_provisioning_run_telemetry';
import { TASK_TYPE } from '../constants';
import { emptyState } from '../task_state';
import { TaskStatus } from '../../task';
import type { CoreSetup } from '@kbn/core/server';
import type { TaskManagerPluginsStart, TaskManagerStartContract } from '../../plugin';
import { TASK_MANAGER_UIAM_PROVISIONING_RUN_EVENT } from '../event_based_telemetry';

const makeTaskInstance = () => {
  const now = new Date();
  return {
    id: 'run-1',
    taskType: TASK_TYPE,
    params: {},
    state: { ...emptyState },
    scheduledAt: now,
    runAt: now,
    startedAt: now,
    attempts: 0,
    status: TaskStatus.Running,
    retryAt: null,
  };
};

describe('createUiamProvisioningTaskRunner', () => {
  it('returns state and runAt and strips telemetry; reports event with telemetry', async () => {
    const runTask = jest.fn(
      async (): Promise<UiamProvisioningRunTaskOutcome> => ({
        state: { runs: 3 },
        runAt: new Date('2026-01-01T00:00:00.000Z'),
        telemetry: {
          total: 1,
          completed: 1,
          failed: 0,
          skipped: 0,
          has_error: false,
          has_more_to_provision: false,
          run_number: 3,
        },
      })
    );
    const reportProvisioningRunEvent = jest.fn();
    const runnerFactory = createUiamProvisioningTaskRunner(
      {} as CoreSetup<TaskManagerPluginsStart, TaskManagerStartContract>,
      { runTask, reportProvisioningRunEvent }
    );
    const { run } = runnerFactory({ taskInstance: makeTaskInstance() as never });
    const out = await run();

    expect(out).toEqual({
      state: { runs: 3 },
      runAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(reportProvisioningRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({ completed: 1, run_number: 3 })
    );
    expect(runTask).toHaveBeenCalled();
  });

  it('on runTask throw: reports failed telemetry, then rethrows', async () => {
    const err = new Error('boom');
    const runTask = jest.fn().mockRejectedValue(err);
    const reportProvisioningRunEvent = jest.fn();
    const runnerFactory = createUiamProvisioningTaskRunner(
      {} as CoreSetup<TaskManagerPluginsStart, TaskManagerStartContract>,
      { runTask, reportProvisioningRunEvent }
    );
    const { run } = runnerFactory({ taskInstance: makeTaskInstance() as never });

    await expect(run()).rejects.toBe(err);
    expect(reportProvisioningRunEvent).toHaveBeenCalledWith(failedProvisioningRunTelemetry());
  });

  it('uses a stable analytics eventType string', () => {
    expect(TASK_MANAGER_UIAM_PROVISIONING_RUN_EVENT.eventType).toBe(
      'task_manager_uiam_api_key_provisioning_run'
    );
  });
});
