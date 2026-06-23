/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient, ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';
import { COMMON_HEADERS } from '../constants';

interface RunSoonResponse {
  id: string;
  error?: string;
}

/**
 * Test-time helpers for the Task Manager FTR routes.
 */
export interface TaskManagerService {
  /**
   * Triggers an immediate run of the given task via the `ftrApis` route. The
   * underlying handler always responds with HTTP 200 and surfaces failures in
   * the response body's `error` field, which we promote to a thrown error.
   */
  runSoon: (taskId: string) => Promise<void>;
}

export const getTaskManagerService = ({
  log,
  kbnClient,
}: {
  log: ScoutLogger;
  kbnClient: KbnClient;
}): TaskManagerService => ({
  runSoon: (taskId) =>
    measurePerformanceAsync(log, `taskManager.runSoon[${taskId}]`, async () => {
      const response = await kbnClient.request<RunSoonResponse>({
        method: 'POST',
        path: `/internal/ftr/task_manager/${encodeURIComponent(taskId)}/run_soon`,
        headers: COMMON_HEADERS,
      });

      if (response.data.error) {
        throw new Error(`Failed to run_soon task '${taskId}': ${response.data.error}`);
      }
    }),
});
