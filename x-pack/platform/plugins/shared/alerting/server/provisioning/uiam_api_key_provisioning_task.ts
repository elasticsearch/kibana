/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { distinctUntilChanged, type Subscription } from 'rxjs';
import type { AnalyticsServiceSetup, Logger, CoreSetup, CoreStart } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
  ConcreteTaskInstance,
} from '@kbn/task-manager-plugin/server';
import { RULE_SAVED_OBJECT_TYPE } from '../saved_objects';
import { bulkMarkApiKeysForInvalidation } from '../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import {
  stateSchemaByVersion,
  emptyState,
  type LatestTaskStateSchema,
} from './uiam_api_key_provisioning_task_state';
import {
  createProvisioningRunContext,
  classifyRulesForUiamProvisioning,
  fetchFirstBatchOfRulesToConvert,
  getErrorMessage,
  getExcludeRulesFilter,
  buildRuleUpdatesForUiam,
  mapConvertResponseToResult,
  prepareProvisioningStatusWrite,
  statusDocsAndOrphanedKeysFromBulkUpdate,
  type ProvisioningStatusWritePayload,
} from './lib';
import type {
  ProvisioningRunContext,
  ProvisioningStatusDocs,
  ApiKeyToConvert,
  GetApiKeysToConvertResult,
  UiamApiKeyByRuleId,
  ConvertApiKeysResult,
} from './types';
import type { AlertingPluginsStart } from '../plugin';
import {
  PROVISION_UIAM_API_KEYS_FLAG,
  API_KEY_PROVISIONING_TASK_ID,
  API_KEY_PROVISIONING_TASK_TYPE,
  API_KEY_PROVISIONING_TASK_SCHEDULE,
  TASK_TIMEOUT,
  RESCHEDULE_DELAY_MS,
  TAGS,
} from './constants';
import {
  UIAM_PROVISIONING_RUN_EVENT,
  type UiamProvisioningRunEventData,
} from './event_based_telemetry';

export class UiamApiKeyProvisioningTask {
  private readonly logger: Logger;
  private readonly isServerless: boolean;
  private readonly analytics: AnalyticsServiceSetup;
  private featureFlagSubscription: Subscription | undefined;
  private appliedFlagValue: boolean | undefined;

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
  }

  register({
    core,
    taskManager,
  }: {
    core: CoreSetup<AlertingPluginsStart>;
    taskManager: TaskManagerSetupContract;
  }) {
    if (!this.isServerless) {
      return;
    }
    if (!taskManager) {
      this.logger.error(
        `Missing required task manager service during registration of ${API_KEY_PROVISIONING_TASK_TYPE}`,
        { tags: TAGS }
      );
      return;
    }
    taskManager.registerTaskDefinitions({
      [API_KEY_PROVISIONING_TASK_TYPE]: {
        title: 'UIAM API key provisioning task',
        timeout: TASK_TIMEOUT,
        stateSchemaByVersion,
        createTaskRunner: ({ taskInstance }: { taskInstance: ConcreteTaskInstance }) => {
          return {
            run: async () => {
              let caughtError: Error | undefined;
              let result: Awaited<ReturnType<typeof this.runTask>> | undefined;
              try {
                result = await this.runTask(taskInstance, core);
              } catch (error) {
                caughtError = error instanceof Error ? error : new Error(String(error));
              }

              const telemetry: UiamProvisioningRunEventData = result?.telemetry ?? {
                total: 0,
                completed: 0,
                failed: 0,
                skipped: 0,
                has_more_to_provision: false,
                has_error: true,
                run_number: 0,
              };
              this.reportProvisioningRunEvent(telemetry);

              if (caughtError) {
                throw caughtError;
              }
              const { telemetry: _, ...taskResult } = result!;
              return taskResult;
            },
            cancel: async () => {},
          };
        },
      },
    });
  }

  public start = async ({
    core,
    taskManager,
  }: {
    core: CoreStart;
    taskManager: TaskManagerStartContract;
  }) => {
    if (!this.isServerless) {
      return;
    }
    if (!taskManager) {
      this.logger.error(
        `Missing required task manager service during start of ${API_KEY_PROVISIONING_TASK_TYPE}`,
        { tags: TAGS }
      );
      return;
    }

    this.featureFlagSubscription = core.featureFlags
      .getBooleanValue$(PROVISION_UIAM_API_KEYS_FLAG, false)
      .pipe(distinctUntilChanged())
      .subscribe((enabled: boolean) => {
        this.applyProvisioningFlag(enabled, taskManager).catch(() => {});
      });
  };

  public stop = () => {
    this.featureFlagSubscription?.unsubscribe();
    this.featureFlagSubscription = undefined;
  };

  private scheduleProvisioningTask = async (
    taskManager: TaskManagerStartContract
  ): Promise<void> => {
    await taskManager.ensureScheduled({
      id: API_KEY_PROVISIONING_TASK_ID,
      taskType: API_KEY_PROVISIONING_TASK_TYPE,
      schedule: API_KEY_PROVISIONING_TASK_SCHEDULE,
      state: emptyState,
      params: {},
    });
    this.logger.info(
      `${PROVISION_UIAM_API_KEYS_FLAG} enabled - Task ${API_KEY_PROVISIONING_TASK_TYPE} scheduled`,
      { tags: TAGS }
    );
  };

  private unscheduleProvisioningTask = async (
    taskManager: TaskManagerStartContract
  ): Promise<void> => {
    await taskManager.removeIfExists(API_KEY_PROVISIONING_TASK_ID);
    this.logger.info(
      `${PROVISION_UIAM_API_KEYS_FLAG} disabled - Task ${API_KEY_PROVISIONING_TASK_TYPE} removed`,
      { tags: TAGS }
    );
  };

  private applyProvisioningFlag = async (
    enabled: boolean,
    taskManager: TaskManagerStartContract
  ): Promise<void> => {
    // Only react to real flag transitions. The initial subscription emission
    // (previousValue === undefined) with `false` is treated as a no-op: there
    // is nothing to unschedule, and attempting to remove a non-existent task
    // can surface transient errors during startup.
    const previousValue = this.appliedFlagValue;
    this.appliedFlagValue = enabled;

    if (enabled && previousValue !== true) {
      try {
        await this.scheduleProvisioningTask(taskManager);
      } catch (e) {
        this.logger.error(
          `Error scheduling task ${API_KEY_PROVISIONING_TASK_TYPE}, received ${getErrorMessage(e)}`,
          { tags: TAGS }
        );
      }
      return;
    }

    if (!enabled && previousValue === true) {
      try {
        await this.unscheduleProvisioningTask(taskManager);
      } catch (e) {
        this.logger.error(
          `Error removing task ${API_KEY_PROVISIONING_TASK_TYPE}, received ${getErrorMessage(e)}`,
          { tags: TAGS }
        );
      }
    }
  };

  private runTask = async (
    taskInstance: ConcreteTaskInstance,
    core: CoreSetup<AlertingPluginsStart>
  ): Promise<{
    state: LatestTaskStateSchema;
    runAt?: Date;
    telemetry: UiamProvisioningRunEventData;
  }> => {
    const state = (taskInstance.state ?? emptyState) as LatestTaskStateSchema;
    const context = await createProvisioningRunContext(core);

    const { apiKeysToConvert, provisioningStatusForSkippedRules, hasMoreToProvision } =
      await this.getApiKeysToConvert(context);

    const { rulesWithUiamApiKeys, provisioningStatusForFailedConversions } =
      await this.convertApiKeys(apiKeysToConvert, context);

    const { provisioningStatusForCompletedRules, provisioningStatusForFailedRules } =
      await this.updateRules(rulesWithUiamApiKeys, context);

    await this.updateProvisioningStatus(
      {
        skipped: provisioningStatusForSkippedRules,
        failedConversions: provisioningStatusForFailedConversions,
        completed: provisioningStatusForCompletedRules,
        failed: provisioningStatusForFailedRules,
      },
      context
    );

    const nextState = { runs: state.runs + 1 };
    const completed = provisioningStatusForCompletedRules.length;
    const failed =
      provisioningStatusForFailedConversions.length + provisioningStatusForFailedRules.length;
    const skipped = provisioningStatusForSkippedRules.length;

    const telemetry: UiamProvisioningRunEventData = {
      total: completed + failed + skipped,
      completed,
      failed,
      skipped,
      has_more_to_provision: hasMoreToProvision,
      has_error: false,
      run_number: nextState.runs,
    };

    if (hasMoreToProvision) {
      return { state: nextState, runAt: new Date(Date.now() + RESCHEDULE_DELAY_MS), telemetry };
    }
    return { state: nextState, telemetry };
  };

  private getApiKeysToConvert = async (
    context: ProvisioningRunContext
  ): Promise<GetApiKeysToConvertResult> => {
    try {
      const excludeRulesFilter = await getExcludeRulesFilter(context.savedObjectsClient);
      const { rules, hasMore: hasMoreToProvision } = await fetchFirstBatchOfRulesToConvert(
        context.encryptedSavedObjectsClient,
        { excludeRulesFilter, ruleType: RULE_SAVED_OBJECT_TYPE }
      );

      const { provisioningStatusForSkippedRules, apiKeysToConvert } =
        classifyRulesForUiamProvisioning(rules);

      return {
        apiKeysToConvert,
        provisioningStatusForSkippedRules,
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
    apiKeysToConvert: Array<ApiKeyToConvert>,
    context: ProvisioningRunContext
  ): Promise<ConvertApiKeysResult> => {
    if (apiKeysToConvert.length === 0) {
      return {
        rulesWithUiamApiKeys: new Map(),
        provisioningStatusForFailedConversions: [],
      };
    }

    try {
      const keys = apiKeysToConvert.map(({ attributes }) => attributes.apiKey!);
      const convertResponse = await context.uiamConvert(keys);
      if (convertResponse === null) {
        throw new Error('License required for the UIAM convert API is not enabled');
      }

      if (convertResponse.results.length !== apiKeysToConvert.length) {
        throw new Error(
          'Number of converted API keys does not match the number of API keys to convert'
        );
      }

      const { rulesWithUiamApiKeys, provisioningStatusForFailedConversions } =
        mapConvertResponseToResult(apiKeysToConvert, convertResponse);

      return { rulesWithUiamApiKeys, provisioningStatusForFailedConversions };
    } catch (error) {
      this.logger.error(`Error converting API keys: ${getErrorMessage(error)}`, {
        error: { stack_trace: error instanceof Error ? error.stack : undefined, tags: TAGS },
      });
      throw error;
    }
  };

  private updateRules = async (
    rulesWithUiamApiKeys: Map<string, UiamApiKeyByRuleId>,
    context: ProvisioningRunContext
  ): Promise<{
    provisioningStatusForCompletedRules: Array<ProvisioningStatusDocs>;
    provisioningStatusForFailedRules: Array<ProvisioningStatusDocs>;
  }> => {
    const empty = {
      provisioningStatusForCompletedRules: [] as Array<ProvisioningStatusDocs>,
      provisioningStatusForFailedRules: [] as Array<ProvisioningStatusDocs>,
    };
    if (rulesWithUiamApiKeys.size === 0) {
      return empty;
    }
    const ruleUpdates = buildRuleUpdatesForUiam(Array.from(rulesWithUiamApiKeys.values()));
    try {
      const bulkRuleUpdateResponse = await context.unsafeSavedObjectsClient.bulkUpdate(ruleUpdates);

      const {
        provisioningStatusForCompletedRules,
        provisioningStatusForFailedRules,
        orphanedUiamApiKeys,
      } = statusDocsAndOrphanedKeysFromBulkUpdate(
        bulkRuleUpdateResponse.saved_objects,
        rulesWithUiamApiKeys
      );

      if (orphanedUiamApiKeys.length > 0) {
        await bulkMarkApiKeysForInvalidation(
          { apiKeys: orphanedUiamApiKeys },
          this.logger,
          context.unsafeSavedObjectsClient
        );
      }

      return { provisioningStatusForCompletedRules, provisioningStatusForFailedRules };
    } catch (error) {
      // Do not invalidate minted UIAM keys on a bulkUpdate throw: if ES already committed
      // (transport drop / timeout mid-response) the persisted keys are live and invalidating
      // them would break rule execution. Rules whose write did not land will be re-picked on
      // the next run and provisioned with a fresh key; the minted-but-orphaned keys from a
      // pre-commit throw are accepted as a bounded leak.
      this.logger.error(`Error bulk updating rules with UIAM API keys: ${getErrorMessage(error)}`, {
        error: { stack_trace: error instanceof Error ? error.stack : undefined, tags: TAGS },
      });
      throw error;
    }
  };

  private updateProvisioningStatus = async (
    payload: ProvisioningStatusWritePayload,
    context: ProvisioningRunContext
  ): Promise<void> => {
    const { docs, counts } = prepareProvisioningStatusWrite(payload);
    if (docs.length === 0) {
      return;
    }
    try {
      const result = await context.savedObjectsClient.bulkCreate(docs, { overwrite: true });
      for (const so of result?.saved_objects ?? []) {
        if (isSavedObjectErrorResult(so)) {
          // Per-item SOR failure: next run will re-attempt the same id via `overwrite: true`.
          // We surface it as a warn so operators can spot systematically broken docs instead
          // of the failure being silently swallowed inside the bulk response.
          this.logger.warn(
            `Failed to persist UIAM provisioning status for rule ${so.id}: ${so.error.message}`,
            { tags: TAGS }
          );
        }
      }
      this.logger.info(
        `Wrote provisioning status: ${counts.total} total (${counts.skipped} skipped, ${counts.failedConversions} failed conversions, ${counts.completed} completed, ${counts.failed} failed updates).`,
        { tags: TAGS }
      );
    } catch (e) {
      // Whole-call failure is tagged so log pipelines can alert on 'status-write-failed'
      // without parsing the message. The error is swallowed: status writes are best-effort
      // and must not fail the provisioning run.
      this.logger.error(`Error writing provisioning status: ${getErrorMessage(e)}`, {
        error: {
          stack_trace: e instanceof Error ? e.stack : undefined,
          tags: [...TAGS, 'status-write-failed'],
        },
      });
    }
  };

  private reportProvisioningRunEvent = (telemetry: UiamProvisioningRunEventData): void => {
    try {
      this.analytics.reportEvent(UIAM_PROVISIONING_RUN_EVENT.eventType, telemetry);
    } catch (e) {
      this.logger.debug(`Failed to report UIAM provisioning run telemetry event: ${e}`);
    }
  };
}
