import type { TypeOf } from '@kbn/config-schema';
export type IndexThresholdRuleParams = TypeOf<typeof IndexThresholdRuleParamsSchema>;
export declare const CoreQueryParamsSchemaProperties: {
    index: import("@kbn/config-schema").Type<string | string[]>;
    timeField: import("@kbn/config-schema").Type<string>;
    aggType: import("@kbn/config-schema").Type<string>;
    aggField: import("@kbn/config-schema").Type<string | undefined>;
    groupBy: import("@kbn/config-schema").Type<string>;
    /**
     *
     *
     */
    termField: import("@kbn/config-schema").Type<string | undefined>;
    filterKuery: import("@kbn/config-schema").Type<string | undefined>;
    termSize: import("@kbn/config-schema").Type<number | undefined>;
    timeWindowSize: import("@kbn/config-schema").Type<number>;
    timeWindowUnit: import("@kbn/config-schema").Type<string>;
};
export declare const CoreQueryParamsSchema: import("@kbn/config-schema").ObjectType<{
    index: import("@kbn/config-schema").Type<string | string[]>;
    timeField: import("@kbn/config-schema").Type<string>;
    aggType: import("@kbn/config-schema").Type<string>;
    aggField: import("@kbn/config-schema").Type<string | undefined>;
    groupBy: import("@kbn/config-schema").Type<string>;
    /**
     *
     *
     */
    termField: import("@kbn/config-schema").Type<string | undefined>;
    filterKuery: import("@kbn/config-schema").Type<string | undefined>;
    termSize: import("@kbn/config-schema").Type<number | undefined>;
    timeWindowSize: import("@kbn/config-schema").Type<number>;
    timeWindowUnit: import("@kbn/config-schema").Type<string>;
}>;
export type CoreQueryParams = TypeOf<typeof CoreQueryParamsSchema>;
export declare const IndexThresholdRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    thresholdComparator: import("@kbn/config-schema").Type<import("../common/constants").Comparator>;
    threshold: import("@kbn/config-schema").Type<number[]>;
    index: import("@kbn/config-schema").Type<string | string[]>;
    timeField: import("@kbn/config-schema").Type<string>;
    aggType: import("@kbn/config-schema").Type<string>;
    aggField: import("@kbn/config-schema").Type<string | undefined>;
    groupBy: import("@kbn/config-schema").Type<string>;
    /**
     *
     *
     */
    termField: import("@kbn/config-schema").Type<string | undefined>;
    filterKuery: import("@kbn/config-schema").Type<string | undefined>;
    termSize: import("@kbn/config-schema").Type<number | undefined>;
    timeWindowSize: import("@kbn/config-schema").Type<number>;
    timeWindowUnit: import("@kbn/config-schema").Type<string>;
}>;
export declare function validateCoreQueryBody(anyParams: unknown): string | undefined;
