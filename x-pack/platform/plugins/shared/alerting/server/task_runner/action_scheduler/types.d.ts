import type { Logger } from '@kbn/core/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { ActionsClient } from '@kbn/actions-plugin/server/actions_client';
import type { ExecuteOptions as EnqueueExecutionOptions } from '@kbn/actions-plugin/server/create_execute_function';
import type { TaskPriority } from '@kbn/task-manager-plugin/server';
import type { IAlertsClient } from '../../alerts_client/types';
import type { Alert } from '../../alert';
import type { AlertInstanceContext, AlertInstanceState, RuleTypeParams, SanitizedRule, RuleTypeState, RuleAction, RuleAlertData, RuleSystemAction, ThrottledActions } from '../../../common';
import type { NormalizedRuleType } from '../../rule_type_registry';
import type { CombinedSummarizedAlerts, RawRule } from '../../types';
import type { RuleRunMetricsStore } from '../../lib/rule_run_metrics_store';
import type { ActionOpts, AlertingEventLogger } from '../../lib/alerting_event_logger/alerting_event_logger';
import type { RuleTaskInstance, TaskRunnerContext } from '../types';
export type ActionSchedulerRule<Params extends RuleTypeParams> = Omit<SanitizedRule<Params>, 'executionStatus'>;
export interface ActionSchedulerOptions<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    ruleType: NormalizedRuleType<Params, ExtractedParams, RuleState, State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>;
    logger: Logger;
    alertingEventLogger: PublicMethodsOf<AlertingEventLogger>;
    rule: ActionSchedulerRule<Params>;
    taskRunnerContext: TaskRunnerContext;
    taskInstance: RuleTaskInstance;
    ruleRunMetricsStore: RuleRunMetricsStore;
    apiKeyId?: string;
    apiKey: RawRule['apiKey'];
    ruleConsumer: string;
    executionId: string;
    ruleLabel: string;
    previousStartedAt: Date | null;
    actionsClient: PublicMethodsOf<ActionsClient>;
    alertsClient: IAlertsClient<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>;
    priority?: TaskPriority;
}
export type Executable<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> = {
    action: RuleAction | RuleSystemAction;
} & ({
    alert: Alert<State, Context, ActionGroupIds | RecoveryActionGroupId>;
    summarizedAlerts?: never;
} | {
    alert?: never;
    summarizedAlerts: CombinedSummarizedAlerts;
});
export interface GetActionsToScheduleOpts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    activeAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>;
    recoveredAlerts?: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    throttledSummaryActions?: ThrottledActions;
}
export interface ActionsToSchedule {
    actionToEnqueue: EnqueueExecutionOptions;
    actionToLog: ActionOpts;
}
export interface IActionScheduler<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    get priority(): number;
    getActionsToSchedule(opts: GetActionsToScheduleOpts<State, Context, ActionGroupIds, RecoveryActionGroupId>): Promise<ActionsToSchedule[]>;
}
export interface RuleUrl {
    absoluteUrl?: string;
    kibanaBaseUrl?: string;
    basePathname?: string;
    spaceIdSegment?: string;
    relativePath?: string;
}
export interface IsExecutableAlertOpts<ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    alert: Alert<AlertInstanceState, AlertInstanceContext, ActionGroupIds | RecoveryActionGroupId>;
    action: RuleAction;
    summarizedAlerts: CombinedSummarizedAlerts | null;
}
export interface IsExecutableActiveAlertOpts<ActionGroupIds extends string> {
    alert: Alert<AlertInstanceState, AlertInstanceContext, ActionGroupIds>;
    action: RuleAction;
}
export interface HelperOpts<ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    alert: Alert<AlertInstanceState, AlertInstanceContext, ActionGroupIds | RecoveryActionGroupId>;
    action: RuleAction;
}
export interface AddSummarizedAlertsOpts<ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    alert: Alert<AlertInstanceState, AlertInstanceContext, ActionGroupIds | RecoveryActionGroupId>;
    summarizedAlerts: CombinedSummarizedAlerts | null;
}
