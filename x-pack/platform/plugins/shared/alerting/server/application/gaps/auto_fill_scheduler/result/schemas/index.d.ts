export declare const gapAutoFillSchedulerSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    ruleTypes: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[]>;
    scope: import("@kbn/config-schema").Type<string[]>;
    gapFillRange: import("@kbn/config-schema").Type<string>;
    maxBackfills: import("@kbn/config-schema").Type<number>;
    numRetries: import("@kbn/config-schema").Type<number>;
    createdBy: import("@kbn/config-schema").Type<string | undefined>;
    updatedBy: import("@kbn/config-schema").Type<string | undefined>;
    createdAt: import("@kbn/config-schema").Type<string>;
    updatedAt: import("@kbn/config-schema").Type<string>;
}>;
