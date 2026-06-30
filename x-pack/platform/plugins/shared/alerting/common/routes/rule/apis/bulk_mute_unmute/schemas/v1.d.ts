export declare const bulkMuteUnmuteAlertsBodySchema: import("@kbn/config-schema").ObjectType<{
    rules: import("@kbn/config-schema").Type<Readonly<{} & {
        rule_id: string;
        alert_instance_ids: string[];
    }>[]>;
}>;
