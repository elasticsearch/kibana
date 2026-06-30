export declare const createGapAutoFillSchedulerSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string | undefined>;
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    maxBackfills: import("@kbn/config-schema").Type<number>;
    numRetries: import("@kbn/config-schema").Type<number>;
    gapFillRange: import("@kbn/config-schema").Type<string>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    request: import("@kbn/config-schema").AnyType;
    scope: import("@kbn/config-schema").Type<string[]>;
    excludedReasons: import("@kbn/config-schema").Type<("rule_disabled" | "rule_did_not_run")[] | undefined>;
    ruleTypes: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[]>;
}>;
