import type { TypeOf } from '@kbn/config-schema';
export declare enum AggregationType {
    Avg = "avg",
    P95 = "95th",
    P99 = "99th"
}
export declare const transactionDurationParamsSchema: import("@kbn/config-schema").ObjectType<{
    serviceName: import("@kbn/config-schema").Type<string | undefined>;
    transactionType: import("@kbn/config-schema").Type<string | undefined>;
    transactionName: import("@kbn/config-schema").Type<string | undefined>;
    windowSize: import("@kbn/config-schema").Type<number>;
    windowUnit: import("@kbn/config-schema").Type<string>;
    threshold: import("@kbn/config-schema").Type<number>;
    aggregationType: import("@kbn/config-schema").Type<AggregationType>;
    environment: import("@kbn/config-schema").Type<string>;
    groupBy: import("@kbn/config-schema").Type<string[] | undefined>;
    useKqlFilter: import("@kbn/config-schema").Type<boolean | undefined>;
    searchConfiguration: import("@kbn/config-schema").Type<Readonly<{} & {
        query: Readonly<{} & {
            query: string | Record<string, any>;
            language: string;
        }>;
    }> | undefined>;
}>;
export type TransactionDurationRuleParams = TypeOf<typeof transactionDurationParamsSchema>;
