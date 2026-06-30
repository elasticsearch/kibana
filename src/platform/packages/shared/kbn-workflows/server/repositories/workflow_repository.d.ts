import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { EsWorkflow, WorkflowDetailDto } from '../..';
import type { ManagedFilter } from '../lib/workflow_filters';
export interface WorkflowRepositoryOptions {
    esClient: ElasticsearchClient;
    logger: Logger;
    indexName: string;
}
export type WorkflowRepositoryParams = Omit<WorkflowRepositoryOptions, 'indexName'> & {
    indexName?: string;
};
export interface WorkflowLookupOptions {
    includeGlobal?: boolean;
    managedFilter?: ManagedFilter;
}
export declare class WorkflowRepository {
    private options;
    constructor(params: WorkflowRepositoryParams);
    /**
     * Get a workflow by ID and space ID
     */
    getWorkflow(workflowId: string, spaceId: string, options?: WorkflowLookupOptions): Promise<EsWorkflow | null>;
    /**
     * Check if a workflow is enabled by ID and space ID
     */
    isWorkflowEnabled(workflowId: string, spaceId: string, options?: WorkflowLookupOptions): Promise<boolean>;
    /**
     * Bulk-check whether the given (workflowId, spaceId) pairs refer to enabled,
     * non-soft-deleted workflows. Runs a single `_search` fetching only the
     * `enabled` field across all requested ids.
     *
     * When `options.includeGlobal` is `true`, a workflow stored in the global
     * space (`*`) is considered visible for each requested space and contributes
     * to that `${spaceId}:${workflowId}` result.
     *
     * The returned map is keyed by `${spaceId}:${workflowId}`. Missing docs and
     * soft-deleted docs (`deleted_at` present) resolve to `false`.
     */
    areWorkflowsEnabled(refs: Array<{
        workflowId: string;
        spaceId: string;
    }>, options?: WorkflowLookupOptions): Promise<Map<string, boolean>>;
    /**
     * Returns all enabled, non-deleted workflows in the space that are subscribed to the given trigger type.
     * Uses PIT-based pagination to handle large result sets.
     */
    getWorkflowsSubscribedToTrigger(triggerId: string, spaceId: string): Promise<WorkflowDetailDto[]>;
}
