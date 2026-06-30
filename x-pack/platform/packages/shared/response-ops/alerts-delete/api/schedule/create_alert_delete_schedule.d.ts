import type { HttpStart } from '@kbn/core/public';
import type { AlertDeleteParams } from '@kbn/alerting-types';
export interface CreateAlertDeleteScheduleParams {
    services: {
        http: HttpStart;
    };
    requestBody: AlertDeleteParams;
}
export declare const createAlertDeleteSchedule: ({ services: { http }, requestBody: { activeAlertDeleteThreshold, inactiveAlertDeleteThreshold, categoryIds }, }: CreateAlertDeleteScheduleParams) => Promise<string | undefined>;
