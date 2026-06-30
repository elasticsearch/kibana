import type { TypeOf } from '@kbn/config-schema';
export declare const baseSchema: import("@kbn/config-schema").ObjectType<{
    threshold: import("@kbn/config-schema").Type<number | undefined>;
    duration: import("@kbn/config-schema").Type<string>;
    filterQuery: import("@kbn/config-schema").Type<string | undefined>;
    filterQueryText: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const stackMonitoringCommonSchema: import("@kbn/config-schema").ObjectType<Omit<{
    threshold: import("@kbn/config-schema").Type<number | undefined>;
    duration: import("@kbn/config-schema").Type<string>;
    filterQuery: import("@kbn/config-schema").Type<string | undefined>;
    filterQueryText: import("@kbn/config-schema").Type<string | undefined>;
}, "limit"> & {
    limit: import("@kbn/config-schema").Type<string | undefined>;
}>;
export type StackMonitoringType = TypeOf<typeof stackMonitoringCommonSchema>;
