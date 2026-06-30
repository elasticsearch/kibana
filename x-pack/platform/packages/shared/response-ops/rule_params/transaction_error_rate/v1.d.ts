import type { TypeOf } from '@kbn/config-schema';
export declare const transactionErrorRateParamsSchema: import("@kbn/config-schema").ObjectType<{
    windowSize: import("@kbn/config-schema").Type<number>;
    windowUnit: import("@kbn/config-schema").Type<string>;
    threshold: import("@kbn/config-schema").Type<number>;
    transactionType: import("@kbn/config-schema").Type<string | undefined>;
    transactionName: import("@kbn/config-schema").Type<string | undefined>;
    serviceName: import("@kbn/config-schema").Type<string | undefined>;
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
export type TransactionErrorRateRuleParams = TypeOf<typeof transactionErrorRateParamsSchema>;
