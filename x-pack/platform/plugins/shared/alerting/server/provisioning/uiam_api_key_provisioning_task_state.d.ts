import type { TypeOf } from '@kbn/config-schema';
export declare const stateSchemaByVersion: {
    1: {
        up: () => {
            runs: number;
        };
        schema: import("@kbn/config-schema").ObjectType<{
            runs: import("@kbn/config-schema").Type<number>;
        }>;
    };
};
declare const latestTaskStateSchema: import("@kbn/config-schema").ObjectType<{
    runs: import("@kbn/config-schema").Type<number>;
}>;
export type LatestTaskStateSchema = TypeOf<typeof latestTaskStateSchema>;
export declare const emptyState: LatestTaskStateSchema;
export {};
