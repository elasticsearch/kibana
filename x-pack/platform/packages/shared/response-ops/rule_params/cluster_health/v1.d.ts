import type { TypeOf } from '@kbn/config-schema';
export declare const clusterHealthParamsSchema: import("@kbn/config-schema").ObjectType<Omit<Omit<{
    threshold: import("@kbn/config-schema").Type<number | undefined>;
    duration: import("@kbn/config-schema").Type<string>;
    filterQuery: import("@kbn/config-schema").Type<string | undefined>;
    filterQueryText: import("@kbn/config-schema").Type<string | undefined>;
}, "limit"> & {
    limit: import("@kbn/config-schema").Type<string | undefined>;
}, never> & {}>;
export type ClusterHealthParams = TypeOf<typeof clusterHealthParamsSchema>;
