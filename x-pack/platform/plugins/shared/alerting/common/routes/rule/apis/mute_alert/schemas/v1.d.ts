export declare const muteAlertParamsSchema: import("@kbn/config-schema").ObjectType<{
    rule_id: import("@kbn/config-schema").Type<string>;
    alert_id: import("@kbn/config-schema").Type<string>;
}>;
export declare const muteAlertQuerySchema: import("@kbn/config-schema").Type<Readonly<{
    validate_alerts_existence?: boolean | undefined;
} & {}> | undefined>;
