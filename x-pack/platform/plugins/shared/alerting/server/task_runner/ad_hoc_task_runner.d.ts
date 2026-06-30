import type { ISavedObjectsRepository } from '@kbn/core/server';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import type { CancellableTask, RunResult } from '@kbn/task-manager-plugin/server/task';
import type { TaskRunnerContext } from './types';
interface ConstructorParams {
    context: TaskRunnerContext;
    internalSavedObjectsRepository: ISavedObjectsRepository;
    taskInstance: ConcreteTaskInstance;
}
export declare class AdHocTaskRunner implements CancellableTask {
    private readonly context;
    private readonly executionId;
    private readonly internalSavedObjectsRepository;
    private readonly ruleTypeRegistry;
    private readonly taskInstance;
    private adHocRunSchedule;
    private adHocRange;
    private adHocRunData;
    private alertingEventLogger;
    private cancelled;
    private logger;
    private ruleId;
    private ruleMonitoring;
    private ruleResult;
    private ruleTypeId;
    private ruleTypeRunner;
    private runDate;
    private scheduleToRunIndex;
    private searchAbortController;
    private shouldDeleteTask;
    private stackTraceLog;
    private taskRunning;
    private timer;
    private apiKeyToUse;
    constructor({ context, internalSavedObjectsRepository, taskInstance }: ConstructorParams);
    private updateAdHocRunSavedObjectPostRun;
    private runRule;
    /**
     * Before we actually kick off the ad hoc run:
     * - read decrypted ad hoc run SO
     * - start the RunningHandler
     * - initialize the event logger
     * - set the current APM transaction info
     * - validate that rule type is enabled and params are valid
     */
    private prepareToRun;
    private processAdHocRunResults;
    private hasAnyPendingRuns;
    run(): Promise<RunResult>;
    cancel(): Promise<void>;
    cleanup(): Promise<void>;
    private updateGapsAfterBackfillComplete;
    private shouldLogAndScheduleActionsForAlerts;
}
export {};
