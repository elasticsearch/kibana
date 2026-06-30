import type { Logger } from '@kbn/core/server';
export declare enum TaskRunnerTimerSpan {
    StartTaskRun = "claim_to_start_duration_ms",
    TotalRunDuration = "total_run_duration_ms",
    PrepareRule = "prepare_rule_duration_ms",
    RuleTypeRun = "rule_type_run_duration_ms",
    ProcessAlerts = "process_alerts_duration_ms",
    PersistAlerts = "persist_alerts_duration_ms",
    UpdateAlerts = "update_alerts_duration_ms",
    TriggerActions = "trigger_actions_duration_ms",
    ProcessRuleRun = "process_rule_duration_ms"
}
export type TaskRunnerTimings = Record<TaskRunnerTimerSpan, number>;
interface TaskRunnerTimerOpts {
    logger: Logger;
}
export declare class TaskRunnerTimer {
    private readonly options;
    private timings;
    constructor(options: TaskRunnerTimerOpts);
    /**
     * Calcuate the time passed since a given start time and store this
     * duration for the give name.
     */
    setDuration(name: TaskRunnerTimerSpan, start: Date): void;
    runWithTimer<T>(name: TaskRunnerTimerSpan, cb: () => Promise<T>): Promise<T>;
    toJson(): TaskRunnerTimings;
}
export {};
