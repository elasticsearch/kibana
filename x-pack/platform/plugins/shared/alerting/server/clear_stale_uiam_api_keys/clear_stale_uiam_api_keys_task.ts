/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, CoreSetup } from '@kbn/core/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
  ConcreteTaskInstance,
} from '@kbn/task-manager-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { AlertingPluginsStart } from '../plugin';
import {
  CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID,
  CLEAR_STALE_UIAM_API_KEYS_TASK_ID,
  CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE,
  CLEAR_STALE_UIAM_API_KEYS_TASK_SCHEDULE,
  CLEAR_STALE_UIAM_API_KEYS_TASK_TIMEOUT,
  CLEAR_STALE_UIAM_API_KEYS_RESCHEDULE_DELAY_MS,
  CLEAR_STALE_UIAM_API_KEYS_TAGS,
} from './constants';
import {
  stateSchemaByVersion,
  emptyState,
  type LatestTaskStateSchema,
} from './clear_stale_uiam_api_keys_task_state';
import { stripStaleUiamApiKeysFromRules } from './lib/strip_stale_uiam_api_keys';

/**
 * One-off, project-gated cleanup of rules whose encrypted `uiamApiKey` was leaked by the
 * object-spread bug fixed in PR #263887. The task latches on first success
 * (`state.cleared = true`) and idles thereafter on the daily safety-net schedule.
 *
 * Gating is intentionally a two-layer hard-coded check (`isServerless` AND a single
 * project ID) — not a config or feature flag — so it is structurally impossible to enable
 * this cleanup for any other project by misconfiguration. Non-target deployments do not
 * schedule the task at all; the task type is still registered so that any leftover
 * scheduled instance from a previous deployment can be drained or removed cleanly.
 */
export class ClearStaleUiamApiKeysTask {
  private readonly logger: Logger;
  private readonly isServerless: boolean;
  private readonly cloud?: CloudSetup;

  constructor({
    logger,
    isServerless,
    cloud,
  }: {
    logger: Logger;
    isServerless: boolean;
    cloud?: CloudSetup;
  }) {
    this.logger = logger;
    this.isServerless = isServerless;
    this.cloud = cloud;
  }

  public register({
    core,
    taskManager,
  }: {
    core: CoreSetup<AlertingPluginsStart>;
    taskManager: TaskManagerSetupContract;
  }): void {
    if (!this.isServerless) {
      return;
    }
    if (!taskManager) {
      this.logger.error(
        `Missing required task manager service during registration of ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE}`,
        { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
      );
      return;
    }
    taskManager.registerTaskDefinitions({
      [CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE]: {
        title: 'Clear stale UIAM API keys from rules (one-off)',
        timeout: CLEAR_STALE_UIAM_API_KEYS_TASK_TIMEOUT,
        stateSchemaByVersion,
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => {
          return {
            run: async () => {
              return this.runTask(taskInstance, core);
            },
            cancel: async () => {},
          };
        },
      },
    });
  }

  public start = async ({
    taskManager,
  }: {
    taskManager: TaskManagerStartContract;
  }): Promise<void> => {
    if (!this.isServerless) {
      return;
    }
    if (!taskManager) {
      this.logger.error(
        `Missing required task manager service during start of ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE}`,
        { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
      );
      return;
    }

    const projectId = this.cloud?.serverless?.projectId;
    if (projectId === CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID) {
      try {
        await taskManager.ensureScheduled({
          id: CLEAR_STALE_UIAM_API_KEYS_TASK_ID,
          taskType: CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE,
          schedule: CLEAR_STALE_UIAM_API_KEYS_TASK_SCHEDULE,
          state: emptyState,
          params: {},
        });
        this.logger.info(
          `Task ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE} scheduled for project ${projectId}`,
          { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
        );
      } catch (error) {
        this.logger.error(
          `Error scheduling task ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE}: ${getErrorMessage(error)}`,
          {
            error: {
              stack_trace: error instanceof Error ? error.stack : undefined,
              tags: CLEAR_STALE_UIAM_API_KEYS_TAGS,
            },
          }
        );
      }
      return;
    }

    // Defensive cleanup: if a previous (mis-targeted) deployment ever scheduled this task in
    // a non-target project, remove it on startup so we cannot accidentally touch the wrong
    // project's data. No-op when nothing is scheduled.
    try {
      await taskManager.removeIfExists(CLEAR_STALE_UIAM_API_KEYS_TASK_ID);
    } catch (error) {
      this.logger.error(
        `Error removing stray task ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE}: ${getErrorMessage(
          error
        )}`,
        {
          error: {
            stack_trace: error instanceof Error ? error.stack : undefined,
            tags: CLEAR_STALE_UIAM_API_KEYS_TAGS,
          },
        }
      );
    }
  };

  public stop = (): void => {
    // No subscription to tear down; gating is static (project ID + isServerless), evaluated
    // once at `start()`. Kept for symmetry with other tasks' lifecycle.
  };

  private runTask = async (
    taskInstance: ConcreteTaskInstance,
    core: CoreSetup<AlertingPluginsStart>
  ): Promise<{ state: LatestTaskStateSchema; runAt?: Date }> => {
    const state = (taskInstance.state ?? emptyState) as LatestTaskStateSchema;

    if (state.cleared) {
      // Latched: cleanup completed in a prior run. Bump the run counter and return without
      // touching ES at all.
      return { state: { runs: state.runs + 1, cleared: true } };
    }

    // Belt-and-suspenders: even if Task Manager mis-targets the task instance to a different
    // project mid-flight (e.g. cross-project task store sharing in a future deployment),
    // refuse to run unless this Kibana node is the one we hard-coded.
    const projectId = this.cloud?.serverless?.projectId;
    if (!this.isServerless || projectId !== CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID) {
      this.logger.warn(
        `Refusing to run ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE} outside the target project ` +
          `(seen projectId=${projectId ?? 'undefined'}); no-op and skip latch.`,
        { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
      );
      return { state: { runs: state.runs + 1, cleared: false } };
    }

    const [coreStart] = await core.getStartServices();
    const esClient = coreStart.elasticsearch.client.asInternalUser;

    const { updated, versionConflicts } = await stripStaleUiamApiKeysFromRules(
      esClient,
      this.logger
    );

    const nextRuns = state.runs + 1;

    if (versionConflicts === 0) {
      this.logger.info(
        `Cleanup of stale uiamApiKey complete for project ${projectId}: ${updated} rule(s) ` +
          `updated this run. Latching ${CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE} to no-op.`,
        { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
      );
      return { state: { runs: nextRuns, cleared: true } };
    }

    this.logger.info(
      `${updated} rule(s) updated; ${versionConflicts} version conflict(s) deferred to next run.`,
      { tags: CLEAR_STALE_UIAM_API_KEYS_TAGS }
    );
    return {
      state: { runs: nextRuns, cleared: false },
      runAt: new Date(Date.now() + CLEAR_STALE_UIAM_API_KEYS_RESCHEDULE_DELAY_MS),
    };
  };
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
