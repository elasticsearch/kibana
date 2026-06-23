/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup, Logger } from '@kbn/core/server';
import type { CoreSetup, CoreStart } from '@kbn/core/server';
import type { TaskManagerStartContract } from '..';
import type { TaskScheduling } from '../task_scheduling';
import type { TaskTypeDictionary } from '../task_type_dictionary';
import type { ConcreteTaskInstance } from '../task';
import type {
  ApiKeyToConvert,
  TaskManagerUiamProvisioningRunContext,
  UiamKeyResult,
  GetApiKeysToConvertResult,
  ConvertApiKeysResult,
  UpdateTasksResult,
} from './types';
import type { LatestTaskStateSchema } from './task_state';
import { emptyState, stateSchemaByVersion } from './task_state';
import type { TaskManagerPluginsStart } from '../plugin';
import {
  TASK_MANAGER_UIAM_PROVISIONING_RUN_EVENT,
  type TaskManagerUiamProvisioningRunEventData,
} from './event_based_telemetry';
import {
  RUN_AT_INTERVAL_MS,
  SCHEDULE_INTERVAL,
  TAGS,
  TASK_TIMEOUT,
  TASK_TYPE,
  UIAM_PROVISIONING_TASK_TITLE,
} from './constants';
import { getErrorMessage } from './lib/error_utils';
import { buildSuccessProvisioningRunTelemetry } from './lib/build_provisioning_run_telemetry';
import { createProvisioningRunContext } from './lib/create_provisioning_run_context';
import { classifyTasksForUiamProvisioning } from './lib/classify_task';
import { fetchFirstBatchOfTasksToConvert } from './lib/fetch_first_batch_of_tasks_to_convert';
import { getExcludeTasksFilter } from './lib/get_exclude_tasks_filter';
import { mapUiamConvertResponseToKeyResults } from './lib/map_uiam_convert_response_to_key_results';
import { buildSavedObjectBulkUpdatesForUiamKeys } from './lib/build_saved_object_bulk_updates_for_uiam';
import { markApiKeysForInvalidation } from '../api_key_strategy';
import { statusDocsAndOrphanedUiamKeysFromTaskBulkUpdate } from './lib/task_status_and_orphaned_keys_from_bulk_update';
import { UiamProvisioningFeatureFlagScheduler } from './lib/uiam_provisioning_feature_flag_scheduler';
import {
  createUiamProvisioningTaskRunner,
  type UiamProvisioningRunTaskOutcome,
} from './lib/create_uiam_provisioning_task_runner';
import {
  writeTaskUiamProvisioningObservabilityStatus,
  type TaskProvisioningStatusWritePayload,
} from './lib/task_uiam_provisioning_observability_status';

interface RegisterUiamApiKeyProvisioningTaskOpts {
  coreSetup: CoreSetup<TaskManagerPluginsStart, TaskManagerStartContract>;
  taskTypeDictionary: TaskTypeDictionary;
}

export class UiamApiKeyProvisioningTask {
  private readonly logger: Logger;
  private readonly isServerless: boolean;
  private readonly analytics: AnalyticsServiceSetup;
  private readonly featureFlagScheduler: UiamProvisioningFeatureFlagScheduler;

  constructor({
    logger,
    isServerless,
    analytics,
  }: {
    logger: Logger;
    isServerless: boolean;
    analytics: AnalyticsServiceSetup;
  }) {
    this.logger = logger;
    this.isServerless = isServerless;
    this.analytics = analytics;
    this.featureFlagScheduler = new UiamProvisioningFeatureFlagScheduler(logger);
  }

  register(opts: RegisterUiamApiKeyProvisioningTaskOpts): void {
    if (!this.isServerless) {
      return;
    }
    const { coreSetup, taskTypeDictionary } = opts;
    taskTypeDictionary.registerTaskDefinitions({
      [TASK_TYPE]: {
        title: UIAM_PROVISIONING_TASK_TITLE,
        timeout: TASK_TIMEOUT,
        stateSchemaByVersion,
        createTaskRunner: createUiamProvisioningTaskRunner(coreSetup, {
          runTask: (taskInstance, cs) => this.runTask(taskInstance, cs),
          reportProvisioningRunEvent: (telemetry) => this.reportProvisioningRunEvent(telemetry),
        }),
      },
    });
  }

  async start({
    core,
    taskScheduling,
    removeIfExists,
  }: {
    core: CoreStart;
    taskScheduling: TaskScheduling;
    removeIfExists: (id: string) => Promise<void>;
  }): Promise<void> {
    if (!this.isServerless) {
      return;
    }
    this.featureFlagScheduler.start({
      core,
      taskScheduling,
      removeIfExists,
      schedule: SCHEDULE_INTERVAL,
    });
  }

  stop(): void {
    this.featureFlagScheduler.stop();
  }

  private runTask = async (
    taskInstance: ConcreteTaskInstance,
    coreSetup: CoreSetup<TaskManagerPluginsStart, TaskManagerStartContract>
  ): Promise<UiamProvisioningRunTaskOutcome> => {
    const context = await createProvisioningRunContext(coreSetup);
    const state = (taskInstance.state ?? emptyState) as LatestTaskStateSchema;

    const { apiKeysToConvert, hasMoreToProvision, provisioningStatusForSkippedTasks } =
      await this.getApiKeysToConvert(context);

    const { converted, provisioningStatusForFailedConversions } = await this.convertApiKeys(
      apiKeysToConvert,
      context
    );

    const { provisioningStatusForCompletedTasks, provisioningStatusForFailedTasks } =
      await this.updateTasks(converted, context);

    await this.updateProvisioningStatus(
      {
        skipped: provisioningStatusForSkippedTasks,
        failedConversions: provisioningStatusForFailedConversions,
        completed: provisioningStatusForCompletedTasks,
        failed: provisioningStatusForFailedTasks,
      },
      context
    );

    const nextRuns = state.runs + 1;
    const completed = provisioningStatusForCompletedTasks.length;
    const failed =
      provisioningStatusForFailedConversions.length + provisioningStatusForFailedTasks.length;
    const skipped = provisioningStatusForSkippedTasks.length;
    const telemetry = buildSuccessProvisioningRunTelemetry({
      completed,
      failed,
      skipped,
      hasMoreToProvision,
      nextRunNumber: nextRuns,
    });

    // Re-run soon when there is more to provision.
    const shouldRunAgainSoon = hasMoreToProvision;

    return {
      state: { runs: nextRuns },
      ...(shouldRunAgainSoon ? { runAt: new Date(Date.now() + RUN_AT_INTERVAL_MS) } : {}),
      telemetry,
    };
  };

  private reportProvisioningRunEvent = (
    telemetry: TaskManagerUiamProvisioningRunEventData
  ): void => {
    try {
      this.analytics.reportEvent(TASK_MANAGER_UIAM_PROVISIONING_RUN_EVENT.eventType, telemetry);
    } catch (e) {
      this.logger.debug(`Failed to report UIAM provisioning run telemetry event: ${e}`);
    }
  };

  private getApiKeysToConvert = async (
    context: TaskManagerUiamProvisioningRunContext
  ): Promise<GetApiKeysToConvertResult> => {
    try {
      const excludeTaskEntityIdsWithFinalStatus = await getExcludeTasksFilter(
        context.savedObjectsClient
      );
      const { tasks, hasMore: hasMoreToProvision } = await fetchFirstBatchOfTasksToConvert(
        context.taskManager,
        { excludeTaskEntityIdsWithFinalStatus }
      );
      const { apiKeysToConvert, provisioningStatusForSkippedTasks } =
        classifyTasksForUiamProvisioning(tasks);
      return {
        apiKeysToConvert,
        provisioningStatusForSkippedTasks,
        hasMoreToProvision,
      };
    } catch (error) {
      this.logger.error(`Error getting API keys to convert: ${getErrorMessage(error)}`, {
        error: { stack_trace: error instanceof Error ? error.stack : undefined, tags: TAGS },
      });
      throw error;
    }
  };

  private convertApiKeys = async (
    apiKeysToConvert: ApiKeyToConvert[],
    context: TaskManagerUiamProvisioningRunContext
  ): Promise<ConvertApiKeysResult> => {
    if (apiKeysToConvert.length === 0) {
      return { converted: [], provisioningStatusForFailedConversions: [] };
    }

    try {
      const keys = apiKeysToConvert.map(({ attributes }) => attributes.apiKey!);
      const response = await context.uiamConvert(keys);
      if (response === null) {
        throw new Error('License required for the UIAM convert API is not enabled');
      }
      // If UIAM returns a result count that doesn't match the request, we throw before
      // mapUiamConvertResponseToKeyResults runs, so any keys minted server-side are not
      // captured in our result and cannot be invalidated client-side. The convert API is
      // expected to return one result per requested key; treat a mismatch as exceptional
      // and accept the minted-but-orphaned keys as a bounded leak (same trade-off the
      // alerting bulkUpdate-throw path makes for the same reason).
      if (response.results.length !== apiKeysToConvert.length) {
        throw new Error(
          'Number of converted API keys does not match the number of API keys to convert'
        );
      }

      const { converted, provisioningStatusForFailedConversions } =
        mapUiamConvertResponseToKeyResults(apiKeysToConvert, response);

      return { converted, provisioningStatusForFailedConversions };
    } catch (error) {
      this.logger.error(`Error converting API keys: ${getErrorMessage(error)}`, {
        error: { stack_trace: error instanceof Error ? error.stack : undefined, tags: TAGS },
      });
      throw error;
    }
  };

  private updateTasks = async (
    converted: UiamKeyResult[],
    context: TaskManagerUiamProvisioningRunContext
  ): Promise<UpdateTasksResult> => {
    if (converted.length === 0) {
      return {
        provisioningStatusForCompletedTasks: [],
        provisioningStatusForFailedTasks: [],
      };
    }

    const { unsafeSavedObjectsClient } = context;
    const updates = buildSavedObjectBulkUpdatesForUiamKeys(converted);

    const uiamKeyByTaskId = new Map(
      Array.from(converted, (c): [string, UiamKeyResult] => [c.taskId, c])
    );

    try {
      // `uiamApiKey` is an ESO `attributesToEncrypt` on the `task` type, so this
      // write must go through the encryption-aware client (see the context wiring
      // in `create_provisioning_run_context.ts`).
      const bulkResponse = await unsafeSavedObjectsClient.bulkUpdate(updates);

      const {
        provisioningStatusForCompletedTasks,
        provisioningStatusForFailedTasks,
        orphanedInvalidationTargets,
      } = statusDocsAndOrphanedUiamKeysFromTaskBulkUpdate(
        bulkResponse.saved_objects,
        uiamKeyByTaskId
      );
      if (orphanedInvalidationTargets.length > 0) {
        // `api_key_to_invalidate` also encrypts `uiamApiKey`, so the invalidation
        // bulk create must use the encryption-aware client as well.
        await markApiKeysForInvalidation(
          orphanedInvalidationTargets,
          this.logger,
          unsafeSavedObjectsClient
        );
      }

      return {
        provisioningStatusForCompletedTasks,
        provisioningStatusForFailedTasks,
      };
    } catch (error) {
      this.logger.error(`Error bulk updating tasks with UIAM API keys: ${getErrorMessage(error)}`, {
        error: { stack_trace: error instanceof Error ? error.stack : undefined, tags: TAGS },
      });
      throw error;
    }
  };

  private updateProvisioningStatus = async (
    payload: TaskProvisioningStatusWritePayload,
    context: TaskManagerUiamProvisioningRunContext
  ): Promise<void> => {
    await writeTaskUiamProvisioningObservabilityStatus(
      context.savedObjectsClient,
      this.logger,
      payload
    );
  };
}
