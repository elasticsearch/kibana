import type { TypeOf } from '@kbn/config-schema';
export declare const uptimeTLSRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    stackVersion: import("@kbn/config-schema").Type<string | undefined>;
    search: import("@kbn/config-schema").Type<string | undefined>;
    certExpirationThreshold: import("@kbn/config-schema").Type<number | undefined>;
    certAgeThreshold: import("@kbn/config-schema").Type<number | undefined>;
}>;
export type UptimeTLSRuleParams = TypeOf<typeof uptimeTLSRuleParamsSchema>;
