/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, type UseInfiniteQueryOptions } from '@kbn/react-query';
import type {
  ExecutionStatus,
  ExecutionType,
  WorkflowExecutionListDto,
  WorkflowExecutionSortField,
  WorkflowExecutionSortOrder,
} from '@kbn/workflows';
import { useWorkflowsApi } from '@kbn/workflows-ui';

const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 3;

interface UseWorkflowExecutionsParams {
  /** Workflow ID. */
  workflowId: string | null;
  /** Filter by execution status. */
  statuses?: ExecutionStatus[];
  /** Filter by execution type. */
  executionTypes?: ExecutionType[];
  /** Filter by the user who triggered the execution. */
  executedBy?: string[];
  /** Number of results per page. */
  size?: number;
  /** Whether to omit single-step runs from the results. */
  omitStepRuns?: boolean;
  /** Datemath lower bound for filtering by startedAt (e.g. 'now-1w'). */
  startedAfter?: string;
  /** Datemath upper bound for filtering by startedAt (e.g. 'now'). */
  startedBefore?: string;
  finishedAfter?: string;
  finishedBefore?: string;
  sortField?: WorkflowExecutionSortField;
  sortOrder?: WorkflowExecutionSortOrder;
}

export function useWorkflowExecutions(
  params: UseWorkflowExecutionsParams,
  options: Omit<
    UseInfiniteQueryOptions<
      WorkflowExecutionListDto,
      unknown,
      WorkflowExecutionListDto,
      WorkflowExecutionListDto,
      (
        | string
        | number
        | boolean
        | ExecutionStatus[]
        | ExecutionType[]
        | string[]
        | null
        | undefined
      )[]
    >,
    'queryKey' | 'queryFn' | 'getNextPageParam'
  > = {}
) {
  const api = useWorkflowsApi();
  const currentSize = params.size ?? DEFAULT_PAGE_SIZE;

  const queryFn = useCallback(
    async ({ pageParam = 1 }: { pageParam?: number }) => {
      if (!params.workflowId) {
        throw new Error('Workflow ID is required');
      }
      return api.getWorkflowExecutions(params.workflowId, {
        statuses: params.statuses,
        executionTypes: params.executionTypes,
        ...(params.executedBy && params.executedBy.length > 0
          ? { executedBy: params.executedBy }
          : {}),
        ...(params.omitStepRuns != null && { omitStepRuns: params.omitStepRuns }),
        ...(params.startedAfter != null && params.startedAfter !== ''
          ? { startedAfter: params.startedAfter }
          : {}),
        ...(params.startedBefore != null && params.startedBefore !== ''
          ? { startedBefore: params.startedBefore }
          : {}),
        ...(params.finishedAfter ? { finishedAfter: params.finishedAfter } : {}),
        ...(params.finishedBefore ? { finishedBefore: params.finishedBefore } : {}),
        ...(params.sortField ? { sortField: params.sortField } : {}),
        ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
        page: pageParam,
        size: currentSize,
      });
    },
    [
      api,
      params.workflowId,
      params.statuses,
      params.executionTypes,
      params.executedBy,
      params.omitStepRuns,
      params.startedAfter,
      params.startedBefore,
      params.finishedAfter,
      params.finishedBefore,
      params.sortField,
      params.sortOrder,
      currentSize,
    ]
  );

  const getNextPageParam = useCallback((lastPage: WorkflowExecutionListDto) => {
    const { page, size, total } = lastPage;
    const totalPages = Math.ceil(total / size);

    if (page >= totalPages) {
      return undefined;
    }

    return page + 1;
  }, []);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetched,
    isFetching,
    isLoading: isInitialLoading,
    refetch,
    error,
  } = useInfiniteQuery({
    networkMode: 'always',
    queryKey: [
      'workflows',
      params.workflowId,
      'executions',
      params.statuses,
      params.executionTypes,
      params.executedBy,
      params.omitStepRuns,
      params.startedAfter,
      params.startedBefore,
      params.finishedAfter,
      params.finishedBefore,
      params.sortField,
      params.sortOrder,
      currentSize,
    ],
    queryFn,
    getNextPageParam,
    enabled: params.workflowId !== null,
    ...options,
    retry: options.retry ?? MAX_RETRIES,
    retryDelay: options.retryDelay ?? ((attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)),
  });

  // Computed loading states for better semantics
  const isLoadingMore = isFetching && !isInitialLoading;

  // Flatten all pages into a single list
  const allExecutions = useMemo<WorkflowExecutionListDto | null>(() => {
    if (!data?.pages?.length) {
      return null;
    }

    const firstPage = data.pages[0];
    const allResults = data.pages.flatMap((page) => page.results);

    return {
      results: allResults,
      page: data.pages.length, // Number of pages loaded
      size: firstPage.size, // Keep original page size
      total: firstPage.total, // Total available
    };
  }, [data]);

  // IntersectionObserver setup for infinite scroll
  const observerRef = useRef<IntersectionObserver>();
  const fetchNext = useCallback(
    async ([{ isIntersecting }]: IntersectionObserverEntry[]) => {
      if (isIntersecting && hasNextPage && !isInitialLoading && !isFetching) {
        await fetchNextPage();
        // Don't disconnect - the observer will be reattached to the new last element
      }
    },
    [fetchNextPage, hasNextPage, isFetching, isInitialLoading]
  );

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  // Attaches an intersection observer to the last element
  // to trigger a callback to paginate when the user scrolls to it
  const setPaginationObserver = useCallback(
    (ref: HTMLDivElement | null) => {
      observerRef.current?.disconnect();

      if (!ref) {
        return;
      }

      observerRef.current = new IntersectionObserver(fetchNext, {
        root: null,
        rootMargin: '0px',
        threshold: 0.1,
      });
      observerRef.current.observe(ref);
    },
    [fetchNext]
  );

  return {
    data: allExecutions,
    isInitialLoading,
    isLoadingMore,
    isFetched,
    hasNextPage,
    error,
    refetch,
    setPaginationObserver,
  };
}
