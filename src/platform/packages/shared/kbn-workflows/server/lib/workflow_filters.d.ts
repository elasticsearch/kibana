import type { estypes } from '@elastic/elasticsearch';
export type ManagedFilter = 'all' | 'managed' | 'unmanaged';
export type DeletedFilter = 'all' | 'deleted' | 'not_deleted';
export interface WorkflowQueryFilter {
    must: estypes.QueryDslQueryContainer[];
    must_not: estypes.QueryDslQueryContainer[];
}
export interface BuildWorkflowFiltersParams {
    ids?: string[];
    space?: {
        id: string;
        includeGlobal?: boolean | undefined;
    };
    deleted?: DeletedFilter | undefined;
    managed?: ManagedFilter | undefined;
}
/**
 * Builds an Elasticsearch bool filter from the workflow query dimensions that are explicitly set.
 *
 * `deleted` and `managed` are tri-state filters: `'all'` or `undefined` leaves the
 * dimension unfiltered, while the other values add either an inclusion or exclusion clause.
 */
export declare const buildWorkflowFilters: ({ ids, space, deleted, managed, }?: BuildWorkflowFiltersParams) => WorkflowQueryFilter;
