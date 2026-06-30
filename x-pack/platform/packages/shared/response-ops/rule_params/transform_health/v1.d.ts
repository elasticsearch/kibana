import type { TypeOf } from '@kbn/config-schema';
export declare const transformHealthRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    includeTransforms: import("@kbn/config-schema").Type<string[]>;
    excludeTransforms: import("@kbn/config-schema").Type<string[] | null>;
    testsConfig: import("@kbn/config-schema").Type<Readonly<{} & {
        errorMessages: Readonly<{} & {
            enabled: boolean;
        }> | null;
        notStarted: Readonly<{} & {
            enabled: boolean;
        }> | null;
        healthCheck: Readonly<{} & {
            enabled: boolean;
        }> | null;
    }> | null>;
}>;
export type TransformHealthRuleParams = TypeOf<typeof transformHealthRuleParamsSchema>;
