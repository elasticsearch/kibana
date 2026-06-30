import type { ThrottledActions } from '../../types';
import type { ActionSchedulerOptions } from './types';
import type { Alert } from '../../alert';
import type { AlertInstanceContext, AlertInstanceState, RuleTypeParams, RuleTypeState, RuleAlertData } from '../../../common';
export interface RunResult {
    throttledSummaryActions: ThrottledActions;
}
export declare class ActionScheduler<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    private readonly context;
    private readonly schedulers;
    constructor(context: ActionSchedulerOptions<Params, ExtractedParams, RuleState, State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>);
    run({ activeAlerts, recoveredAlerts, }: {
        activeAlerts?: Record<string, Alert<State, Context, ActionGroupIds>>;
        recoveredAlerts?: Record<string, Alert<State, Context, RecoveryActionGroupId>>;
    }): Promise<RunResult>;
}
