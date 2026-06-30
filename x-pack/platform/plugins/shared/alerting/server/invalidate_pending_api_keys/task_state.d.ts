import type { TypeOf } from '@kbn/config-schema';
/**
 * WARNING: Do not modify the existing versioned schema(s) below, instead define a new version (ex: 2, 3, 4).
 * This is required to support zero-downtime upgrades and rollbacks. See https://github.com/elastic/kibana/issues/155764.
 *
 * As you add a new schema version, don't forget to change latestTaskStateSchema variable to reference the latest schema.
 * For example, changing stateSchemaByVersion[1].schema to stateSchemaByVersion[2].schema.
 */
export declare const stateSchemaByVersion: {
    1: {
        up: (state: Record<string, unknown>) => {
            runs: {};
            total_invalidated: {};
        };
        schema: import("@kbn/config-schema").ObjectType<{
            runs: import("@kbn/config-schema").Type<number>;
            total_invalidated: import("@kbn/config-schema").Type<number>;
        }>;
    };
    2: {
        up: (state: Record<string, unknown>) => {
            runs: {};
            total_invalidated: {};
            missing_api_key_retries: {};
        };
        schema: import("@kbn/config-schema").ObjectType<{
            runs: import("@kbn/config-schema").Type<number>;
            total_invalidated: import("@kbn/config-schema").Type<number>;
            missing_api_key_retries: import("@kbn/config-schema").Type<Record<string, number>>;
        }>;
    };
};
declare const latestTaskStateSchema: import("@kbn/config-schema").ObjectType<{
    runs: import("@kbn/config-schema").Type<number>;
    total_invalidated: import("@kbn/config-schema").Type<number>;
    missing_api_key_retries: import("@kbn/config-schema").Type<Record<string, number>>;
}>;
export type LatestTaskStateSchema = TypeOf<typeof latestTaskStateSchema>;
export declare const emptyState: LatestTaskStateSchema;
export {};
