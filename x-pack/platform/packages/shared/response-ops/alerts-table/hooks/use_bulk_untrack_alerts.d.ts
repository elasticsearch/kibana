import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
export interface UseBulkUntrackAlertsParams {
    http: HttpStart;
    notifications: NotificationsStart;
}
export declare const useBulkUntrackAlerts: ({ http, notifications: { toasts }, }: UseBulkUntrackAlertsParams) => import("@kbn/react-query").UseMutationResult<string, string, {
    indices: string[];
    alertUuids: string[];
}, unknown>;
