import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
export interface UseBulkUpdateWorkflowStatusParams {
    http: HttpStart;
    notifications: NotificationsStart;
}
export declare const useBulkUpdateWorkflowStatus: ({ http, notifications: { toasts }, }: UseBulkUpdateWorkflowStatusParams) => import("@kbn/react-query").UseMutationResult<string, string, {
    ids: string[];
    status: string;
    index: string;
}, unknown>;
