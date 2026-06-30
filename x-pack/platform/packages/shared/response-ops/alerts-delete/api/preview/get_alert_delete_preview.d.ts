import type { HttpStart } from '@kbn/core/public';
import type { AlertDeleteParams, AlertDeletePreview } from '@kbn/alerting-types/alert_delete_types';
export type GetAlertDeletePreviewResponse = AlertDeletePreview;
export interface GetAlertDeletePreviewParams {
    services: {
        http: HttpStart;
    };
    requestQuery: AlertDeleteParams;
}
export declare const getAlertDeletePreview: ({ services: { http }, requestQuery: { activeAlertDeleteThreshold, inactiveAlertDeleteThreshold, categoryIds }, }: GetAlertDeletePreviewParams) => Promise<GetAlertDeletePreviewResponse>;
