import type { QueryOptionsOverrides } from '@kbn/alerts-ui-shared/src/common/types/tanstack_query_utility_types';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import { bulkGetMaintenanceWindows } from '../apis/bulk_get_maintenance_windows';
interface UseBulkGetMaintenanceWindowsQueryParams {
    ids: string[];
    http: HttpStart;
    notifications: NotificationsStart;
    application: ApplicationStart;
    licensing: LicensingPluginStart;
}
export declare const useBulkGetMaintenanceWindowsQuery: ({ ids, http, notifications: { toasts }, application: { capabilities }, licensing, }: UseBulkGetMaintenanceWindowsQueryParams, { enabled, context, }?: Pick<QueryOptionsOverrides<typeof bulkGetMaintenanceWindows>, "enabled" | "context">) => import("@kbn/react-query").UseQueryResult<Map<string, Readonly<{
    scope?: Readonly<{} & {
        alerting: Readonly<{
            dsl?: string | undefined;
        } & {
            kql: string;
            filters: Readonly<{
                query?: Record<string, any> | undefined;
                $state?: Readonly<{} & {
                    store: import("@kbn/es-query-constants").FilterStateStore;
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
                store: import("@kbn/es-query-constants").FilterStateStore;
            }> | undefined;
        } & {
            meta: Record<string, any>;
        }>[];
    }> | null | undefined;
} & {
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
    expirationDate: string;
    events: Readonly<{} & {
        gte: string;
        lte: string;
    }>[];
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
}>>, unknown>;
export {};
