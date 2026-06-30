import type { IHttpFetchError, ResponseErrorBody } from '@kbn/core-http-browser';
import { type UseMutationOptions } from '@kbn/react-query';
import type { RunWorkflowResponseDto } from '@kbn/workflows';
import type { RunWorkflowOptions } from '../api/types';
type HttpError = IHttpFetchError<ResponseErrorBody>;
export type RunWorkflowParams = RunWorkflowOptions & {
    /** Workflow ID to run. */
    id: string;
};
/**
 * Runs a workflow.
 *
 * @example
 * ```ts
 * const { mutate: runWorkflow } = useRunWorkflow();
 *
 * runWorkflow({
 *   id: workflowId,
 *   inputs: { alertIds: ['alert-1'] }
 * });
 * ```
 */
export declare const useRunWorkflow: <P extends object = {}>(options?: UseMutationOptions<RunWorkflowResponseDto, HttpError, RunWorkflowParams & P>) => import("@kbn/react-query").UseMutationResult<{
    workflowExecutionId: string;
}, HttpError, RunWorkflowOptions & {
    /** Workflow ID to run. */
    id: string;
} & P, unknown>;
export {};
