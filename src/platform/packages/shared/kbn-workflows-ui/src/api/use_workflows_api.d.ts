import { WorkflowApi } from './workflows_api';
/**
 * Returns a memoized `WorkflowApi` instance wired to the current Kibana HTTP service.
 *
 * @example
 * ```ts
 * const api = useWorkflowsApi();
 * const workflows = await api.getWorkflows({ page: 1, size: 20 });
 * ```
 */
export declare const useWorkflowsApi: () => WorkflowApi;
