import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { RenderingService } from '@kbn/core-rendering-browser';
import { type CreateCsvReportParams } from '../apis/create_csv_report';
export interface UseCreateCsvReportParams {
    http: HttpStart;
    notifications: NotificationsStart;
    rendering: RenderingService | undefined;
}
type CreateCsvReportVariables = Omit<CreateCsvReportParams, 'http'>;
export declare const useCreateCsvReport: ({ http, notifications: { toasts }, rendering, }: UseCreateCsvReportParams) => import("@kbn/react-query").UseMutationResult<void, Error & {
    body?: {
        message?: string;
    };
}, CreateCsvReportVariables, unknown>;
export {};
