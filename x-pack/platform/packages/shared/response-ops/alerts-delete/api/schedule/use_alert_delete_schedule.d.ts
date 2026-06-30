import type { HttpStart } from '@kbn/core-http-browser';
import type { IHttpFetchError, ResponseErrorBody } from '@kbn/core-http-browser';
import type { AlertDeleteParams } from '@kbn/alerting-types';
export interface UseAlertDeleteScheduleParams {
    services: {
        http: HttpStart;
    };
    onSuccess: (message?: string) => void;
    onError: (error: IHttpFetchError<ResponseErrorBody>) => void;
}
export declare const useAlertDeleteSchedule: ({ services: { http }, onSuccess, onError, }: UseAlertDeleteScheduleParams) => import("@kbn/react-query").UseMutationResult<string | undefined, IHttpFetchError<ResponseErrorBody>, AlertDeleteParams, unknown>;
