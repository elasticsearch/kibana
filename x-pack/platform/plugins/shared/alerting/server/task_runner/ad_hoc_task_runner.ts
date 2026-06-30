/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import apm from 'elastic-apm-node';
import type { ISavedObjectsRepository, KibanaRequest, Logger, SavedObject } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { addSpanLabels } from '@kbn/apm-utils';
import { nanosToMillis } from '@kbn/event-log-plugin/common';
import type { CancellableTask, RunResult } from '@kbn/task-manager-plugin/server/task';
import { TaskPriority } from '@kbn/task-manager-plugin/server/task';
import { ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/elastic-assistant-common';
import type { AdHocRunStatus } from '../../common/constants';
import { adHocRunStatus } from '../../common/constants';
import type { RuleRunnerErrorStackTraceLog, RunRuleResult, TaskRunnerContext } from './types';
import { getExecutorServices } from './get_executor_services';
import { ErrorWithReason, validateRuleTypeParams } from '../lib';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  RuleAlertData,
  RuleTypeParams,
  RuleTypeRegistry,
  RuleTypeState,
} from '../types';
import { RuleExecutionStatusErrorReasons } from '../types';
import { TaskRunnerTimer, TaskRunnerTimerSpan } from './task_runner_timer';
import type { AdHocRun, AdHocRunSO, AdHocRunSchedule } from '../data/ad_hoc_run/types';
import { AD_HOC_RUN_SAVED_OBJECT_TYPE } from '../saved_objects';
import { RuleMonitoringService } from '../monitoring/rule_monitoring_service';
import { AdHocTaskRunningHandler } from './ad_hoc_task_running_handler';
import { getFakeKibanaRequest } from './rule_loader';
import { RuleResultService } from '../monitoring/rule_result_service';
import { RuleTypeRunner } from './rule_type_runner';
import { initializeAlertsClient } from '../alerts_client';
import { partiallyUpdateAdHocRun, processRunResults } from './lib';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import {
  AlertingEventLogger,
  executionType,
} from '../lib/alerting_event_logger/alerting_event_logger';
import type { RuleRunMetrics } from '../lib/rule_run_metrics_store';
import { RuleRunMetricsStore } from '../lib/rule_run_metrics_store';
import { getEsErrorMessage } from '../lib/errors';
import type { Result } from '../lib/result_type';
import { isOk, asOk, asErr } from '../lib/result_type';
import { updateGaps } from '../lib/rule_gaps/update/update_gaps';
import { ActionScheduler } from './action_scheduler';
import { transformAdHocRunToAdHocRunData } from '../application/backfill/transforms/transform_ad_hoc_run_to_backfill_result';

export interface AdHocTaskRunnerConstructorParams {
  context: TaskRunnerContext;
  internalSavedObjectsRepository: ISavedObjectsRepository;
  taskInstance: ConcreteTaskInstance;
  executionUuid: string;
}

interface RunParams {
  adHocRunData: AdHocRun;
  fakeRequest: KibanaRequest;
  scheduleToRun: AdHocRunSchedule | null;
  validatedParams: RuleTypeParams;
}

export class AdHocTaskRunner implements CancellableTask {
  private readonly context: TaskRunnerContext;
  private readonly executionId: string;
  private readonly internalSavedObjectsRepository: ISavedObjectsRepository;
  private readonly ruleTypeRegistry: RuleTypeRegistry;
  private readonly taskInstance: ConcreteTaskInstance;

  private adHocRunSchedule: AdHocRunSchedule[] = [];
  private adHocRange: { start: string; end: string | undefined } | null = null;
  private adHocRunData: AdHocRun | null = null;
  private alertingEventLogger: AlertingEventLogger;
  private cancelled = false;
  private logger: Logger;
  private ruleId = '';
  private ruleMonitoring: RuleMonitoringService;
  private ruleResult: RuleResultService;
  private ruleTypeId = '';
  private ruleTypeRunner: RuleTypeRunner<
    RuleTypeParams,
    RuleTypeParams,
    RuleTypeState,
    AlertInstanceState,
    AlertInstanceContext,
    string,
    string,
    RuleAlertData
  >;
  private runDate = new Date();
  private scheduleToRunIndex = -1;
  private searchAbortController: AbortController;
  private shouldDeleteTask = false;
  private stackTraceLog: RuleRunnerErrorStackTraceLog | null = null;
  private taskRunning: AdHocTaskRunningHandler;
  private timer: TaskRunnerTimer;
  private apiKeyToUse: string | null = null;

  constructor({
    context,
    internalSavedObjectsRepository,
    taskInstance,
    executionUuid,
  }: AdHocTaskRunnerConstructorParams) {
    this.context = context;
    this.executionId = executionUuid;
    this.internalSavedObjectsRepository = internalSavedObjectsRepository;
    this.ruleTypeRegistry = context.ruleTypeRegistry;
    this.taskInstance = taskInstance;

    this.alertingEventLogger = new AlertingEventLogger(this.context.eventLogger);
    this.logger = context.logger.get(`ad_hoc_run`);
    this.ruleMonitoring = new RuleMonitoringService();
    this.ruleResult = new RuleResultService();
    this.timer = new TaskRunnerTimer({ logger: this.logger });
    this.ruleTypeRunner = new RuleTypeRunner<
      RuleTypeParams,
      RuleTypeParams,
      RuleTypeState,
      AlertInstanceState,
      AlertInstanceContext,
      string,
      string,
      RuleAlertData
    >({
      context: this.context,
      task: this.taskInstance,
      timer: this.timer,
    });
    this.searchAbortController = new AbortController();
    this.taskRunning = new AdHocTaskRunningHandler(
      this.internalSavedObjectsRepository,
      this.logger
    );
  }

  private async updateAdHocRunSavedObjectPostRun(
    adHocRunParamsId: string,
    namespace: string | undefined,
    { status, schedule }: { status?: AdHocRunStatus; schedule?: AdHocRunSchedule[] }
  ) {
    try {
      // Checking to see if the update performed at the beginning
      // of the run is complete. Swallowing the error because we still
      // want to move forward with the update post-run
      await this.taskRunning.waitFor();
      // eslint-disable-next-line no-empty
    } catch {}

    try {
      await partiallyUpdateAdHocRun(
        this.internalSavedObjectsRepository,
        adHocRunParamsId,
        { ...(status ? { status } : {}), ...(schedule ? { schedule } : {}) },
        {
          ignore404: true,
          namespace,
          refresh: false,
        }
      );
    } catch (err) {
      this.logger.error(`error updating ad hoc run ${adHocRunParamsId} ${err.message}`);
    }
  }

  private async runRule({
    adHocRunData,
    fakeRequest,
    scheduleToRun,
    validatedParams: params,
  }: RunParams): Promise<RuleRunMetrics> {
    const ruleRunMetricsStore = new RuleRunMetricsStore();
    if (scheduleToRun == null) {
      return ruleRunMetricsStore.getMetrics();
    }

    const { rule, apiKeyToUse, apiKeyId } = adHocRunData;
    const ruleType = this.ruleTypeRegistry.get(rule.alertTypeId);

    const ruleLabel = `${ruleType.id}:${rule.id}: '${rule.name}'`;
    const ruleTypeRunnerContext = {
      alertingEventLogger: this.alertingEventLogger,
      namespace: this.context.spaceIdToNamespace(adHocRunData.spaceId),
      logger: this.logger,
      request: fakeRequest,
      ruleId: rule.id,
      ruleLogPrefix: ruleLabel,
      ruleRunMetricsStore,
      spaceId: adHocRunData.spaceId,
      isServerless: this.context.isServerless,
      shouldGrantUiam: this.context.shouldGrantUiam,
    };
    const alertsClient = await initializeAlertsClient<
      RuleTypeParams,
      RuleAlertData,
      AlertInstanceState,
      AlertInstanceContext,
      string,
      string
    >({
      alertsService: this.context.alertsService,
      context: ruleTypeRunnerContext,
      executionId: this.executionId,
      logger: this.logger,
      maxAlerts: this.context.maxAlerts,
      rule: {
        id: rule.id,
        name: rule.name,
        tags: rule.tags,
        consumer: rule.consumer,
        revision: rule.revision,
        params: rule.params,
        muteAll: false,
        mutedInstanceIds: [],
      },
      ruleType,
      runTimestamp: this.runDate,
      startedAt: new Date(scheduleToRun.runAt),
      taskInstance: this.taskInstance,
    });

    const executorServices = getExecutorServices({
      context: this.context,
      fakeRequest,
      abortController: this.searchAbortController,
      logger: this.logger,
      ruleMonitoringService: this.ruleMonitoring,
      ruleResultService: this.ruleResult,
      ruleData: {
        name: rule.name,
        alertTypeId: rule.alertTypeId,
        id: rule.id,
        spaceId: adHocRunData.spaceId,
      },
      ruleTaskTimeout: ruleType.ruleTaskTimeout,
    });

    const actionsClient = await this.context.actionsPlugin.getActionsClientWithRequest(fakeRequest);

    const { error, stackTrace } = await this.ruleTypeRunner.run({
      context: ruleTypeRunnerContext,
      alertsClient,
      actionsClient:
        ruleType.id === ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID ? actionsClient : undefined,
      executionId: this.executionId,
      executorServices,
      rule: {
        ...rule,
        actions: [],
        muteAll: false,
        createdAt: new Date(rule.createdAt),
        updatedAt: new Date(rule.updatedAt),
      },
      ruleType,
      startedAt: new Date(scheduleToRun.runAt),
      state: this.taskInstance.state,
      validatedParams: params,
    });

    // if there was an error, save the stack trace and throw
    if (error) {
      this.stackTraceLog = stackTrace ?? null;
      throw error;
    }

    // Get alerts affected by maintenance windows here,
    // so we can have the maintenance windows on in-memory alerts before scheduling actions
    const alertsToUpdateWithMaintenanceWindows =
      await alertsClient.getAlertsToUpdateWithMaintenanceWindows();

    const actionScheduler = new ActionScheduler({
      rule: {
        ...rule,
        muteAll: false,
        mutedInstanceIds: [],
        createdAt: new Date(rule.createdAt),
        updatedAt: new Date(rule.updatedAt),
      },
      ruleType,
      logger: this.logger,
      taskRunnerContext: this.context,
      taskInstance: this.taskInstance,
      ruleRunMetricsStore,
      apiKey: apiKeyToUse,
      apiKeyId,
      ruleConsumer: rule.consumer,
      executionId: this.executionId,
      ruleLabel,
      previousStartedAt: null,
      alertingEventLogger: this.alertingEventLogger,
      actionsClient,
      alertsClient,
      priority: TaskPriority.Low,
    });

    if (this.shouldLogAndScheduleActionsForAlerts(ruleType)) {
      await actionScheduler.run({
        activeAlerts: alertsClient.getProcessedAlerts('active'),
        recoveredAlerts: alertsClient.getProcessedAlerts('recovered'),
      });
    } else {
      this.logger.debug(
        `no scheduling of actions for rule ${ruleLabel}: rule execution has been cancelled.`
      );
    }

    if (this.shouldLogAndScheduleActionsForAlerts(ruleType)) {
      await alertsClient.updatePersistedAlerts({
        alertsToUpdateWithLastScheduledActions: {},
        alertsToUpdateWithMaintenanceWindows,
      });
    } else {
      this.logger.debug(
        `skipping updating alerts for rule ${ruleTypeRunnerContext.ruleLogPrefix}: rule execution has been cancelled.`
      );
    }

    return ruleRunMetricsStore.getMetrics();
  }

  /**
   * Before we actually kick off the ad hoc run:
   * - read decrypted ad hoc run SO
   * - start the RunningHandler
   * - initialize the event logger
   * - set the current APM transaction info
   * - validate that rule type is enabled and params are valid
   */
  private async prepareToRun(): Promise<RunParams> {
    this.runDate = new Date();
    return await this.timer.runWithTimer(TaskRunnerTimerSpan.PrepareRule, async () => {
      const {
        params: { adHocRunParamsId, spaceId },
        startedAt,
      } = this.taskInstance;

      const namespace = this.context.spaceIdToNamespace(spaceId);

      this.alertingEventLogger.initialize({
        context: {
          savedObjectId: adHocRunParamsId,
          savedObjectType: AD_HOC_RUN_SAVED_OBJECT_TYPE,
          spaceId,
          executionId: this.executionId,
          taskScheduledAt: this.taskInstance.scheduledAt,
          ...(namespace ? { namespace } : {}),
        },
        runDate: this.runDate,
        // in the future we might want different types of ad hoc runs (like preview)
        type: executionType.BACKFILL,
      });

      let adHocRunData: AdHocRun;

      try {
        const adHocRunSO: SavedObject<AdHocRunSO> =
          await this.context.encryptedSavedObjectsClient.getDecryptedAsInternalUser<AdHocRunSO>(
            AD_HOC_RUN_SAVED_OBJECT_TYPE,
            adHocRunParamsId,
            { namespace }
          );

        adHocRunData = transformAdHocRunToAdHocRunData({
          adHocRunSO,
          isSystemAction: (connectorId: string) =>
            this.context.actionsPlugin.isSystemActionConnector(connectorId),
        });
      } catch (err) {
        const errorSource = SavedObjectsErrorHelpers.isNotFoundError(err)
          ? TaskErrorSource.USER
          : TaskErrorSource.FRAMEWORK;

        throw createTaskRunError(
          new ErrorWithReason(RuleExecutionStatusErrorReasons.Decrypt, err),
          errorSource
        );
      }

      const { rule, apiKeyToUse, schedule, start, end } = adHocRunData;
      this.apiKeyToUse = apiKeyToUse;
      this.adHocRunData = adHocRunData;

      let ruleType: UntypedNormalizedRuleType;
      try {
        ruleType = this.ruleTypeRegistry.get(rule.alertTypeId);
      } catch (err) {
        throw createTaskRunError(
          new ErrorWithReason(RuleExecutionStatusErrorReasons.Read, err),
          TaskErrorSource.FRAMEWORK
        );
      }

      this.ruleTypeId = ruleType.id;
      this.ruleId = rule.id;
      this.alertingEventLogger.addOrUpdateRuleData({
        id: rule.id,
        uuid:
          ruleType.solution === 'security' && typeof rule.params.ruleId === 'string'
            ? rule.params.ruleId
            : undefined,
        type: ruleType,
        name: rule.name,
        consumer: rule.consumer,
        revision: rule.revision,
      });

      try {
        this.ruleTypeRegistry.ensureRuleTypeEnabled(rule.alertTypeId);
      } catch (err) {
        throw createTaskRunError(
          new ErrorWithReason(RuleExecutionStatusErrorReasons.License, err),
          TaskErrorSource.USER
        );
      }

      let validatedParams: RuleTypeParams;
      try {
        validatedParams = validateRuleTypeParams<RuleTypeParams>(
          rule.params,
          ruleType.validate.params
        );
      } catch (err) {
        throw createTaskRunError(
          new ErrorWithReason(RuleExecutionStatusErrorReasons.Validate, err),
          TaskErrorSource.USER
        );
      }

      if (apm.currentTransaction) {
        apm.currentTransaction.name = `Execute Backfill for Alerting Rule`;
      }

      addSpanLabels({
        alerting_rule_space_id: spaceId,
        alerting_rule_id: rule.id,
        alerting_rule_consumer: rule.consumer,
        alerting_rule_name: rule.name,
        alerting_rule_tags: rule.tags.join(', '),
        alerting_rule_type_id: rule.alertTypeId,
        alerting_rule_params: JSON.stringify(rule.params),
      });

      if (startedAt) {
        // Capture how long it took for the task to start running after being claimed
        this.timer.setDuration(TaskRunnerTimerSpan.StartTaskRun, startedAt);
      }

      // Determine which schedule entry we're going to run
      // Find the first index where the status is pending
      this.adHocRunSchedule = schedule;
      this.adHocRange = { start, end };
      this.scheduleToRunIndex = (this.adHocRunSchedule ?? []).findIndex(
        (s: AdHocRunSchedule) => s.status === adHocRunStatus.PENDING
      );
      if (this.scheduleToRunIndex > -1) {
        this.logger.debug(
          `Executing ad hoc run for rule ${ruleType.id}:${rule.id} for runAt ${
            this.adHocRunSchedule[this.scheduleToRunIndex].runAt
          }`
        );
        this.adHocRunSchedule[this.scheduleToRunIndex].status = adHocRunStatus.RUNNING;
        this.taskRunning.start(
          adHocRunParamsId,
          schedule,
          this.context.spaceIdToNamespace(spaceId)
        );
      }

      // Generate fake request with API key
      const { fakeRequest } = getFakeKibanaRequest(this.context, spaceId, apiKeyToUse, {
        ruleId: rule.id,
      });

      return {
        adHocRunData,
        fakeRequest,
        scheduleToRun:
          this.scheduleToRunIndex > -1 ? this.adHocRunSchedule[this.scheduleToRunIndex] : null,
        validatedParams,
      };
    });
  }

  private async processAdHocRunResults(runRuleResult: Result<RunRuleResult, Error>) {
    const {
      params: { adHocRunParamsId, spaceId },
      startedAt,
    } = this.taskInstance;
    const namespace = this.context.spaceIdToNamespace(spaceId);

    const result = await this.timer.runWithTimer(TaskRunnerTimerSpan.ProcessRuleRun, async () => {
      const { executionStatus, executionMetrics, outcome } = processRunResults({
        result: this.ruleResult,
        runDate: this.runDate,
        runRuleResult,
      });

      if (!isOk(runRuleResult)) {
        const error = this.stackTraceLog ? this.stackTraceLog.message : runRuleResult.error;
        const stack = this.stackTraceLog
          ? this.stackTraceLog.stackTrace
          : runRuleResult.error.stack;
        const message = `Executing ad hoc run with id "${adHocRunParamsId}" has resulted in Error: ${getEsErrorMessage(
          error
        )} - ${stack ?? ''}`;
        const tags = [adHocRunParamsId, 'rule-ad-hoc-run-failed'];
        if (this.ruleTypeId.length > 0) {
          tags.push(this.ruleTypeId);
        }
        if (this.ruleId.length > 0) {
          tags.push(this.ruleId);
        }
        this.logger.error(message, { tags, error: { stack_trace: stack } });
      }

      if (apm.currentTransaction) {
        apm.currentTransaction.setOutcome(outcome);
        apm.setCustomContext({
          execution_outcome: {
            ...this.ruleMonitoring.getExecutorMetrics(),
            error: executionStatus.error,
            warning: executionStatus.warning,
          },
        });
      }

      // set start and duration based on event log
      const { start, duration } = this.alertingEventLogger.getStartAndDuration();
      if (null != start) {
        executionStatus.lastExecutionDate = start;
      }
      if (null != duration) {
        executionStatus.lastDuration = nanosToMillis(duration);
      }

      if (executionMetrics) {
        this.ruleMonitoring.addFrameworkMetrics({
          total_search_duration_ms: executionMetrics.totalSearchDurationMs,
        });
      }

      if (this.scheduleToRunIndex > -1) {
        let updatedStatus: AdHocRunStatus = adHocRunStatus.COMPLETE;
        if (this.cancelled) {
          updatedStatus = adHocRunStatus.TIMEOUT;
        } else if (outcome === 'failure') {
          updatedStatus = adHocRunStatus.ERROR;
        }
        this.adHocRunSchedule[this.scheduleToRunIndex].status = updatedStatus;
      }

      // If execution failed due to decrypt error, we should stop running the task
      // If the user wants to rerun it, they can reschedule
      // In the future, we can consider saving the task in an error state when we
      // have one or both of the following abilities
      // - ability to rerun a failed ad hoc run
      // - ability to clean up failed ad hoc runs (either manually or automatically)
      this.shouldDeleteTask =
        executionStatus.status === 'error' &&
        (executionStatus?.error?.reason === RuleExecutionStatusErrorReasons.Decrypt ||
          executionStatus?.error?.reason === RuleExecutionStatusErrorReasons.Read ||
          executionStatus?.error?.reason === RuleExecutionStatusErrorReasons.License ||
          executionStatus?.error?.reason === RuleExecutionStatusErrorReasons.Validate);

      await this.updateAdHocRunSavedObjectPostRun(adHocRunParamsId, namespace, {
        ...(this.shouldDeleteTask ? { status: adHocRunStatus.ERROR } : {}),
        ...(this.scheduleToRunIndex > -1 ? { schedule: this.adHocRunSchedule } : {}),
      });

      if (startedAt) {
        // Capture how long it took for the rule to run after being claimed
        this.timer.setDuration(TaskRunnerTimerSpan.TotalRunDuration, startedAt);
      }

      return {
        executionStatus,
        executionMetrics,
        consumerExecutionMetrics: this.ruleMonitoring.getExecutorMetrics(),
      };
    });
    this.alertingEventLogger.done({
      status: result.executionStatus,
      metrics: result.executionMetrics,
      consumerMetrics: result.consumerExecutionMetrics,
      // in the future if we have other types of ad hoc runs (like preview)
      // we can differentiate and pass in different info
      backfill: {
        id: adHocRunParamsId,
        start:
          this.scheduleToRunIndex > -1
            ? this.adHocRunSchedule[this.scheduleToRunIndex].runAt
            : undefined,
        interval:
          this.scheduleToRunIndex > -1
            ? this.adHocRunSchedule[this.scheduleToRunIndex].interval
            : undefined,
      },
      timings: this.timer.toJson(),
    });
  }

  private hasAnyPendingRuns(): boolean {
    let hasPendingRuns = false;
    const anyPendingRuns = this.adHocRunSchedule.findIndex(
      (s: AdHocRunSchedule) => s.status === adHocRunStatus.PENDING
    );
    if (anyPendingRuns > -1) {
      hasPendingRuns = true;
    }
    return hasPendingRuns;
  }

  async run(): Promise<RunResult> {
    let runRuleResult: Result<RunRuleResult, Error>;

    try {
      const runParams = await this.prepareToRun();
      runRuleResult = asOk({ metrics: await this.runRule(runParams), state: {} });
    } catch (err) {
      runRuleResult = asErr(err);
    }
    await this.processAdHocRunResults(runRuleResult);

    this.shouldDeleteTask = this.shouldDeleteTask || !this.hasAnyPendingRuns();

    return {
      state: {},
      ...(this.shouldDeleteTask ? {} : { runAt: new Date() }),
    };
  }

  async cancel(): Promise<void> {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.searchAbortController.abort();
    this.ruleTypeRunner.cancelRun();

    // Write event log entry
    const {
      params: { adHocRunParamsId },
      timeoutOverride,
    } = this.taskInstance;

    this.logger.debug(
      `Cancelling execution for ad hoc run with id ${adHocRunParamsId} for rule type ${this.ruleTypeId} with id ${this.ruleId} - execution exceeded rule type timeout of ${timeoutOverride}`
    );
    this.logger.debug(
      `Aborting any in-progress ES searches for rule type ${this.ruleTypeId} with id ${this.ruleId}`
    );
    this.alertingEventLogger.logTimeout({
      backfill: {
        id: adHocRunParamsId,
        start:
          this.scheduleToRunIndex > -1
            ? this.adHocRunSchedule[this.scheduleToRunIndex].runAt
            : undefined,
        interval:
          this.scheduleToRunIndex > -1
            ? this.adHocRunSchedule[this.scheduleToRunIndex].interval
            : undefined,
      },
    });
    this.shouldDeleteTask = !this.hasAnyPendingRuns();

    // cleanup function is not called for timed out tasks
    await this.cleanup();
  }

  async cleanup() {
    if (!this.shouldDeleteTask) return;

    try {
      await this.internalSavedObjectsRepository.delete(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        this.taskInstance.params.adHocRunParamsId,
        {
          refresh: true,
          namespace: this.context.spaceIdToNamespace(this.taskInstance.params.spaceId),
        }
      );

      await this.updateGapsAfterBackfillComplete();
    } catch (e) {
      // Log error only, we shouldn't fail the task because of an error here (if ever there's retry logic)
      this.logger.error(
        `Failed to cleanup ${AD_HOC_RUN_SAVED_OBJECT_TYPE} object [id="${this.taskInstance.params.adHocRunParamsId}"]: ${e.message}`
      );
    }
  }

  private async updateGapsAfterBackfillComplete() {
    if (this.scheduleToRunIndex < 0 || !this.adHocRange) return null;

    const { fakeRequest } = getFakeKibanaRequest(
      this.context,
      this.taskInstance.params.spaceId,
      this.apiKeyToUse,
      { ruleId: this.ruleId }
    );

    const eventLogClient = await this.context.getEventLogClient(fakeRequest);
    const actionsClient = await this.context.actionsPlugin.getActionsClientWithRequest(fakeRequest);
    return updateGaps({
      ruleId: this.ruleId,
      start: new Date(this.adHocRange.start),
      end: this.adHocRange.end ? new Date(this.adHocRange.end) : new Date(),
      eventLogger: this.context.eventLogger,
      eventLogClient,
      logger: this.logger,
      backfillSchedule: this.adHocRunSchedule,
      savedObjectsRepository: this.internalSavedObjectsRepository,
      backfillClient: this.context.backfillClient,
      actionsClient,
      initiator: this.adHocRunData?.initiator,
    });
  }

  private shouldLogAndScheduleActionsForAlerts(ruleType: UntypedNormalizedRuleType) {
    // if execution hasn't been cancelled, return true
    if (!this.cancelled) {
      return true;
    }

    // if execution has been cancelled, return true if EITHER alerting config or rule type indicate to proceed with scheduling actions
    return !this.context.cancelAlertsOnRuleTimeout || !ruleType.cancelAlertsOnRuleTimeout;
  }
}
