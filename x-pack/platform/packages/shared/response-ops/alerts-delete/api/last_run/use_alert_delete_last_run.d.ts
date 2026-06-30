import type { HttpStart } from '@kbn/core-http-browser';
export interface UseAlertDeleteLastRunParams {
    isEnabled: boolean;
    isOpen: boolean;
    services: {
        http: HttpStart;
    };
}
export declare const useAlertDeleteLastRun: ({ isEnabled, isOpen, services: { http }, }: UseAlertDeleteLastRunParams) => import("@kbn/react-query").UseQueryResult<import("@kbn/alerting-types").AlertDeleteLastRun, unknown>;
