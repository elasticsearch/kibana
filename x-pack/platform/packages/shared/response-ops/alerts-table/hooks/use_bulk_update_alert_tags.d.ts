import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
export interface UseBulkUpdateAlertTagsParams {
    http: HttpStart;
    notifications: NotificationsStart;
    onSuccess?: () => void;
    onError?: () => void;
}
export declare const useBulkUpdateAlertTags: ({ http, notifications: { toasts }, onSuccess, onError, }: UseBulkUpdateAlertTagsParams) => import("@kbn/react-query").UseMutationResult<string, string, {
    index: string;
    alertIds: string[];
    add?: string[];
    remove?: string[];
}, unknown>;
