import type { TypeOf } from '@kbn/config-schema';
export declare const tlsRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    search: import("@kbn/config-schema").Type<string | undefined>;
    certExpirationThreshold: import("@kbn/config-schema").Type<number | undefined>;
    certAgeThreshold: import("@kbn/config-schema").Type<number | undefined>;
    monitorIds: import("@kbn/config-schema").Type<string[] | undefined>;
    locations: import("@kbn/config-schema").Type<string[] | undefined>;
    tags: import("@kbn/config-schema").Type<string[] | undefined>;
    monitorTypes: import("@kbn/config-schema").Type<string[] | undefined>;
    projects: import("@kbn/config-schema").Type<string[] | undefined>;
    kqlQuery: import("@kbn/config-schema").Type<string | undefined>;
}>;
export type TLSRuleParams = TypeOf<typeof tlsRuleParamsSchema>;
