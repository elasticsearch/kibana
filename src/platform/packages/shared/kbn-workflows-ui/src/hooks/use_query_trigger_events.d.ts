import type { SearchTriggerEventLogParams, SearchTriggerEventLogResult } from '../api/types';
export type WorkflowTriggerEventsLogQueryKey = readonly [
    'workflowTriggerEventsLog',
    string | undefined,
    string | undefined,
    string | undefined,
    number | undefined,
    number | undefined
];
/**
 * Primitive query-key parts so equivalent searches share a cache entry even when
 * callers pass a new `params` object reference each render.
 */
export declare const getWorkflowTriggerEventsLogQueryKey: (params: SearchTriggerEventLogParams) => WorkflowTriggerEventsLogQueryKey;
export declare function useQueryTriggerEvents(params: SearchTriggerEventLogParams, options?: {
    enabled?: boolean;
}): import("@kbn/react-query").UseQueryResult<SearchTriggerEventLogResult, unknown>;
