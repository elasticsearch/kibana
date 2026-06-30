import type { SavedObject, ISavedObjectsRepository, ISavedObjectsPointInTimeFinder, StartServicesAccessor } from '@kbn/core/server';
import { type Logger } from '@kbn/core/server';
import type { IntervalSchedule, TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { KueryNode } from '@kbn/es-query';
import type { MaintenanceWindowAttributes } from '../data/types/maintenance_window_attributes';
import type { MaintenanceWindowsServerStartDependencies } from '../types';
export declare const MAINTENANCE_WINDOW_EVENTS_TASK_TYPE = "maintenance-window:generate-events";
export declare const MAINTENANCE_WINDOW_EVENTS_TASK_ID = "maintenance-window:generate-events-generator";
export declare const SCHEDULE: IntervalSchedule;
export declare function initializeMaintenanceWindowEventsGenerator(logger: Logger, taskManager: TaskManagerSetupContract, coreStartServices: StartServicesAccessor<MaintenanceWindowsServerStartDependencies, unknown>): void;
export declare function scheduleMaintenanceWindowEventsGenerator(logger: Logger, taskManager: TaskManagerStartContract): Promise<void>;
export declare function createEventsGeneratorTaskRunner(logger: Logger, coreStartServices: StartServicesAccessor<MaintenanceWindowsServerStartDependencies, unknown>): () => {
    run(): Promise<void>;
    cancel(): Promise<void>;
};
export declare function getStatusFilter(): KueryNode;
export declare const updateMaintenanceWindowsEvents: ({ soFinder, savedObjectsClient, logger, startRangeDate, }: {
    logger: Logger;
    savedObjectsClient: ISavedObjectsRepository;
    soFinder: ISavedObjectsPointInTimeFinder<MaintenanceWindowAttributes, unknown> | null;
    startRangeDate: string;
}) => Promise<number>;
export declare function getSOFinder({ savedObjectsClient, logger, filter, }: {
    logger: Logger;
    savedObjectsClient: ISavedObjectsRepository;
    filter: KueryNode;
}): ISavedObjectsPointInTimeFinder<MaintenanceWindowAttributes, unknown> | null;
export declare function generateEvents({ maintenanceWindowsSO, startRangeDate, }: {
    maintenanceWindowsSO: Array<SavedObject<MaintenanceWindowAttributes>>;
    startRangeDate: string;
}): Promise<{
    expirationDate: string;
    events: {
        gte: string;
        lte: string;
    }[];
    scope?: Readonly<{} & {
        alerting: Readonly<{
            dsl?: string | undefined;
        } & {
            kql: string;
            filters: Readonly<{
                query?: Record<string, any> | undefined;
                $state?: Readonly<{} & {
                    store: import("@kbn/es-query").FilterStateStore;
                }> | undefined;
            } & {
                meta: Record<string, any>;
            }>[];
        }> | null;
    }> | undefined;
    categoryIds?: ("observability" | "securitySolution" | "management")[] | null | undefined;
    scopedQuery?: Readonly<{
        dsl?: string | undefined;
    } & {
        kql: string;
        filters: Readonly<{
            query?: Record<string, any> | undefined;
            $state?: Readonly<{} & {
                store: import("@kbn/es-query").FilterStateStore;
            }> | undefined;
        } & {
            meta: Record<string, any>;
        }>[];
    }> | null | undefined;
    title: string;
    id: string;
    status: "disabled" | "running" | "upcoming" | "finished" | "archived";
    duration: number;
    schedule: Readonly<{} & {
        custom: Readonly<{
            timezone?: string | undefined;
            recurring?: Readonly<{
                end?: string | undefined;
                every?: string | undefined;
                onWeekDay?: string[] | undefined;
                onMonthDay?: number[] | undefined;
                onMonth?: number[] | undefined;
                occurrences?: number | undefined;
            } & {}> | undefined;
        } & {
            start: string;
            duration: string;
        }>;
    }>;
    enabled: boolean;
    createdBy: string | null;
    createdAt: string;
    updatedBy: string | null;
    updatedAt: string;
    rRule: Readonly<{
        count?: number | undefined;
        interval?: number | undefined;
        freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
        byhour?: number[] | null | undefined;
        byminute?: number[] | null | undefined;
        byweekday?: (string | number)[] | null | undefined;
        bymonthday?: number[] | null | undefined;
        until?: string | undefined;
        wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
        bymonth?: number[] | null | undefined;
        bysetpos?: number[] | null | undefined;
        byyearday?: number[] | null | undefined;
        byweekno?: number[] | null | undefined;
        bysecond?: number[] | null | undefined;
    } & {
        tzid: string;
        dtstart: string;
    }>;
    eventStartTime: string | null;
    eventEndTime: string | null;
}[]>;
