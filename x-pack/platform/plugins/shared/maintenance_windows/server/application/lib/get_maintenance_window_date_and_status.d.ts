import type { DateRange } from '../../../common';
import { MaintenanceWindowStatus } from '../../../common';
export interface DateSearchResult {
    event: DateRange;
    index: number;
    status: MaintenanceWindowStatus;
}
export interface MaintenanceWindowDateAndStatus {
    eventStartTime: string | null;
    eventEndTime: string | null;
    status: MaintenanceWindowStatus;
    index?: number;
}
export declare const getMaintenanceWindowDateAndStatus: ({ events, dateToCompare, expirationDate, enabled, }: {
    events: DateRange[];
    dateToCompare: Date;
    expirationDate: Date;
    enabled: Boolean;
}) => MaintenanceWindowDateAndStatus;
export declare const findRecentEventWithStatus: (events: DateRange[], dateToCompare: Date) => DateSearchResult;
