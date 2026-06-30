import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ServerError, ToggleAlertParams } from '../types';
export interface UseUnmuteAlertInstanceParams {
    http: HttpStart;
    notifications: NotificationsStart;
}
export declare const getKey: () => readonly [string, "unmuteAlertInstance"];
export declare const useUnmuteAlertInstance: ({ http, notifications: { toasts }, }: UseUnmuteAlertInstanceParams) => import("@kbn/react-query").UseMutationResult<void, ServerError, ToggleAlertParams, unknown>;
