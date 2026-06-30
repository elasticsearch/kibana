import type { TypeOf } from '@kbn/config-schema';
export declare const degradedDocsParamsSchema: import("@kbn/config-schema").ObjectType<{
    timeUnit: import("@kbn/config-schema").Type<string>;
    timeSize: import("@kbn/config-schema").Type<number>;
    threshold: import("@kbn/config-schema").Type<number[]>;
    comparator: import("@kbn/config-schema").Type<string>;
    groupBy: import("@kbn/config-schema").Type<string[] | undefined>;
    searchConfiguration: import("@kbn/config-schema").ObjectType<{
        index: import("@kbn/config-schema").Type<string>;
    }>;
}>;
export type DegradedDocsRuleParams = TypeOf<typeof degradedDocsParamsSchema>;
