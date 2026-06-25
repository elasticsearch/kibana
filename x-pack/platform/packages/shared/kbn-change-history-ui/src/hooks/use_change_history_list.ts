/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type { ChangeHistoryListItem } from '../types/change_history_list_item';
import { DEFAULT_CHANGE_HISTORY_PAGE_SIZE } from '../types/change_history_constants';

export interface UseChangeHistoryListArgs {
  adapter: ChangeHistoryAdapter;
  objectId: string;
  enabled?: boolean;
  pageSize?: number;
}

export interface UseChangeHistoryListResult {
  items: ChangeHistoryListItem[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error?: Error;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export const useChangeHistoryList = ({
  adapter,
  objectId,
  enabled = true,
  pageSize = DEFAULT_CHANGE_HISTORY_PAGE_SIZE,
}: UseChangeHistoryListArgs): UseChangeHistoryListResult => {
  const [items, setItems] = useState<ChangeHistoryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const abortControllerRef = useRef<AbortController | undefined>();

  const hasMore = items.length < total;

  const fetchPage = useCallback(
    async (nextPageIndex: number, append: boolean) => {
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const result = await adapter.listChanges({
          objectId,
          page: { index: nextPageIndex, size: pageSize },
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          return;
        }

        setTotal(result.total);
        setPageIndex(nextPageIndex);
        setItems((current) => (append ? [...current, ...result.items] : result.items));
        setError(undefined);
      } catch (fetchError) {
        if (abortController.signal.aborted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError : new Error(String(fetchError)));
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [adapter, objectId, pageSize]
  );

  const refetch = useCallback(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!enabled || isLoading || isLoadingMore || !hasMore) {
      return;
    }

    void fetchPage(pageIndex + 1, true);
  }, [enabled, fetchPage, hasMore, isLoading, isLoadingMore, pageIndex]);

  useEffect(() => {
    if (!enabled || !objectId) {
      setItems([]);
      setTotal(0);
      setPageIndex(0);
      setError(undefined);
      return;
    }

    setItems([]);
    setTotal(0);
    setPageIndex(0);
    setError(undefined);
    void fetchPage(0, false);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [enabled, fetchPage, objectId]);

  return {
    items,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
  };
};
