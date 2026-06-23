/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { SerializedConcreteTaskInstance } from '@kbn/task-manager-plugin/server/task';
import { TASK_MANAGER_INDEX } from '@kbn/task-manager-plugin/server/constants';
import { TASK_ID as TELEMETRY_TASK_ID } from '../../../../server/lib/usage/constants';
import type { LatestTaskStateSchema as TelemetryTaskState } from '../../../../server/lib/usage/task_state';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../constants';
import type { TaskManagerService } from './task_manager_service';

/**
 * Test-time accessor for the telemetry task. Drives an immediate run via
 * `runSoon` and reads back the resulting persisted task state.
 */
export interface TelemetryService {
  /**
   * Triggers an immediate run of the telemetry task and waits for that run
   * to complete — i.e. the task returns to `idle` and the persisted `runs`
   * counter has incremented past the value observed before triggering.
   *
   * Snapshotting the `runs` counter before `runSoon` is essential: the
   * telemetry task auto-schedules on plugin start and runs once on its
   * default schedule, so by the time a test executes the task SO already
   * carries a stale state with `runs >= 1` reflecting data from before the
   * test's `beforeAll`. A naive `runs > 0` predicate would resolve against
   * that stale snapshot. Waiting for `runs > snapshot` guarantees the
   * returned state reflects data produced by the current test.
   */
  runAndWaitForState: () => Promise<TelemetryTaskState>;
}

export const getTelemetryService = ({
  log,
  esClient,
  taskManager,
}: {
  log: ScoutLogger;
  esClient: EsClient;
  taskManager: TaskManagerService;
}): TelemetryService => {
  const fetchTask = async (): Promise<SerializedConcreteTaskInstance | undefined> => {
    const taskDoc = await esClient.get<{ task: SerializedConcreteTaskInstance }>({
      id: `task:${TELEMETRY_TASK_ID}`,
      index: TASK_MANAGER_INDEX,
    });
    return taskDoc._source?.task;
  };

  const parseRuns = (task: SerializedConcreteTaskInstance | undefined): number => {
    if (!task?.state) return 0;
    try {
      const parsed = JSON.parse(task.state) as TelemetryTaskState;
      return parsed.runs ?? 0;
    } catch {
      return 0;
    }
  };

  const fetchStateOnceAtLeast = async (minRuns: number): Promise<TelemetryTaskState | null> => {
    const task = await fetchTask();
    if (task?.status !== 'idle' || !task.state) return null;
    const parsed = JSON.parse(task.state) as TelemetryTaskState;
    return (parsed.runs ?? 0) >= minRuns ? parsed : null;
  };

  return {
    runAndWaitForState: () =>
      measurePerformanceAsync(log, 'telemetry.runAndWaitForState', async () => {
        const baselineRuns = parseRuns(await fetchTask());
        const targetRuns = baselineRuns + 1;

        await taskManager.runSoon(TELEMETRY_TASK_ID);

        const fetchFreshState = () => fetchStateOnceAtLeast(targetRuns);

        await expect
          .poll(fetchFreshState, { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] })
          .not.toBeNull();

        const finalState = await fetchFreshState();
        if (finalState === null) {
          throw new Error(
            `Telemetry task state was unexpectedly null after the poll for runs >= ${targetRuns} resolved`
          );
        }
        return finalState;
      }),
  };
};
