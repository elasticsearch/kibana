import type { EsQueryConfig, Filter, Query, TimeRange } from '@kbn/es-query';
interface BuildEsQueryArgs {
    timeRange?: TimeRange;
    kuery?: string;
    queries?: Query[];
    config?: EsQueryConfig;
    filters?: Filter[];
}
export declare function buildEsQuery({ timeRange, kuery, filters, queries, config, }: BuildEsQueryArgs): {
    bool: import("@kbn/es-query").BoolQuery;
};
export {};
