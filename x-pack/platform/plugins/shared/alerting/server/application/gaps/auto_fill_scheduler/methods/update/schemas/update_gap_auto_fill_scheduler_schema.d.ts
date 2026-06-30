export declare const updateGapAutoFillSchedulerSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    gapFillRange: import("@kbn/config-schema").Type<string>;
    maxBackfills: import("@kbn/config-schema").Type<number>;
    numRetries: import("@kbn/config-schema").Type<number>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    scope: import("@kbn/config-schema").Type<string[]>;
    ruleTypes: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[]>;
    excludedReasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
    request: import("@kbn/config-schema").AnyType;
}>;
