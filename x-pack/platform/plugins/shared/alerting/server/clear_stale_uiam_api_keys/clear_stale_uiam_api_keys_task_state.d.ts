import type { TypeOf } from '@kbn/config-schema';
/**
 * WARNING: Do not modify the existing versioned schema(s) below, instead define a new version (ex: 2, 3, 4).
 * This is required to support zero-downtime upgrades and rollbacks. See https://github.com/elastic/kibana/issues/155764.
 *
 * As you add a new schema version, don't forget to change `latestTaskStateSchema` to reference the latest schema.
 */
export declare const stateSchemaByVersion: {
    1: {
        up: (state: Record<string, unknown>) => {
            runs: number;
            cleared: boolean;
        };
        schema: import("@kbn/config-schema").ObjectType<{
            runs: import("@kbn/config-schema").Type<number>;
            cleared: import("@kbn/config-schema").Type<boolean>;
        }>;
    };
};
declare const latestTaskStateSchema: import("@kbn/config-schema").ObjectType<{
    runs: import("@kbn/config-schema").Type<number>;
    cleared: import("@kbn/config-schema").Type<boolean>;
}>;
export type LatestTaskStateSchema = TypeOf<typeof latestTaskStateSchema>;
export declare const emptyState: LatestTaskStateSchema;
export {};
