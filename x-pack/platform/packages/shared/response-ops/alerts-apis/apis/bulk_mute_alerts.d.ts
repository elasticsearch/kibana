import type { HttpStart } from '@kbn/core-http-browser';
export interface BulkMuteAlertsRule {
    rule_id: string;
    alert_instance_ids: string[];
}
export interface BulkMuteAlertsParams {
    rules: BulkMuteAlertsRule[];
    http: HttpStart;
}
export declare const bulkMuteAlerts: ({ rules, http }: BulkMuteAlertsParams) => Promise<void>;
