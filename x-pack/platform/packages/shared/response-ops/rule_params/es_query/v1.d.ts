import type { TypeOf } from '@kbn/config-schema';
import { Comparator } from '../common/constants';
export type EsQueryRuleParams = TypeOf<typeof EsQueryRuleParamsSchema>;
export declare function validateParams(anyParams: unknown): string | undefined;
export declare const EsQueryRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    size: import("@kbn/config-schema").Type<number>;
    timeWindowSize: import("@kbn/config-schema").Type<number>;
    excludeHitsFromPreviousRun: import("@kbn/config-schema").Type<boolean>;
    timeWindowUnit: import("@kbn/config-schema").Type<string>;
    threshold: import("@kbn/config-schema").Type<number[]>;
    thresholdComparator: import("@kbn/config-schema").Type<Comparator>;
    aggType: import("@kbn/config-schema").Type<string>;
    aggField: import("@kbn/config-schema").Type<string | undefined>;
    groupBy: import("@kbn/config-schema").Type<string>;
    termField: import("@kbn/config-schema").Type<string | string[] | undefined>;
    termSize: import("@kbn/config-schema").Type<number | undefined>;
    searchType: import("@kbn/config-schema").Type<"searchSource" | "esQuery" | "esqlQuery">;
    timeField: import("@kbn/config-schema").ConditionalType<import("@kbn/config-schema").Type<"esQuery">, string, string | undefined>;
    searchConfiguration: import("@kbn/config-schema").ConditionalType<import("@kbn/config-schema").Type<"searchSource">, Readonly<{} & {}>, never>;
    esQuery: import("@kbn/config-schema").ConditionalType<import("@kbn/config-schema").Type<"esQuery">, string, never>;
    index: import("@kbn/config-schema").ConditionalType<import("@kbn/config-schema").Type<"esQuery">, string[], never>;
    esqlQuery: import("@kbn/config-schema").ConditionalType<import("@kbn/config-schema").Type<"esqlQuery">, Readonly<{} & {
        esql: string;
    }>, never>;
    sourceFields: import("@kbn/config-schema").Type<Readonly<{} & {
        label: string;
        searchPath: string;
    }>[] | undefined>;
}>;
