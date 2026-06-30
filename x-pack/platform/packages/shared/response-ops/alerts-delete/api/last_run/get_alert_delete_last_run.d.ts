import type { AlertDeleteLastRun } from '@kbn/alerting-types/alert_delete_types';
import type { HttpStart } from '@kbn/core/public';
export type GetAlertDeleteLastRunResponse = AlertDeleteLastRun;
export interface GetAlertDeleteLastRunParams {
    services: {
        http: HttpStart;
    };
}
export declare const getAlertDeleteLastRun: ({ services: { http }, }: GetAlertDeleteLastRunParams) => Promise<GetAlertDeleteLastRunResponse>;
