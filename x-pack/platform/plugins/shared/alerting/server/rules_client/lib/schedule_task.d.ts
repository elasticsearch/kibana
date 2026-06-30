import type { RulesClientContext, ScheduleTaskOptions } from '../types';
export type BuildTaskInstanceOpts = Omit<ScheduleTaskOptions, 'throwOnConflict'>;
export declare const buildTaskInstance: (context: RulesClientContext, opts: BuildTaskInstanceOpts) => {
    id: string;
    taskType: string;
    schedule: import("@kbn/alerting-types").IntervalSchedule;
    params: {
        alertId: string;
        spaceId: string;
        consumer: string;
    };
    state: {
        previousStartedAt: null;
        alertTypeState: {};
        alertInstances: {};
    };
    scope: string[];
    enabled: boolean;
};
export declare function scheduleTask(context: RulesClientContext, opts: ScheduleTaskOptions): Promise<import("../../../../task_manager/server").ConcreteTaskInstance | {
    id: string;
    taskType: string;
    schedule: import("@kbn/alerting-types").IntervalSchedule;
    params: {
        alertId: string;
        spaceId: string;
        consumer: string;
    };
    state: {
        previousStartedAt: null;
        alertTypeState: {};
        alertInstances: {};
    };
    scope: string[];
    enabled: boolean;
}>;
export declare function bulkScheduleTask(context: RulesClientContext, tasks: BuildTaskInstanceOpts[]): Promise<import("../../../../task_manager/server").ConcreteTaskInstance[]>;
