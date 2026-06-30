import type { DateRange } from '../../../common';
import type { MaintenanceWindow, Schedule } from '../types';
export interface GenerateMaintenanceWindowEventsParams {
    schedule: Schedule;
    expirationDate: string;
    startDate?: string;
}
export declare const generateMaintenanceWindowEvents: ({ schedule, expirationDate, startDate, }: GenerateMaintenanceWindowEventsParams) => {
    gte: string;
    lte: string;
}[];
/**
 * Checks to see if we should regenerate maintenance window events.
 * Don't regenerate old events if the underlying RRule/duration did not change.
 */
export declare const shouldRegenerateEvents: ({ maintenanceWindow, schedule, }: {
    maintenanceWindow: MaintenanceWindow;
    schedule?: Schedule;
}) => boolean;
/**
 * Updates and merges the old events with the new events to preserve old modified events,
 * Unless the maintenance window was archived, then the old events are trimmed.
 */
export declare const mergeEvents: ({ oldEvents, newEvents, }: {
    oldEvents: DateRange[];
    newEvents: DateRange[];
}) => DateRange[];
