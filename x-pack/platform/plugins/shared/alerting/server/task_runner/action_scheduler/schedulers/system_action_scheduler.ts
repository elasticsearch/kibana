/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertInstanceState, AlertInstanceContext } from '@kbn/alerting-state-types';
import type { RuleSystemAction, RuleTypeParams } from '@kbn/alerting-types';
import type { CombinedSummarizedAlerts } from '../../../types';
import type { RuleTypeState, RuleAlertData } from '../../../../common';
import type { GetSummarizedAlertsParams } from '../../../alerts_client/types';
import {
  buildRuleUrl,
  formatActionToEnqueue,
  getSummarizedAlerts,
  shouldScheduleAction,
} from '../lib';
import type {
  ActionSchedulerOptions,
  ActionsToSchedule,
  GetActionsToScheduleOpts,
  IActionScheduler,
} from '../types';

export class SystemActionScheduler<
  Params extends RuleTypeParams,
  ExtractedParams extends RuleTypeParams,
  RuleState extends RuleTypeState,
  State extends AlertInstanceState,
  Context extends AlertInstanceContext,
  ActionGroupIds extends string,
  RecoveryActionGroupId extends string,
  AlertData extends RuleAlertData
> implements IActionScheduler<State, Context, ActionGroupIds, RecoveryActionGroupId>
{
  private actions: RuleSystemAction[] = [];
  private snoozedAlertIdsSet: Set<string> = new Set();

  constructor(
    private readonly context: ActionSchedulerOptions<
      Params,
      ExtractedParams,
      RuleState,
      State,
      Context,
      ActionGroupIds,
      RecoveryActionGroupId,
      AlertData
    >
  ) {
    const canGetSummarizedAlerts =
      !!context.ruleType.alerts && !!context.alertsClient.getSummarizedAlerts;

    this.snoozedAlertIdsSet = context.activeSnoozedIds ?? new Set();

    // only process system actions when rule type supports summarized alerts
    this.actions = canGetSummarizedAlerts ? context.rule.systemActions ?? [] : [];
  }

  public get priority(): number {
    return 1;
  }

  public async getActionsToSchedule(
    _: GetActionsToScheduleOpts<State, Context, ActionGroupIds, RecoveryActionGroupId>
  ): Promise<ActionsToSchedule[]> {
    const executables: Array<{
      action: RuleSystemAction;
      summarizedAlerts: CombinedSummarizedAlerts;
    }> = [];
    const results: ActionsToSchedule[] = [];

    for (const action of this.actions) {
      const options: GetSummarizedAlertsParams = {
        spaceId: this.context.taskInstance.params.spaceId,
        ruleId: this.context.rule.id,
        excludedAlertInstanceIds: [
          ...this.context.rule.mutedInstanceIds,
          ...this.snoozedAlertIdsSet,
        ],
        executionUuid: this.context.executionId,
      };

      const summarizedAlerts = await getSummarizedAlerts({
        queryOptions: options,
        alertsClient: this.context.alertsClient,
      });

      if (summarizedAlerts && summarizedAlerts.all.count !== 0) {
        executables.push({ action, summarizedAlerts });
      }
    }

    if (executables.length === 0) return [];

    this.context.ruleRunMetricsStore.incrementNumberOfGeneratedActions(executables.length);

    const ruleUrl = buildRuleUrl({
      getViewInAppRelativeUrl: this.context.ruleType.getViewInAppRelativeUrl,
      kibanaBaseUrl: this.context.taskRunnerContext.kibanaBaseUrl,
      logger: this.context.logger,
      rule: this.context.rule,
      spaceId: this.context.taskInstance.params.spaceId,
    });

    for (const { action, summarizedAlerts } of executables) {
      const { actionTypeId } = action;

      if (
        !shouldScheduleAction({
          action,
          actionsConfigMap: this.context.taskRunnerContext.actionsConfigMap,
          isActionExecutable: this.context.taskRunnerContext.actionsPlugin.isActionExecutable,
          logger: this.context.logger,
          ruleId: this.context.rule.id,
          ruleRunMetricsStore: this.context.ruleRunMetricsStore,
        })
      ) {
        continue;
      }

      const hasConnectorAdapter = this.context.taskRunnerContext.connectorAdapterRegistry.has(
        action.actionTypeId
      );

      // System actions without an adapter cannot be executed
      if (!hasConnectorAdapter) {
        this.context.logger.warn(
          `Rule "${this.context.rule.id}" skipped scheduling system action "${action.id}" because no connector adapter is configured`
        );

        continue;
      }

      this.context.ruleRunMetricsStore.incrementNumberOfTriggeredActions();
      this.context.ruleRunMetricsStore.incrementNumberOfTriggeredActionsByConnectorType(
        actionTypeId
      );

      const connectorAdapter = this.context.taskRunnerContext.connectorAdapterRegistry.get(
        action.actionTypeId
      );

      const connectorAdapterActionParams = connectorAdapter.buildActionParams({
        alerts: summarizedAlerts,
        rule: {
          id: this.context.rule.id,
          tags: this.context.rule.tags,
          name: this.context.rule.name,
          consumer: this.context.rule.consumer,
          producer: this.context.ruleType.producer,
          ruleTypeId: this.context.rule.alertTypeId,
        },
        ruleUrl: ruleUrl?.absoluteUrl,
        spaceId: this.context.taskInstance.params.spaceId,
        params: action.params,
      });

      const actionToRun = Object.assign(action, { params: connectorAdapterActionParams });

      results.push({
        actionToEnqueue: formatActionToEnqueue({
          action: actionToRun,
          apiKey: this.context.apiKey,
          apiKeyId: this.context.apiKeyId,
          executionId: this.context.executionId,
          priority: this.context.priority,
          ruleConsumer: this.context.ruleConsumer,
          ruleId: this.context.rule.id,
          ruleTypeId: this.context.ruleType.id,
          spaceId: this.context.taskInstance.params.spaceId,
        }),
        actionToLog: {
          id: action.id,
          uuid: action.uuid,
          typeId: action.actionTypeId,
          alertSummary: {
            new: summarizedAlerts.new.count,
            ongoing: summarizedAlerts.ongoing.count,
            recovered: summarizedAlerts.recovered.count,
          },
        },
      });
    }

    return results;
  }
}
