/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { ApiClientFixture, CookieHeader } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest } from '../fixtures';
import {
  COMMON_HEADERS,
  NO_CLAIM_OBSERVATION_MS,
  NUDGE_CLAIM_BUDGET_MS,
  ONE_HOUR_MS,
  RESCHEDULE_EVIDENCE_MS,
  TEST_TASK_TYPE,
} from '../fixtures/constants';

apiTest.describe('Task Manager claim nudge', { tag: tags.stateful.classic }, () => {
  const taskIdsToCleanup: string[] = [];

  /** An hour out, so the only thing that can make it run during the test is a claim nudge. */
  const scheduleTaskDueInAnHour = async (
    apiClient: ApiClientFixture,
    cookieHeader: CookieHeader
  ) => {
    const taskId = uuidV4();

    const response = await apiClient.post('internal/task_manager/schedule', {
      headers: { ...COMMON_HEADERS, ...cookieHeader },
      body: {
        task: {
          id: taskId,
          taskType: TEST_TASK_TYPE,
          params: {},
          state: {},
          runAt: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
        },
        skipRequestForScheduling: true,
      },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(200);
    taskIdsToCleanup.push(taskId);

    const { runAt } = response.body as { runAt: string };
    return { taskId, runAt };
  };

  const getTask = (apiClient: ApiClientFixture, cookieHeader: CookieHeader, taskId: string) =>
    apiClient.get(`internal/ftr/task_manager/${taskId}`, {
      headers: { ...COMMON_HEADERS, ...cookieHeader },
      responseType: 'json',
    });

  /**
   * The FTR route reports `runSoon` failures as `{ id, error }` with a 200, so only the body proves
   * the call worked: asserting `forced` is what rules an error response out.
   */
  const runSoon = async (
    apiClient: ApiClientFixture,
    cookieHeader: CookieHeader,
    taskId: string
  ) => {
    const response = await apiClient.post(`internal/ftr/task_manager/${taskId}/run_soon`, {
      headers: { ...COMMON_HEADERS, ...cookieHeader },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(200);
    expect(response.body).toMatchObject({ id: taskId, forced: false });
  };

  /**
   * Whether a claim cycle has picked the task up since `runSoon` reset `runAt` to now. Stops at
   * claiming rather than waiting for the run to finish, which would fold the task's own duration
   * into the budget. A claimed task is no longer `idle`, but may already have finished, in which
   * case it has been deleted or had `runAt` pushed minutes out. `originalRunAt` rules out a
   * `runSoon` that silently did nothing.
   */
  const wasClaimedSince = async (
    apiClient: ApiClientFixture,
    cookieHeader: CookieHeader,
    taskId: string,
    { originalRunAt, runSoonAt }: { originalRunAt: string; runSoonAt: number }
  ) => {
    const response = await getTask(apiClient, cookieHeader, taskId);

    if (response.statusCode === 404) {
      return true;
    }
    if (response.statusCode !== 200) {
      // An error body has no `status`, which would read as "not idle" and pass. Keep polling so
      // a blip is tolerated and a broken route fails on the timeout instead.
      return false;
    }

    const { status, runAt } = response.body as { status: string; runAt: string };
    if (runAt === originalRunAt) {
      return false;
    }

    return status !== 'idle' || new Date(runAt).getTime() > runSoonAt + RESCHEDULE_EVIDENCE_MS;
  };

  /**
   * The first nudge of the Kibana process also creates the signal index, which on a cold cluster
   * can take most of the claim budget on its own. Pay that cost here instead of inside a timed
   * assertion.
   */
  apiTest.beforeAll(async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
    const { taskId } = await scheduleTaskDueInAnHour(apiClient, cookieHeader);
    await runSoon(apiClient, cookieHeader, taskId);
  });

  apiTest.afterAll(async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
    for (const taskId of taskIdsToCleanup) {
      await apiClient
        .delete(`internal/task_manager/tasks/${taskId}`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
        })
        .catch(() => {});
    }
  });

  apiTest(
    'runSoon gets a task claimed well before the next poll cycle would',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      const { taskId, runAt: originalRunAt } = await scheduleTaskDueInAnHour(
        apiClient,
        cookieHeader
      );

      const runSoonAt = Date.now();
      await runSoon(apiClient, cookieHeader, taskId);

      await expect
        .poll(
          () => wasClaimedSince(apiClient, cookieHeader, taskId, { originalRunAt, runSoonAt }),
          {
            timeout: NUDGE_CLAIM_BUDGET_MS,
            intervals: [100],
          }
        )
        .toBe(true);
    }
  );

  apiTest(
    'a task due in an hour is left untouched without a runSoon',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      const { taskId, runAt } = await scheduleTaskDueInAnHour(apiClient, cookieHeader);

      // The negative control for the test above: nothing claims the task within the same window,
      // so meeting the nudge budget there can only be the nudge and not a regular poll cycle.
      await new Promise((resolve) => setTimeout(resolve, NO_CLAIM_OBSERVATION_MS));

      const response = await getTask(apiClient, cookieHeader, taskId);
      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({ status: 'idle', runAt });
    }
  );
});
