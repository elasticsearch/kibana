import type { HttpStart } from '@kbn/core-http-browser';
import type { AlertDeleteParams } from '@kbn/alerting-types/alert_delete_types';
export interface UseAlertDeletePreviewParams {
    isEnabled: boolean;
    services: {
        http: HttpStart;
    };
    queryParams: AlertDeleteParams;
    lastRun?: string;
}
export declare const useAlertDeletePreview: ({ isEnabled, services: { http }, queryParams: { activeAlertDeleteThreshold, inactiveAlertDeleteThreshold, categoryIds }, lastRun, }: UseAlertDeletePreviewParams) => import("@kbn/react-query").UseQueryResult<import("@kbn/alerting-types/alert_delete_types").AlertDeletePreview, unknown>;
