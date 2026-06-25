/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type { ChangeHistoryDetail } from '../types/change_history_detail';

export interface UseChangeHistoryDetailArgs {
  adapter: ChangeHistoryAdapter;
  objectId: string;
  changeId?: string;
  enabled?: boolean;
}

export interface UseChangeHistoryDetailResult {
  change?: ChangeHistoryDetail;
  isLoading: boolean;
  error?: Error;
}

export const useChangeHistoryDetail = ({
  adapter,
  objectId,
  changeId,
  enabled = true,
}: UseChangeHistoryDetailArgs): UseChangeHistoryDetailResult => {
  const [change, setChange] = useState<ChangeHistoryDetail | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const abortControllerRef = useRef<AbortController | undefined>();

  useEffect(() => {
    if (!enabled || !changeId || !objectId) {
      setChange(undefined);
      setError(undefined);
      setIsLoading(false);
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const showLoadingTimer = setTimeout(() => {
      if (!abortController.signal.aborted) {
        setIsLoading(true);
      }
    }, 0);

    adapter
      .getChange({ objectId, changeId, signal: abortController.signal })
      .then((detail) => {
        if (abortController.signal.aborted) {
          return;
        }

        setChange(detail);
        setError(undefined);
      })
      .catch((fetchError) => {
        if (abortController.signal.aborted) {
          return;
        }

        setChange(undefined);
        setError(fetchError instanceof Error ? fetchError : new Error(String(fetchError)));
      })
      .finally(() => {
        if (showLoadingTimer) {
          clearTimeout(showLoadingTimer);
        }

        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
      }
      abortController.abort();
    };
  }, [adapter, changeId, enabled, objectId]);

  return { change, isLoading, error };
};
