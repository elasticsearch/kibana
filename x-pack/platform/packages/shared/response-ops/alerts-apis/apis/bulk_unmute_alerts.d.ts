import type { HttpStart } from '@kbn/core-http-browser';
export interface BulkUnmuteAlertsRule {
    rule_id: string;
    alert_instance_ids: string[];
}
export interface BulkUnmuteAlertsParams {
    rules: BulkUnmuteAlertsRule[];
    http: HttpStart;
}
export declare const bulkUnmuteAlerts: ({ rules, http }: BulkUnmuteAlertsParams) => Promise<void>;
