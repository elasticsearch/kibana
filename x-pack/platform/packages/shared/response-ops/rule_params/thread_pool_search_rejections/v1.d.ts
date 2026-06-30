import type { TypeOf } from '@kbn/config-schema';
export declare const threadPoolSearchRejectionsParamsSchema: import("@kbn/config-schema").ObjectType<Omit<Omit<{
    threshold: import("@kbn/config-schema").Type<number | undefined>;
    duration: import("@kbn/config-schema").Type<string>;
    filterQuery: import("@kbn/config-schema").Type<string | undefined>;
    filterQueryText: import("@kbn/config-schema").Type<string | undefined>;
}, never> & {}, never> & {}>;
export type ThreadPoolSearchRejectionsParams = TypeOf<typeof threadPoolSearchRejectionsParamsSchema>;
