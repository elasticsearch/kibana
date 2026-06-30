import type { RunContext } from '@kbn/task-manager-plugin/server';
import type { RuleAlertData, RuleTypeParams, RuleTypeState, AlertInstanceState, AlertInstanceContext } from '../types';
import { TaskRunner } from './task_runner';
import type { NormalizedRuleType } from '../rule_type_registry';
import type { InMemoryMetrics } from '../monitoring';
import type { TaskRunnerContext } from './types';
import { AdHocTaskRunner } from './ad_hoc_task_runner';
export declare class TaskRunnerFactory {
    private isInitialized;
    private taskRunnerContext?;
    initialize(taskRunnerContext: TaskRunnerContext): void;
    create<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, State extends RuleTypeState, InstanceState extends AlertInstanceState, InstanceContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData>(ruleType: NormalizedRuleType<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>, { taskInstance }: RunContext, inMemoryMetrics: InMemoryMetrics): TaskRunner<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>;
    createAdHoc({ taskInstance }: RunContext): AdHocTaskRunner;
}
