/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQueries, useQuery, type UseQueryOptions } from '@kbn/react-query';
import { isHttpFetchError } from '@kbn/core-http-browser';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  API_VERSIONS,
  EVALS_EXPERIMENTS_RUN_URL,
  EVALS_EXPERIMENTS_SAVE_WORKFLOW_URL,
  EVALS_EXPERIMENTS_PREVIEW_URL,
  EVALS_EXPERIMENT_TEMPLATES_URL,
  EVALS_EXPERIMENT_EXECUTION_URL,
  EVALS_EXPERIMENT_EXECUTION_CANCEL_URL,
} from '@kbn/evals-common';
import type {
  RunExperimentRequest,
  RunExperimentResponse,
  SaveAsWorkflowResponse,
  PreviewExperimentResponse,
  GetExperimentTemplatesResponse,
  ExperimentExecutionStatus,
} from '../../common/experiments/run_experiment';
import { EvaluateDatasetStepId } from '../../common/workflows/steps';

const retryOnServerError = (_failureCount: number, error: unknown) => {
  if (isHttpFetchError(error)) {
    return !error.response?.status || error.response.status >= 500;
  }
  return true;
};

/**
 * A just-launched execution can 404 transiently (index refresh lag). Retry those a bounded
 * number of times so a brief miss doesn't kill polling; other errors use the shared policy.
 */
const MAX_EXECUTION_NOT_FOUND_RETRIES = 5;

const retryExecutionStatus = (failureCount: number, error: unknown): boolean => {
  if (
    isHttpFetchError(error) &&
    error.response?.status === 404 &&
    failureCount < MAX_EXECUTION_NOT_FOUND_RETRIES
  ) {
    return true;
  }
  return retryOnServerError(failureCount, error);
};

export const useExperimentTemplates = () => {
  const { services } = useKibana();

  return useQuery({
    queryKey: ['evals', 'experiment-templates'],
    queryFn: async (): Promise<GetExperimentTemplatesResponse> =>
      services.http!.get<GetExperimentTemplatesResponse>(EVALS_EXPERIMENT_TEMPLATES_URL, {
        version: API_VERSIONS.internal.v1,
      }),
    retry: retryOnServerError,
    refetchOnWindowFocus: false,
  });
};

/** A minimal view of an Agent Builder agent, used to populate the task-target picker. */
export interface AgentBuilderAgent {
  id: string;
  name?: string;
  description?: string;
}

interface ListAgentBuilderAgentsResponse {
  results: AgentBuilderAgent[];
}

const AGENT_BUILDER_AGENTS_URL = '/api/agent_builder/agents';
const AGENT_BUILDER_PUBLIC_API_VERSION = '2023-10-31';

/**
 * Lists Agent Builder agents (including built-in ones) so the experiment form can
 * suggest them.
 */
export const useAgentBuilderAgents = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: ['evals', 'agent-builder-agents'],
    enabled,
    queryFn: async (): Promise<AgentBuilderAgent[]> => {
      const response = await services.http!.get<ListAgentBuilderAgentsResponse>(
        AGENT_BUILDER_AGENTS_URL,
        { version: AGENT_BUILDER_PUBLIC_API_VERSION }
      );
      return response.results ?? [];
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
};

export const useRunExperiment = () => {
  const { services } = useKibana();

  return useMutation({
    mutationFn: async (body: RunExperimentRequest): Promise<RunExperimentResponse> =>
      services.http!.post<RunExperimentResponse>(EVALS_EXPERIMENTS_RUN_URL, {
        body: JSON.stringify(body),
        version: API_VERSIONS.internal.v1,
      }),
  });
};

export const useSaveExperimentWorkflow = () => {
  const { services } = useKibana();

  return useMutation({
    mutationFn: async (body: RunExperimentRequest): Promise<SaveAsWorkflowResponse> =>
      services.http!.post<SaveAsWorkflowResponse>(EVALS_EXPERIMENTS_SAVE_WORKFLOW_URL, {
        body: JSON.stringify(body),
        version: API_VERSIONS.internal.v1,
      }),
  });
};

export const usePreviewExperiment = () => {
  const { services } = useKibana();

  return useMutation({
    mutationFn: async (body: RunExperimentRequest): Promise<PreviewExperimentResponse> =>
      services.http!.post<PreviewExperimentResponse>(EVALS_EXPERIMENTS_PREVIEW_URL, {
        body: JSON.stringify(body),
        version: API_VERSIONS.internal.v1,
      }),
  });
};

export const useCancelWorkflowExecution = () => {
  const { services } = useKibana();

  return useMutation({
    mutationFn: async (workflowExecutionId: string): Promise<{ cancelled: boolean }> => {
      const url = EVALS_EXPERIMENT_EXECUTION_CANCEL_URL.replace(
        '{workflowExecutionId}',
        encodeURIComponent(workflowExecutionId)
      );
      return services.http!.post<{ cancelled: boolean }>(url, {
        version: API_VERSIONS.internal.v1,
      });
    },
  });
};

const TERMINAL_EXECUTION_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'timed_out',
  'skipped',
]);

export const isTerminalExecutionStatus = (status: string): boolean =>
  TERMINAL_EXECUTION_STATUSES.has(status);

const WORKFLOW_EXECUTION_POLL_MS = 2000;
const DATASET_STEP_TYPE = EvaluateDatasetStepId;

export interface WorkflowExecutionView {
  id: string;
  data?: ExperimentExecutionStatus;
  isError: boolean;
}

export interface WorkflowExecutionsState {
  executions: WorkflowExecutionView[];
  allSettled: boolean;
  isLoading: boolean;
  scoresIngested: number;
}

export const sumScoresIngested = (execution?: ExperimentExecutionStatus): number =>
  (execution?.steps ?? []).reduce(
    (sum, step) =>
      step.step_type === DATASET_STEP_TYPE ? sum + (step.progress?.scores_ingested ?? 0) : sum,
    0
  );

/**
 * Reports `scoresIngested` so the detail page can defer its experiment-document query: the
 * experiment doc only exists once scores are ingested, so querying earlier 404s.
 */
export const useWorkflowExecutions = (workflowExecutionIds: string[]): WorkflowExecutionsState => {
  const { services } = useKibana();

  const results = useQueries({
    queries: workflowExecutionIds.map(
      (workflowExecutionId): UseQueryOptions<ExperimentExecutionStatus> => ({
        queryKey: ['evals', 'workflow-execution', workflowExecutionId],
        queryFn: async (): Promise<ExperimentExecutionStatus> => {
          const url = EVALS_EXPERIMENT_EXECUTION_URL.replace(
            '{workflowExecutionId}',
            encodeURIComponent(workflowExecutionId)
          );
          return services.http!.get<ExperimentExecutionStatus>(url, {
            version: API_VERSIONS.internal.v1,
          });
        },
        enabled: workflowExecutionId.length > 0,
        refetchInterval: (data, query) => {
          // A settled execution or an exhausted-retry error stops the poll; otherwise the interval
          // would keep re-polling a permanently failing query forever.
          if (query.state.status === 'error' || (data && isTerminalExecutionStatus(data.status))) {
            return false;
          }
          return WORKFLOW_EXECUTION_POLL_MS;
        },
        retry: retryExecutionStatus,
      })
    ),
  });

  const executions = workflowExecutionIds.map<WorkflowExecutionView>((id, index) => ({
    id,
    data: results[index]?.data,
    isError: !!results[index]?.isError,
  }));

  const isLoading = results.some((result) => result.isLoading);

  // A query in a persistent error state counts as settled so the UI leaves its in-flight state
  // (and stops polling) instead of hanging forever when an execution can no longer be fetched.
  const allSettled =
    workflowExecutionIds.length > 0 &&
    results.every(
      (result) => result.isError || (!!result.data && isTerminalExecutionStatus(result.data.status))
    );

  const scoresIngested = executions.reduce((sum, view) => sum + sumScoresIngested(view.data), 0);

  return { executions, allSettled, isLoading, scoresIngested };
};
