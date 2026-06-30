/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useInfiniteQuery } from '@kbn/react-query';
import { useCallback, useMemo } from 'react';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type { ChangeHistoryListItem } from '../types/change_history_list_item';
import type { ListChangeHistoryResult } from '../types/list_change_history_params';
import { useChangeHistoryConfig } from '../provider/use_change_history_config';
import { changeHistoryListQueryKey } from './change_history_list_query_key';

export interface UseChangeHistoryListArgs {
  adapter: ChangeHistoryAdapter;
  objectId: string;
  enabled?: boolean;
  /** Overrides provider `listPageSize` for this query only. */
  pageSize?: number;
}

export interface UseChangeHistoryListResult {
  items: ChangeHistoryListItem[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingFirstPage: boolean;
  isLoadingMore: boolean;
  error?: Error;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => Promise<ListChangeHistoryResult | undefined>;
}

export const useChangeHistoryList = ({
  adapter,
  objectId,
  enabled = true,
  pageSize: pageSizeArg,
}: UseChangeHistoryListArgs): UseChangeHistoryListResult => {
  const { scope, listPageSize } = useChangeHistoryConfig();
  const pageSize = pageSizeArg ?? listPageSize;
  const {
    data,
    error,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch: refetchQuery,
  } = useInfiniteQuery<ListChangeHistoryResult, Error>(
    changeHistoryListQueryKey({ objectId, pageSize, scope }),
    ({ signal, pageParam = 0 }) =>
      adapter.listChanges({
        objectId,
        page: { index: pageParam as number, size: pageSize },
        signal,
      }),
    {
      enabled: enabled && Boolean(objectId),
      getNextPageParam: (lastPage, allPages) => {
        const loadedCount = allPages.reduce((count, page) => count + page.items.length, 0);
        return loadedCount < lastPage.total ? allPages.length : undefined;
      },
    }
  );

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data?.pages]);
  const total = data?.pages[0]?.total ?? 0;
  const isFetchingFirstPage = isFetching && !isFetchingNextPage;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const refetch = useCallback(async (): Promise<ListChangeHistoryResult | undefined> => {
    const result = await refetchQuery();
    return result.data?.pages[0];
  }, [refetchQuery]);

  return {
    items,
    total,
    isLoading,
    isFetching,
    isFetchingFirstPage,
    isLoadingMore: isFetchingNextPage,
    error: error ?? undefined,
    hasMore: hasNextPage ?? false,
    loadMore,
    refetch,
  };
};
