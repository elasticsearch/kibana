import type { TypeOf } from '@kbn/config-schema';
export declare const threadPoolRejectionsCommonSchema: import("@kbn/config-schema").ObjectType<Omit<{
    threshold: import("@kbn/config-schema").Type<number | undefined>;
    duration: import("@kbn/config-schema").Type<string>;
    filterQuery: import("@kbn/config-schema").Type<string | undefined>;
    filterQueryText: import("@kbn/config-schema").Type<string | undefined>;
}, never> & {}>;
export type ThreadPoolRejectionsCommonParams = TypeOf<typeof threadPoolRejectionsCommonSchema>;
