import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ServerError } from '../types';
import { type BulkUnmuteAlertsRule } from '../apis/bulk_unmute_alerts';
export interface UseBulkUnmuteAlertsParams {
    http: HttpStart;
    notifications: NotificationsStart;
    onSuccess?: () => void;
}
export interface BulkUnmuteAlertsParams {
    rules: BulkUnmuteAlertsRule[];
}
export declare const getKey: () => readonly [string, "bulkUnmuteAlerts"];
export declare const useBulkUnmuteAlerts: ({ http, notifications: { toasts }, onSuccess, }: UseBulkUnmuteAlertsParams) => import("@kbn/react-query").UseMutationResult<void, ServerError, BulkUnmuteAlertsParams, unknown>;
