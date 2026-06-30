import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ServerError } from '../types';
import { type BulkMuteAlertsRule } from '../apis/bulk_mute_alerts';
export interface UseBulkMuteAlertsParams {
    http: HttpStart;
    notifications: NotificationsStart;
    onSuccess?: () => void;
}
export interface BulkMuteAlertsParams {
    rules: BulkMuteAlertsRule[];
}
export declare const getKey: () => readonly [string, "bulkMuteAlerts"];
export declare const useBulkMuteAlerts: ({ http, notifications: { toasts }, onSuccess, }: UseBulkMuteAlertsParams) => import("@kbn/react-query").UseMutationResult<void, ServerError, BulkMuteAlertsParams, unknown>;
