import type { TypeOf } from '@kbn/config-schema';
export declare const rawGapAutoFillSchedulerSchemaV1: import("@kbn/config-schema").ObjectType<{
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    gapFillRange: import("@kbn/config-schema").Type<string>;
    maxBackfills: import("@kbn/config-schema").Type<number>;
    numRetries: import("@kbn/config-schema").Type<number>;
    scope: import("@kbn/config-schema").Type<string[]>;
    ruleTypes: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        consumer: string;
    }>[]>;
    ruleTypeConsumerPairs: import("@kbn/config-schema").Type<string[]>;
    createdBy: import("@kbn/config-schema").Type<string | null>;
    updatedBy: import("@kbn/config-schema").Type<string | null>;
    createdAt: import("@kbn/config-schema").Type<string>;
    updatedAt: import("@kbn/config-schema").Type<string>;
}>;
export type RawGapAutoFillSchedulerAttributesV1 = TypeOf<typeof rawGapAutoFillSchedulerSchemaV1>;
