import type { AlertInstanceContext, AlertInstanceState, RuleTaskState } from '@kbn/alerting-state-types';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { IAlertsClient } from '../alerts_client/types';
import type { NormalizedRuleType } from '../rule_type_registry';
import type { RuleAlertData, RuleTypeParams, RuleTypeState, SanitizedRule } from '../types';
import type { ExecutorServices } from './get_executor_services';
import type { TaskRunnerTimer } from './task_runner_timer';
import type { RuleRunnerErrorStackTraceLog, RuleTypeRunnerContext, TaskRunnerContext } from './types';
interface ConstructorOpts<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    context: TaskRunnerContext;
    task: ConcreteTaskInstance;
    timer: TaskRunnerTimer;
}
export type RuleData<Params extends RuleTypeParams> = Pick<SanitizedRule<Params>, 'alertTypeId' | 'consumer' | 'schedule' | 'throttle' | 'notifyWhen' | 'name' | 'tags' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'enabled' | 'actions' | 'muteAll' | 'revision' | 'snoozeSchedule' | 'alertDelay' | 'lastEnabledAt'>;
interface RunOpts<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    context: RuleTypeRunnerContext;
    alertsClient: IAlertsClient<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>;
    actionsClient?: PublicMethodsOf<ActionsClient>;
    executionId: string;
    executorServices: ExecutorServices & {
        getTimeRangeFn?: (timeWindow: string, nowDate?: string) => {
            dateStart: string;
            dateEnd: string;
        };
    };
    rule: RuleData<Params>;
    ruleType: NormalizedRuleType<Params, ExtractedParams, RuleState, State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>;
    startedAt: Date;
    state: RuleTaskState;
    validatedParams: Params;
}
interface RunResult {
    state: RuleTypeState | undefined;
    error?: Error;
    stackTrace?: RuleRunnerErrorStackTraceLog | null;
}
export declare class RuleTypeRunner<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    private readonly options;
    private cancelled;
    constructor(options: ConstructorOpts<Params, ExtractedParams, RuleState, State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>);
    cancelRun(): void;
    run({ context, alertsClient, actionsClient, executionId, executorServices, rule, ruleType, startedAt, state, validatedParams, }: RunOpts<Params, ExtractedParams, RuleState, State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>): Promise<RunResult>;
    private shouldLogAndScheduleActionsForAlerts;
}
export {};
