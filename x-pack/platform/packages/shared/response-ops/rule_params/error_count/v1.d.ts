import type { TypeOf } from '@kbn/config-schema';
export declare const errorCountParamsSchema: import("@kbn/config-schema").ObjectType<{
    windowSize: import("@kbn/config-schema").Type<number>;
    windowUnit: import("@kbn/config-schema").Type<string>;
    threshold: import("@kbn/config-schema").Type<number>;
    serviceName: import("@kbn/config-schema").Type<string | undefined>;
    environment: import("@kbn/config-schema").Type<string>;
    groupBy: import("@kbn/config-schema").Type<string[] | undefined>;
    errorGroupingKey: import("@kbn/config-schema").Type<string | undefined>;
    useKqlFilter: import("@kbn/config-schema").Type<boolean | undefined>;
    searchConfiguration: import("@kbn/config-schema").Type<Readonly<{} & {
        query: Readonly<{} & {
            query: string | Record<string, any>;
            language: string;
        }>;
    }> | undefined>;
}>;
export type ErrorCountRuleParams = TypeOf<typeof errorCountParamsSchema>;
