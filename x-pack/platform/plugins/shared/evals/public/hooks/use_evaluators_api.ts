/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQuery, useQueryClient } from '@kbn/react-query';
import { isHttpFetchError } from '@kbn/core-http-browser';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  API_VERSIONS,
  EVALS_EVALUATORS_URL,
  EVALS_EVALUATOR_URL,
  EVALS_RESOLVE_INSTRUMENTATION_URL,
  EVALS_TEST_EVALUATOR_URL,
  type CreateEvaluatorRequestBodyInput,
  type CreateEvaluatorResponse,
  type DeleteEvaluatorResponse,
  type GetEvaluatorResponse,
  type ListEvaluatorsResponse,
  type ResolveInstrumentationResponse,
  type TestEvaluatorRequestBodyInput,
  type TestEvaluatorResponse,
  type UpdateEvaluatorRequestBodyInput,
  type UpdateEvaluatorResponse,
} from '@kbn/evals-common';
import { queryKeys } from '../query_keys';

interface UpdateEvaluatorVariables {
  name: string;
  updates: UpdateEvaluatorRequestBodyInput;
}

const retryOnServerError = (_failureCount: number, error: unknown): boolean => {
  if (isHttpFetchError(error)) {
    return !error.response?.status || error.response.status >= 500;
  }
  return true;
};

const getEvaluatorUrl = (name: string): string =>
  EVALS_EVALUATOR_URL.replace('{name}', encodeURIComponent(name));

export const useEvaluators = () => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.evaluators.list(),
    queryFn: async (): Promise<ListEvaluatorsResponse> =>
      services.http!.get<ListEvaluatorsResponse>(EVALS_EVALUATORS_URL, {
        version: API_VERSIONS.internal.v1,
      }),
    retry: retryOnServerError,
    refetchOnWindowFocus: false,
  });
};

export const useEvaluator = (name?: string) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.evaluators.detail(name ?? ''),
    enabled: Boolean(name),
    queryFn: async (): Promise<GetEvaluatorResponse> =>
      services.http!.get<GetEvaluatorResponse>(getEvaluatorUrl(name ?? ''), {
        version: API_VERSIONS.internal.v1,
      }),
    retry: retryOnServerError,
    refetchOnWindowFocus: false,
  });
};

export const useCreateEvaluator = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateEvaluatorRequestBodyInput): Promise<CreateEvaluatorResponse> =>
      services.http!.post<CreateEvaluatorResponse>(EVALS_EVALUATORS_URL, {
        body: JSON.stringify(body),
        version: API_VERSIONS.internal.v1,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evaluators.all });
    },
  });
};

export const useUpdateEvaluator = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      updates,
    }: UpdateEvaluatorVariables): Promise<UpdateEvaluatorResponse> =>
      services.http!.put<UpdateEvaluatorResponse>(getEvaluatorUrl(name), {
        body: JSON.stringify(updates),
        version: API_VERSIONS.internal.v1,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evaluators.all });
    },
  });
};

export const useDeleteEvaluator = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<DeleteEvaluatorResponse> =>
      services.http!.delete<DeleteEvaluatorResponse>(getEvaluatorUrl(name), {
        version: API_VERSIONS.internal.v1,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evaluators.all });
    },
  });
};

export const useTestEvaluator = () => {
  const { services } = useKibana();

  return useMutation({
    mutationFn: async (body: TestEvaluatorRequestBodyInput): Promise<TestEvaluatorResponse> =>
      services.http!.post<TestEvaluatorResponse>(EVALS_TEST_EVALUATOR_URL, {
        body: JSON.stringify(body),
        version: API_VERSIONS.internal.v1,
      }),
  });
};

export const useResolveInstrumentation = () => {
  const { services } = useKibana();

  return useMutation({
    mutationFn: async (traceId: string): Promise<ResolveInstrumentationResponse> =>
      services.http!.post<ResolveInstrumentationResponse>(EVALS_RESOLVE_INSTRUMENTATION_URL, {
        body: JSON.stringify({ trace_id: traceId }),
        version: API_VERSIONS.internal.v1,
      }),
  });
};
