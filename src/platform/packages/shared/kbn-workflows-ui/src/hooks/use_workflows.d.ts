import type { WorkflowListDto, WorkflowsSearchParams } from '@kbn/workflows';
/**
 * Fetches a paginated/filterable list of workflows.
 *
 * @example
 * ```ts
 * const { data } = useWorkflows({ page: 1, size: 20, query: 'security' });
 * ```
 */
export declare function useWorkflows(params: WorkflowsSearchParams): import("@kbn/react-query").UseQueryResult<WorkflowListDto, unknown>;
