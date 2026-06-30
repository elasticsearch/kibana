import type { IHttpFetchError, ResponseErrorBody } from '@kbn/core-http-browser';
export type ServerError = IHttpFetchError<ResponseErrorBody>;
export interface ToggleAlertParams {
    ruleId: string;
    alertInstanceId: string;
}
/**
 * Map from rule ids to muted alert instance ids
 */
export type MutedAlerts = Record<string, string[]>;
