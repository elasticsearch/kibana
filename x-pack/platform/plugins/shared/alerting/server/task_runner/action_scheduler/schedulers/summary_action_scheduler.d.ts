import type { AlertInstanceState, AlertInstanceContext } from '@kbn/alerting-state-types';
import type { RuleTypeParams } from '@kbn/alerting-types';
import type { RuleTypeState, RuleAlertData } from '../../../../common';
import type { ActionSchedulerOptions, ActionsToSchedule, GetActionsToScheduleOpts, IActionScheduler } from '../types';
export declare class SummaryActionScheduler<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> implements IActionScheduler<State, Context, ActionGroupIds, RecoveryActionGroupId> {
    private readonly context;
    private actions;
    constructor(context: ActionSchedulerOptions<Params, ExtractedParams, RuleState, State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>);
    get priority(): number;
    getActionsToSchedule({ activeAlerts, recoveredAlerts, throttledSummaryActions, }: GetActionsToScheduleOpts<State, Context, ActionGroupIds, RecoveryActionGroupId>): Promise<ActionsToSchedule[]>;
}
