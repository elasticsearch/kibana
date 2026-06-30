import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { AADAlert } from '@kbn/alerts-as-data-utils';
import type { RuleActionParams, AlertInstanceState, AlertInstanceContext, RuleTypeParams } from '../types';
import type { ActionSchedulerRule } from './action_scheduler/types';
export interface TransformActionParamsOptions {
    actionsPlugin: ActionsPluginStartContract;
    alertId: string;
    alertType: string;
    actionId: string;
    actionTypeId: string;
    alertName: string;
    spaceId: string;
    tags?: string[];
    alertInstanceId: string;
    alertUuid: string;
    alertActionGroup: string;
    alertActionGroupName: string;
    actionParams: RuleActionParams;
    alertParams: RuleTypeParams;
    state: AlertInstanceState;
    kibanaBaseUrl?: string;
    context: AlertInstanceContext;
    ruleUrl?: string;
    flapping: boolean;
    aadAlert?: AADAlert;
    consecutiveMatches?: number;
}
interface SummarizedAlertsWithAll {
    new: {
        count: number;
        data: unknown[];
    };
    ongoing: {
        count: number;
        data: unknown[];
    };
    recovered: {
        count: number;
        data: unknown[];
    };
    all: {
        count: number;
        data: unknown[];
    };
}
export declare function transformActionParams({ actionsPlugin, alertId, alertType, actionId, actionTypeId, alertName, spaceId, tags, alertInstanceId, alertUuid, alertActionGroup, alertActionGroupName, context, actionParams, state, kibanaBaseUrl, alertParams, ruleUrl, flapping, aadAlert, consecutiveMatches, }: TransformActionParamsOptions): RuleActionParams;
export declare function transformSummaryActionParams({ alerts, rule, ruleTypeId, actionsPlugin, actionId, actionTypeId, spaceId, actionParams, ruleUrl, kibanaBaseUrl, }: {
    alerts: SummarizedAlertsWithAll;
    rule: ActionSchedulerRule<RuleTypeParams>;
    ruleTypeId: string;
    actionsPlugin: ActionsPluginStartContract;
    actionId: string;
    actionTypeId: string;
    spaceId: string;
    actionParams: RuleActionParams;
    kibanaBaseUrl?: string;
    ruleUrl?: string;
}): RuleActionParams;
export {};
