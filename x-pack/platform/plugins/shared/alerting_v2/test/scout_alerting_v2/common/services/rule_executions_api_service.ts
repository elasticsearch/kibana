/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { ALERTING_RULE_EXECUTOR_TASK_TYPE } from '../../../../server/lib/rule_executor/constants';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../constants';
import { countTaskRuns } from './task_event_log';

const TASK_MANAGER_INDEX = '.kibana_task_manager';
const DEFAULT_SPACE_ID = 'default';

/**
 * Task manager task statuses that mean the task is currently being executed
 * (or about to be executed).
 */
const RUNNING_TASK_STATUSES = ['claiming', 'running'];

interface WaitForRunsParams {
  ruleId: string;
  /** Minimum number of `task-run` events that must be observed since `since`. */
  runs: number;
  /**
   * Lower bound (inclusive) for `event.start` of matching events. Defaults to
   * the time the call was made, i.e. "wait for `runs` more ticks from now".
   */
  since?: Date;
  spaceId?: string;
}

interface WaitForTaskDrainedParams {
  ruleId: string;
  spaceId?: string;
}

interface WaitForExecutorIdleParams {
  ruleId: string;
  spaceId?: string;
}

/**
 * Test-time accessor for the per-rule alerting_v2 rule executor task. Used to
 * wait for deterministic conditions instead of sleeping by wall-clock time:
 *
 *   - `waitForRuns` — polls `.kibana-event-log*` for `task-run` events the
 *     executor task produces.
 *   - `waitForTaskDrained` — polls `.kibana_task_manager` until the executor
 *     task is no longer in `claiming`/`running` status (or until the document
 *     is gone, e.g. after rule delete).
 *   - `waitForExecutorIdle` — polls `.kibana_task_manager` until the executor
 *     task has finished its initial run and is scheduled ahead (`idle` with a
 *     future `runAt`), so an operation that only touches `idle` tasks (e.g. API
 *     key rotation) can act on it deterministically.
 *
 * The underlying `kibana.task.id` construction (`taskType:spaceId:ruleId`) is
 * an implementation detail; tests pass `ruleId` (and optionally `spaceId`).
 */
export interface RuleExecutionsApiService {
  waitForRuns: (params: WaitForRunsParams) => Promise<void>;
  waitForTaskDrained: (params: WaitForTaskDrainedParams) => Promise<void>;
  waitForExecutorIdle: (params: WaitForExecutorIdleParams) => Promise<void>;
}

const buildExecutorTaskId = (ruleId: string, spaceId: string): string =>
  `${ALERTING_RULE_EXECUTOR_TASK_TYPE}:${spaceId}:${ruleId}`;

export const getRuleExecutionsApiService = ({
  log,
  esClient,
}: {
  log: ScoutLogger;
  esClient: EsClient;
}): RuleExecutionsApiService => {
  /**
   * Returns `true` when the executor task is not currently being executed:
   * either the task document is absent (after delete), or its `task.status`
   * is not in `claiming`/`running`.
   */
  const isExecutorTaskDrained = async (taskId: string): Promise<boolean> => {
    const result = await esClient.search<{ task: { status: string } }>({
      index: TASK_MANAGER_INDEX,
      query: { term: { _id: `task:${taskId}` } },
      size: 1,
      _source: ['task.status'],
    });

    const hit = result.hits.hits[0];
    if (!hit) return true;

    const status = hit._source?.task?.status;
    return !status || !RUNNING_TASK_STATUSES.includes(status);
  };

  /**
   * Returns `true` once the executor task has completed its initial run and is
   * waiting for the next one: `task.status` is `idle` and `task.runAt` is in
   * the future. A freshly scheduled task runs immediately regardless of its
   * interval, so it starts out `idle` with a `runAt` in the past — only after
   * the first run settles does `runAt` move ahead.
   */
  const isExecutorTaskIdleAhead = async (taskId: string): Promise<boolean> => {
    const result = await esClient.search<{ task: { status: string; runAt: string } }>({
      index: TASK_MANAGER_INDEX,
      query: { term: { _id: `task:${taskId}` } },
      size: 1,
      _source: ['task.status', 'task.runAt'],
    });

    const task = result.hits.hits[0]?._source?.task;
    if (!task) return false;

    return task.status === 'idle' && Date.parse(task.runAt) > Date.now();
  };

  return {
    waitForRuns: ({ ruleId, runs, since, spaceId = DEFAULT_SPACE_ID }) =>
      measurePerformanceAsync(log, 'ruleExecutions.waitForRuns', async () => {
        const taskId = buildExecutorTaskId(ruleId, spaceId);
        const sinceMs = (since ?? new Date()).getTime();

        await expect
          .poll(() => countTaskRuns({ esClient, taskId, sinceMs }), {
            timeout: POLL_TIMEOUT_MS,
            intervals: [POLL_INTERVAL_MS],
          })
          .toBeGreaterThanOrEqual(runs);
      }),

    waitForTaskDrained: ({ ruleId, spaceId = DEFAULT_SPACE_ID }) =>
      measurePerformanceAsync(log, 'ruleExecutions.waitForTaskDrained', async () => {
        const taskId = buildExecutorTaskId(ruleId, spaceId);

        await expect
          .poll(() => isExecutorTaskDrained(taskId), {
            timeout: POLL_TIMEOUT_MS,
            intervals: [POLL_INTERVAL_MS],
          })
          .toBe(true);
      }),

    waitForExecutorIdle: ({ ruleId, spaceId = DEFAULT_SPACE_ID }) =>
      measurePerformanceAsync(log, 'ruleExecutions.waitForExecutorIdle', async () => {
        const taskId = buildExecutorTaskId(ruleId, spaceId);

        await expect
          .poll(() => isExecutorTaskIdleAhead(taskId), {
            timeout: POLL_TIMEOUT_MS,
            intervals: [POLL_INTERVAL_MS],
          })
          .toBe(true);
      }),
  };
};
