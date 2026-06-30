/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import apm from 'elastic-apm-node';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { ISavedObjectsRepository, Logger } from '@kbn/core/server';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { addSpanLabels } from '@kbn/apm-utils';
import { nanosToMillis } from '@kbn/event-log-plugin/server';
import { ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/elastic-assistant-common';
import { ActionScheduler, type RunResult } from './action_scheduler';
import type {
  RuleRunnerErrorStackTraceLog,
  RuleTaskInstance,
  RuleTaskRunResult,
  RunRuleResult,
  RunRuleParams,
  TaskRunnerContext,
} from './types';
import { getDeleteRuleTaskRunResult } from './types';
import { getExecutorServices } from './get_executor_services';
import { getNextRun, isRuleSnoozed, ruleExecutionStatusToRaw } from '../lib';
import type {
  IntervalSchedule,
  RawRuleExecutionStatus,
  RawRuleLastRun,
  RawRuleMonitoring,
  RuleExecutionStatus,
  RuleTypeRegistry,
} from '../types';
import type { RawRuleSnoozedInstance } from '../saved_objects/schemas/raw_rule';
import { RuleExecutionStatusErrorReasons } from '../types';
import type { Result } from '../lib/result_type';
import { asErr, asOk, isOk } from '../lib/result_type';
import { taskInstanceToAlertTaskInstance } from './alert_task_instance';
import {
  atomicRemoveSnoozedInstancesWithEs,
  partiallyUpdateRuleWithEs,
  RULE_SAVED_OBJECT_TYPE,
} from '../saved_objects';
import { AlertAuditAction, alertAuditSystemEvent } from '../lib/alert_audit_events';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  RawAlertInstance,
  RuleAlertData,
  RuleTypeParams,
  RuleTypeState,
} from '../../common';
import { RuleLastRunOutcomeOrderMap } from '../../common';
import type { RuleMonitoringLastRunMetrics, GapReason } from '../../common';
import type { NormalizedRuleType, UntypedNormalizedRuleType } from '../rule_type_registry';
import type { InMemoryMetrics } from '../monitoring';
import { IN_MEMORY_METRICS } from '../monitoring';
import { RuleRunMetricsStore } from '../lib/rule_run_metrics_store';
import { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import { getDecryptedRule, validateRuleAndCreateFakeRequest } from './rule_loader';
import { TaskRunnerTimer, TaskRunnerTimerSpan } from './task_runner_timer';
import { RuleMonitoringService } from '../monitoring/rule_monitoring_service';
import { lastRunToRaw } from '../lib/last_run_status';
import { RuleRunningHandler } from './rule_running_handler';
import { RuleResultService } from '../monitoring/rule_result_service';
import { RuleTypeRunner } from './rule_type_runner';
import { initializeAlertsClient } from '../alerts_client';
import type { AlertsToUpdateWithLastScheduledActions } from '../alerts_client/types';
import {
  createTaskRunnerLogger,
  withAlertingSpan,
  processRunResults,
  clearExpiredSnoozes,
  getSchedule,
  getState,
  getTaskRunError,
  evaluatePerAlertSnoozeExpiry,
  evaluatePerAlertSnoozeConditions,
} from './lib';
import {
  ErrorWithType,
  isOutdatedTaskVersionError,
  OUTDATED_TASK_VERSION,
} from '../lib/error_with_type';

const FALLBACK_RETRY_INTERVAL = '5m';

interface TaskRunnerConstructorParams<
  Params extends RuleTypeParams,
  ExtractedParams extends RuleTypeParams,
  RuleState extends RuleTypeState,
  AlertState extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string,
  AlertData extends RuleAlertData
> {
  context: TaskRunnerContext;
  inMemoryMetrics: InMemoryMetrics;
  internalSavedObjectsRepository: ISavedObjectsRepository;
  ruleType: NormalizedRuleType<
    Params,
    ExtractedParams,
    RuleState,
    AlertState,
    Context,
    ActionGroupIds,
    RecoveryActionGroupId,
    AlertData
  >;
  taskInstance: ConcreteTaskInstance;
  executionUuid: string;
}

export class TaskRunner<
  Params extends RuleTypeParams,
  ExtractedParams extends RuleTypeParams,
  RuleState extends RuleTypeState,
  AlertState extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string,
  AlertData extends RuleAlertData
> {
  private context: TaskRunnerContext;
  private logger: Logger;
  private taskInstance: RuleTaskInstance;
  private ruleConsumer: string | null;
  private ruleType: NormalizedRuleType<
    Params,
    ExtractedParams,
    RuleState,
    AlertState,
    Context,
    ActionGroupIds,
    RecoveryActionGroupId,
    AlertData
  >;
  private readonly executionId: string;
  private readonly ruleTypeRegistry: RuleTypeRegistry;
  private readonly inMemoryMetrics: InMemoryMetrics;
  private readonly internalSavedObjectsRepository: ISavedObjectsRepository;
  private timer: TaskRunnerTimer;
  private alertingEventLogger: AlertingEventLogger;
  private usageCounter?: UsageCounter;
  private searchAbortController: AbortController;
  private cancelled: boolean;
  private stackTraceLog: RuleRunnerErrorStackTraceLog | null;
  private ruleMonitoring: RuleMonitoringService;
  private ruleRunning: RuleRunningHandler;
  private ruleResult: RuleResultService;
  private ruleTypeRunner: RuleTypeRunner<
    Params,
    ExtractedParams,
    RuleState,
    AlertState,
    Context,
    ActionGroupIds,
    RecoveryActionGroupId,
    AlertData
  >;
  private runDate = new Date();

  constructor({
    context,
    inMemoryMetrics,
    internalSavedObjectsRepository,
    ruleType,
    taskInstance,
    executionUuid,
  }: TaskRunnerConstructorParams<
    Params,
    ExtractedParams,
    RuleState,
    AlertState,
    Context,
    ActionGroupIds,
    RecoveryActionGroupId,
    AlertData
  >) {
    this.context = context;
    const loggerId = ruleType.id.startsWith('.') ? ruleType.id.substring(1) : ruleType.id;
    this.logger = context.logger.get(loggerId);
    this.usageCounter = context.usageCounter;
    this.ruleType = ruleType;
    this.ruleConsumer = null;
    this.taskInstance = taskInstanceToAlertTaskInstance(taskInstance);
    this.ruleTypeRegistry = context.ruleTypeRegistry;
    this.searchAbortController = new AbortController();
    this.cancelled = false;
    this.executionId = executionUuid;
    this.inMemoryMetrics = inMemoryMetrics;
    this.internalSavedObjectsRepository = internalSavedObjectsRepository;
    this.timer = new TaskRunnerTimer({ logger: this.logger });
    this.alertingEventLogger = new AlertingEventLogger(this.context.eventLogger);
    this.stackTraceLog = null;
    this.ruleMonitoring = new RuleMonitoringService();
    this.ruleRunning = new RuleRunningHandler(
      this.internalSavedObjectsRepository,
      this.logger,
      loggerId
    );
    this.ruleTypeRunner = new RuleTypeRunner<
      Params,
      ExtractedParams,
      RuleState,
      AlertState,
      Context,
      ActionGroupIds,
      RecoveryActionGroupId,
      AlertData
    >({
      context: this.context,
      task: this.taskInstance,
      timer: this.timer,
    });
    this.ruleResult = new RuleResultService();
  }

  /**
   * Persists the post-run rule attributes to Elasticsearch.
   */
  private async updateRuleSavedObjectPostRun(
    ruleId: string,
    attributes: {
      executionStatus?: RawRuleExecutionStatus;
      monitoring?: RawRuleMonitoring;
      nextRun?: string | null;
      lastRun?: RawRuleLastRun | null;
      snoozedInstancesToRemove?: Array<{ instanceId: string; snoozedAt: string }>;
    }
  ): Promise<boolean> {
    const { snoozedInstancesToRemove, ...docAttributes } = attributes;
    const client = this.context.elasticsearch.client.asInternalUser;
    try {
      // Future engineer -> Here we are just checking if we need to wait for
      // the update of the attribute `running` in the rule's saved object
      // and we are swallowing the error because we still want to move forward
      // with the update of our rule since we are putting back the running attribute
      // back to false
      await this.ruleRunning.waitFor();
      // eslint-disable-next-line no-empty
    } catch {}
    try {
      await partiallyUpdateRuleWithEs(
        client,
        ruleId,
        { ...docAttributes, running: false },
        {
          ignore404: true,
          refresh: false,
        }
      );
      if (snoozedInstancesToRemove?.length) {
        // Per-alert snooze expiry is applied via an atomic Painless script.
        await atomicRemoveSnoozedInstancesWithEs(client, ruleId, snoozedInstancesToRemove, {
          ignore404: true,
          refresh: false,
        });
      }
      return true;
    } catch (err) {
      this.logger.error(`error updating rule for ${this.ruleType.id}:${ruleId} ${err.message}`);
      return false;
    }
  }

  private shouldLogAndScheduleActionsForAlerts() {
    // if execution hasn't been cancelled, return true
    if (!this.cancelled) {
      return true;
    }

    // if execution has been cancelled, return true if EITHER alerting config or rule type indicate to proceed with scheduling actions
    return !this.context.cancelAlertsOnRuleTimeout || !this.ruleType.cancelAlertsOnRuleTimeout;
  }

  // Usage counter for telemetry
  // This keeps track of how many times action executions were skipped after rule
  // execution completed successfully after the execution timeout
  // This can occur when rule executors do not short circuit execution in response
  // to timeout
  private countUsageOfActionExecutionAfterRuleCancellation() {
    if (this.cancelled && this.usageCounter) {
      if (this.context.cancelAlertsOnRuleTimeout && this.ruleType.cancelAlertsOnRuleTimeout) {
        // Increment usage counter for skipped actions
        this.usageCounter.incrementCounter({
          counterName: `alertsSkippedDueToRuleExecutionTimeout_${this.ruleType.id}`,
          incrementBy: 1,
        });
      }
    }
  }

  /**
   * Emits one `alert_auto_unsnooze` audit event per per-alert snooze entry that
   * the task runner has just decided to drop, attributed to `System` with the
   * supplied reason. Wrapped defensively so a misconfigured audit sink can never
   * break rule execution; failures are logged at warn level only.
   */
  private logAutoUnsnoozeAuditEvents(
    instances: RawRuleSnoozedInstance[],
    reason: 'ttl_expired' | 'condition_met',
    rule: { id: string; name: string }
  ): void {
    if (instances.length === 0 || !this.context.auditService) {
      return;
    }
    try {
      for (const instance of instances) {
        this.context.auditService.withoutRequest.log(
          alertAuditSystemEvent({
            action: AlertAuditAction.AUTO_UNSNOOZE,
            id: instance.instanceId,
            outcome: 'success',
            reason,
            ruleSavedObject: { type: RULE_SAVED_OBJECT_TYPE, id: rule.id, name: rule.name },
          })
        );
      }
    } catch (e) {
      this.logger.warn(
        `Failed to emit alert_auto_unsnooze audit event(s) for rule [id=${rule.id}]: ${e.message}`
      );
    }
  }

  private async runRule({
    fakeRequest,
    rule,
    effectiveApiKey,
    validatedParams: params,
  }: RunRuleParams<Params>): Promise<RunRuleResult> {
    const { activeInstances, expiredInstances } = evaluatePerAlertSnoozeExpiry(
      rule.snoozedInstances,
      this.runDate
    );

    if (apm.currentTransaction) {
      apm.currentTransaction.name = `Execute Alerting Rule: "${rule.name}"`;
    }

    addSpanLabels({
      alerting_rule_consumer: rule.consumer,
      alerting_rule_name: rule.name,
      alerting_rule_tags: rule.tags.join(', '),
      alerting_rule_type_id: rule.alertTypeId,
      alerting_rule_params: JSON.stringify(rule.params),
    });

    const {
      params: { alertId: ruleId, spaceId },
      state: { previousStartedAt },
    } = this.taskInstance;

    const { queryDelaySettings, flappingSettings: spaceFlappingSettings } =
      await this.context.rulesSettingsService.getSettings(fakeRequest, spaceId);
    const ruleRunMetricsStore = new RuleRunMetricsStore();
    const ruleLabel = `${this.ruleType.id}:${ruleId}: '${rule.name}'`;

    const ruleFlappingSettings = rule.flapping
      ? {
          enabled: true, // default to true if flapping.enabled is undefined
          ...rule.flapping,
        }
      : null;

    const flappingSettings = ruleFlappingSettings || spaceFlappingSettings;

    const ruleTypeRunnerContext = {
      alertingEventLogger: this.alertingEventLogger,
      flappingSettings,
      logger: this.logger,
      maintenanceWindowsService: this.context.maintenanceWindowsService,
      namespace: this.context.spaceIdToNamespace(spaceId),
      queryDelaySec: queryDelaySettings.delay,
      request: fakeRequest,
      ruleId,
      ruleLogPrefix: ruleLabel,
      ruleRunMetricsStore,
      spaceId,
      isServerless: this.context.isServerless,
      shouldGrantUiam: this.context.shouldGrantUiam,
    };
    const alertsClient = await withAlertingSpan('alerting:initialize-alerts-client', () =>
      initializeAlertsClient<
        Params,
        AlertData,
        AlertState,
        Context,
        ActionGroupIds,
        RecoveryActionGroupId
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
          alertDelay: rule.alertDelay,
          params: rule.params,
          muteAll: rule.muteAll,
          mutedInstanceIds: rule.mutedInstanceIds,
          snoozedInstances: activeInstances,
        },
        ruleType: this.ruleType as UntypedNormalizedRuleType,
        startedAt: this.taskInstance.startedAt,
        taskInstance: this.taskInstance,
      })
    );
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
        spaceId,
      },
      ruleTaskTimeout: this.ruleType.ruleTaskTimeout,
    });

    const actionsClient = await this.context.actionsPlugin.getActionsClientWithRequest(fakeRequest);

    const {
      state: updatedRuleTypeState,
      error,
      stackTrace,
    } = await this.ruleTypeRunner.run({
      context: ruleTypeRunnerContext,
      alertsClient,
      actionsClient:
        this.ruleType.id === ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID ? actionsClient : undefined,
      executionId: this.executionId,
      executorServices,
      rule,
      ruleType: this.ruleType,
      startedAt: this.taskInstance.startedAt!,
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

    const alertAsDataByInstanceId = new Map<string, Record<string, unknown>>();
    for (const instance of activeInstances) {
      if (!instance.conditions?.length) {
        continue;
      }
      const data = alertsClient.getBuiltActiveAlertDataByInstanceId(instance.instanceId);
      if (data) {
        alertAsDataByInstanceId.set(instance.instanceId, data);
      }
    }

    const { conditionExpiredInstances } = evaluatePerAlertSnoozeConditions(
      activeInstances,
      alertAsDataByInstanceId
    );

    const conditionExpiredIds = new Set(conditionExpiredInstances.map((i) => i.instanceId));
    const updatedActiveInstances =
      conditionExpiredInstances.length > 0
        ? activeInstances.filter((i) => !conditionExpiredIds.has(i.instanceId))
        : activeInstances;

    // Condition evaluation happens after persistAlerts(), so alerts for condition-expired
    // instances were already written with kibana.alert.snoozed: true. Correct that now.
    if (conditionExpiredInstances.length > 0) {
      await alertsClient.clearSnoozedStatusForAlerts(
        conditionExpiredInstances.map((i) => i.instanceId)
      );
    }

    const actionScheduler = new ActionScheduler({
      rule,
      ruleType: this.ruleType,
      logger: this.logger,
      taskRunnerContext: this.context,
      taskInstance: this.taskInstance,
      ruleRunMetricsStore,
      apiKey: effectiveApiKey,
      ruleConsumer: this.ruleConsumer!,
      executionId: this.executionId,
      ruleLabel,
      previousStartedAt: previousStartedAt ? new Date(previousStartedAt) : null,
      alertingEventLogger: this.alertingEventLogger,
      actionsClient,
      alertsClient,
      activeSnoozedIds: new Set(updatedActiveInstances.map((i) => i.instanceId)),
    });

    let actionSchedulerResult: RunResult = { throttledSummaryActions: {} };

    await withAlertingSpan('alerting:schedule-actions', () =>
      this.timer.runWithTimer(TaskRunnerTimerSpan.TriggerActions, async () => {
        if (isRuleSnoozed(rule)) {
          this.logger.debug(`no scheduling of actions for rule ${ruleLabel}: rule is snoozed.`);
        } else if (!this.shouldLogAndScheduleActionsForAlerts()) {
          this.logger.debug(
            `no scheduling of actions for rule ${ruleLabel}: rule execution has been cancelled.`
          );
          this.countUsageOfActionExecutionAfterRuleCancellation();
        } else {
          actionSchedulerResult = await actionScheduler.run({
            activeAlerts: alertsClient.getProcessedAlerts('active'),
            recoveredAlerts: alertsClient.getProcessedAlerts('recovered'),
          });
        }
      })
    );

    let alertsToReturn: Record<string, RawAlertInstance> = {};
    let recoveredAlertsToReturn: Record<string, RawAlertInstance> = {};
    let alertsToUpdateWithLastScheduledActions: AlertsToUpdateWithLastScheduledActions = {};

    // Only serialize alerts into task state if we're auto-recovering, otherwise
    // we don't need to keep this information around.
    if (this.ruleType.autoRecoverAlerts) {
      const alerts = alertsClient.getRawAlertInstancesForState(true);
      alertsToReturn = alerts.rawActiveAlerts;
      recoveredAlertsToReturn = alerts.rawRecoveredAlerts;
      alertsToUpdateWithLastScheduledActions =
        alertsClient.getAlertsToUpdateWithLastScheduledActions();
    }

    if (this.shouldLogAndScheduleActionsForAlerts()) {
      await withAlertingSpan('alerting:update-alerts', () =>
        this.timer.runWithTimer(TaskRunnerTimerSpan.UpdateAlerts, async () => {
          await alertsClient.updatePersistedAlerts({
            alertsToUpdateWithLastScheduledActions,
            alertsToUpdateWithMaintenanceWindows,
          });
        })
      );
    } else {
      this.logger.debug(
        `skipping updating alerts for rule ${ruleTypeRunnerContext.ruleLogPrefix}: rule execution has been cancelled.`
      );
    }

    return {
      metrics: ruleRunMetricsStore.getMetrics(),
      state: {
        alertTypeState: updatedRuleTypeState || undefined,
        alertInstances: alertsToReturn,
        alertRecoveredInstances: recoveredAlertsToReturn,
        summaryActions: actionSchedulerResult.throttledSummaryActions,
      },
      expiredSnoozedInstances:
        expiredInstances.length > 0 || conditionExpiredInstances.length > 0
          ? [
              ...expiredInstances.map((i) => ({
                instanceId: i.instanceId,
                snoozedAt: i.snoozedAt,
              })),
              ...conditionExpiredInstances.map((i) => ({
                instanceId: i.instanceId,
                snoozedAt: i.snoozedAt,
              })),
            ]
          : undefined,
      ...(expiredInstances.length > 0 || conditionExpiredInstances.length > 0
        ? {
            autoUnsnoozeAudit: {
              expired: expiredInstances,
              conditionExpired: conditionExpiredInstances,
              ruleName: rule.name,
            },
          }
        : {}),
    };
  }

  /**
   * Before we actually run the rule:
   * - start the RunningHandler
   * - initialize the event logger
   * - if rule data not loaded, load it
   * - set the current APM transaction info
   * - validate that rule type is enabled and params are valid
   * - initialize monitoring data
   * - clear expired snoozes
   */
  private async prepareToRun(): Promise<RunRuleParams<Params>> {
    return await this.timer.runWithTimer(TaskRunnerTimerSpan.PrepareRule, async () => {
      const {
        params: { alertId: ruleId, spaceId, consumer },
        startedAt,
      } = this.taskInstance;

      // Initially use consumer as stored inside the task instance
      // This allows us to populate a consumer value for event log
      // `execute-start` events (which are indexed before the rule SO is read)
      // and in the event of decryption errors (where we cannot read the rule SO)
      // Because "consumer" is set when a rule is created, this value should be static
      // for the life of a rule but there may be edge cases where migrations cause
      // the consumer values to become out of sync.
      if (consumer) {
        this.ruleConsumer = consumer;
      }

      // Start the event logger so that something is logged in the
      // event that rule SO decryption fails.
      const namespace = this.context.spaceIdToNamespace(spaceId);
      this.alertingEventLogger.initialize({
        context: {
          savedObjectId: ruleId,
          savedObjectType: RULE_SAVED_OBJECT_TYPE,
          spaceId,
          executionId: this.executionId,
          taskScheduledAt: this.taskInstance.scheduledAt,
          ...(namespace ? { namespace } : {}),
        },
        runDate: this.runDate,
        ruleData: {
          id: ruleId,
          type: this.ruleType as UntypedNormalizedRuleType,
          consumer: this.ruleConsumer!,
        },
      });

      if (apm.currentTransaction) {
        apm.currentTransaction.name = `Execute Alerting Rule`;
      }

      addSpanLabels({
        alerting_rule_space_id: spaceId,
        alerting_rule_id: ruleId,
        plugins: 'alerting',
      });

      this.ruleRunning.start(ruleId, this.context.spaceIdToNamespace(spaceId));

      this.logger.debug(
        `executing rule ${this.ruleType.id}:${ruleId} at ${this.runDate.toISOString()}`
      );

      if (startedAt) {
        // Capture how long it took for the rule to start running after being claimed
        this.timer.setDuration(TaskRunnerTimerSpan.StartTaskRun, startedAt);
      }

      const ruleData = await withAlertingSpan('alerting:get-decrypted-rule', () =>
        getDecryptedRule(this.context, ruleId, spaceId)
      );

      // Check that this task is current
      const scheduledTaskId = ruleData.rawRule.scheduledTaskId;
      if (this.taskInstance.id !== ruleId && this.taskInstance.id !== scheduledTaskId) {
        throw new ErrorWithType({
          message: 'The task ID does not match the rule ID',
          type: OUTDATED_TASK_VERSION,
        });
      }

      const runRuleParams = validateRuleAndCreateFakeRequest({
        ruleData,
        paramValidator: this.ruleType.validate.params,
        ruleId,
        spaceId,
        logger: this.logger,
        context: this.context,
        ruleTypeRegistry: this.ruleTypeRegistry,
      });

      // Update the consumer
      this.ruleConsumer = runRuleParams.rule.consumer;

      // Update the rule data in event logger
      this.alertingEventLogger.addOrUpdateRuleData({
        name: runRuleParams.rule.name,
        consumer: runRuleParams.rule.consumer,
        revision: runRuleParams.rule.revision,
        uuid:
          this.ruleType.solution === 'security' &&
          typeof runRuleParams.rule.params.ruleId === 'string'
            ? runRuleParams.rule.params.ruleId
            : undefined,
      });

      // Set rule monitoring data
      this.ruleMonitoring.setMonitoring(runRuleParams.rule.monitoring);

      // Clear gap data that was persisted in the rule SO from previous run
      if (this.ruleMonitoring.getMonitoring()?.run?.last_run?.metrics?.gap_range) {
        this.ruleMonitoring.getSetters().clearGap();
      }
      (async () => {
        try {
          await clearExpiredSnoozes({
            esClient: this.context.elasticsearch.client.asInternalUser,
            logger: this.logger,
            rule: runRuleParams.rule,
            version: runRuleParams.version,
          });
        } catch (e) {
          // Most likely a 409 conflict error, which is ok, we'll try again at the next rule run
          this.logger.debug(`Failed to clear expired snoozes: ${e.message}`);
        }
      })().catch(() => {});

      return runRuleParams;
    });
  }

  private async processRunResults({
    schedule,
    runRuleResult,
  }: {
    schedule: Result<IntervalSchedule, Error>;
    runRuleResult: Result<RunRuleResult, Error>;
  }) {
    const result = await this.timer.runWithTimer(TaskRunnerTimerSpan.ProcessRuleRun, async () => {
      const {
        params: { alertId: ruleId },
        startedAt,
        schedule: taskSchedule,
      } = this.taskInstance;

      let nextRun: string | null = null;
      if (isOk(schedule)) {
        nextRun = getNextRun({ startDate: startedAt, interval: schedule.value.interval });
      } else if (taskSchedule) {
        // rules cannot use rrule for scheduling yet
        nextRun = getNextRun({ startDate: startedAt, interval: taskSchedule.interval });
      }

      const { executionStatus, executionMetrics, lastRun, outcome } = processRunResults({
        logger: this.logger,
        logPrefix: `${this.ruleType.id}:${ruleId}`,
        result: this.ruleResult,
        runDate: this.runDate,
        runRuleResult,
      });

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

      // if executionStatus indicates an error, fill in fields in
      this.ruleMonitoring.addHistory({
        duration: executionStatus.lastDuration,
        hasError: executionStatus.error != null,
        runDate: this.runDate,
      });

      // In case of non-success outcome framework calculated metrics could be incomplete
      // Instead of including numbers without clear interpretation omit them
      if (executionMetrics && lastRun.outcome === 'succeeded') {
        this.ruleMonitoring.addFrameworkMetrics({
          total_search_duration_ms: executionMetrics.totalSearchDurationMs,
        });
      }

      const { gap_range: gapRange, gap_reason: gapReasonValue } =
        (this.ruleMonitoring.getMonitoring()?.run?.last_run
          ?.metrics as RuleMonitoringLastRunMetrics) ?? {};
      if (gapRange) {
        this.alertingEventLogger.reportGap({
          gap: gapRange,
          reason: (gapReasonValue as GapReason) ?? undefined,
        });
      }

      const expiredSnoozedInstances = isOk(runRuleResult)
        ? runRuleResult.value.expiredSnoozedInstances
        : undefined;
      const autoUnsnoozeAudit = isOk(runRuleResult)
        ? runRuleResult.value.autoUnsnoozeAudit
        : undefined;

      if (!this.cancelled) {
        this.inMemoryMetrics.increment(IN_MEMORY_METRICS.RULE_EXECUTIONS);
        if (outcome === 'failure') {
          this.inMemoryMetrics.increment(IN_MEMORY_METRICS.RULE_FAILURES);
        }
        if (this.logger.isLevelEnabled('debug')) {
          this.logger.debug(
            `Updating rule task for ${this.ruleType.id} rule with id ${ruleId} - ${JSON.stringify(
              executionStatus
            )} - ${JSON.stringify(lastRun)}`
          );
        }

        const updatePersisted = await this.updateRuleSavedObjectPostRun(ruleId, {
          executionStatus: ruleExecutionStatusToRaw(executionStatus),
          nextRun,
          lastRun: lastRunToRaw(lastRun),
          monitoring: this.ruleMonitoring.getMonitoring() as RawRuleMonitoring,
          ...(expiredSnoozedInstances !== undefined
            ? { snoozedInstancesToRemove: expiredSnoozedInstances }
            : {}),
        });

        // Only emit `alert_auto_unsnooze` events after the SO update.
        if (updatePersisted && autoUnsnoozeAudit !== undefined) {
          const ruleRef = { id: ruleId, name: autoUnsnoozeAudit.ruleName };
          this.logAutoUnsnoozeAuditEvents(autoUnsnoozeAudit.expired, 'ttl_expired', ruleRef);
          this.logAutoUnsnoozeAuditEvents(
            autoUnsnoozeAudit.conditionExpired,
            'condition_met',
            ruleRef
          );
        }
      }

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
      timings: this.timer.toJson(),
    });
  }

  async run(): Promise<RuleTaskRunResult> {
    this.runDate = new Date();
    const {
      params: { alertId: ruleId, spaceId },
      startedAt,
      state: originalState,
      schedule: taskSchedule,
    } = this.taskInstance;

    this.logger = createTaskRunnerLogger({ logger: this.logger, tags: [ruleId, this.ruleType.id] });

    let runRuleResult: Result<RunRuleResult, Error>;
    let schedule: Result<IntervalSchedule, Error>;
    let shouldDisableTask = false;
    try {
      const validatedRuleData = await this.prepareToRun();

      runRuleResult = asOk(
        await withAlertingSpan('alerting:run', () => this.runRule(validatedRuleData))
      );

      schedule = asOk(validatedRuleData.rule.schedule);
    } catch (err) {
      if (isOutdatedTaskVersionError(err)) {
        this.logger.info(
          `Outdated task version: The task instance ID: ${this.taskInstance.id} does not match the rule ID: ${ruleId}.`
        );
        return getDeleteRuleTaskRunResult();
      }

      runRuleResult = asErr(err);
      schedule = asErr(err);
      shouldDisableTask = err.reason === RuleExecutionStatusErrorReasons.Disabled;
    }

    await withAlertingSpan('alerting:process-run-results-and-update-rule', () =>
      this.processRunResults({ schedule, runRuleResult })
    );

    return {
      state: getState({
        runRuleResult,
        startedAt,
        ruleId,
        spaceId,
        ruleTypeId: this.ruleType.id,
        logger: this.logger,
        stackTraceLog: this.stackTraceLog,
        originalState,
      }),
      schedule: getSchedule({
        schedule,
        ruleId,
        spaceId,
        retryInterval: taskSchedule?.interval ?? FALLBACK_RETRY_INTERVAL,
        logger: this.logger,
      }),
      ...getTaskRunError({
        runRuleResult,
        logger: this.logger,
        ruleResult: this.ruleResult,
        ruleTypeId: this.ruleType.id,
        ruleId,
      }),
      // added this way so we don't add shouldDisableTask: false explicitly
      ...(shouldDisableTask ? { shouldDisableTask } : {}),
    };
  }

  async cancel(): Promise<void> {
    if (this.cancelled) {
      return;
    }

    this.cancelled = true;
    this.ruleTypeRunner.cancelRun();

    // Write event log entry
    const {
      params: { alertId: ruleId, consumer },
      schedule: taskSchedule,
      startedAt,
    } = this.taskInstance;

    if (consumer && !this.ruleConsumer) {
      this.ruleConsumer = consumer;
    }

    this.logger.debug(
      `Cancelling rule type ${this.ruleType.id} with id ${ruleId} - execution exceeded rule type timeout of ${this.ruleType.ruleTaskTimeout}`
    );

    this.logger.debug(
      `Aborting any in-progress ES searches for rule type ${this.ruleType.id} with id ${ruleId}`
    );
    this.searchAbortController.abort();

    this.alertingEventLogger.logTimeout();

    this.inMemoryMetrics.increment(IN_MEMORY_METRICS.RULE_TIMEOUTS);

    let nextRun: string | null = null;
    if (taskSchedule) {
      // rules cannot use rrule for scheduling yet
      nextRun = getNextRun({ startDate: startedAt, interval: taskSchedule.interval });
    }

    const outcomeMsg = [
      `${this.ruleType.id}:${ruleId}: execution cancelled due to timeout - exceeded rule type timeout of ${this.ruleType.ruleTaskTimeout}`,
    ];
    const date = new Date();
    // Update the rule saved object with execution status
    const executionStatus: RuleExecutionStatus = {
      lastExecutionDate: date,
      status: 'error',
      error: {
        reason: RuleExecutionStatusErrorReasons.Timeout,
        message: outcomeMsg.join(' '),
      },
    };
    this.logger.debug(
      `Updating rule task for ${this.ruleType.id} rule with id ${ruleId} - execution error due to timeout`
    );
    const outcome = 'failed';
    await this.updateRuleSavedObjectPostRun(ruleId, {
      executionStatus: ruleExecutionStatusToRaw(executionStatus),
      lastRun: {
        outcome,
        outcomeOrder: RuleLastRunOutcomeOrderMap[outcome],
        warning: RuleExecutionStatusErrorReasons.Timeout,
        outcomeMsg,
        alertsCount: {},
      },
      monitoring: this.ruleMonitoring.getMonitoring() as RawRuleMonitoring,
      nextRun: nextRun && new Date(nextRun).getTime() > date.getTime() ? nextRun : null,
    });
  }
}
