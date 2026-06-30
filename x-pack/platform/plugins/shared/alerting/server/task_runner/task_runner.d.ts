import type { ISavedObjectsRepository } from '@kbn/core/server';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import type { RuleTaskRunResult, TaskRunnerContext } from './types';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData, RuleTypeParams, RuleTypeState } from '../../common';
import type { NormalizedRuleType } from '../rule_type_registry';
import type { InMemoryMetrics } from '../monitoring';
interface TaskRunnerConstructorParams<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, AlertState extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    context: TaskRunnerContext;
    inMemoryMetrics: InMemoryMetrics;
    internalSavedObjectsRepository: ISavedObjectsRepository;
    ruleType: NormalizedRuleType<Params, ExtractedParams, RuleState, AlertState, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>;
    taskInstance: ConcreteTaskInstance;
}
export declare class TaskRunner<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, RuleState extends RuleTypeState, AlertState extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    private context;
    private logger;
    private taskInstance;
    private ruleConsumer;
    private ruleType;
    private readonly executionId;
    private readonly ruleTypeRegistry;
    private readonly inMemoryMetrics;
    private readonly internalSavedObjectsRepository;
    private timer;
    private alertingEventLogger;
    private usageCounter?;
    private searchAbortController;
    private cancelled;
    private stackTraceLog;
    private ruleMonitoring;
    private ruleRunning;
    private ruleResult;
    private ruleTypeRunner;
    private runDate;
    constructor({ context, inMemoryMetrics, internalSavedObjectsRepository, ruleType, taskInstance, }: TaskRunnerConstructorParams<Params, ExtractedParams, RuleState, AlertState, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>);
    private updateRuleSavedObjectPostRun;
    private shouldLogAndScheduleActionsForAlerts;
    private countUsageOfActionExecutionAfterRuleCancellation;
    private runRule;
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
    private prepareToRun;
    private processRunResults;
    run(): Promise<RuleTaskRunResult>;
    cancel(): Promise<void>;
}
export {};
