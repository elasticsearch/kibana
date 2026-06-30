/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useRef, useState } from 'react';
import type { ChangeHistoryError } from '../types/change_history_error';
import type { RestoreChangeParams } from '../types/restore_change_params';
import { useChangeHistoryConfig } from '../provider/use_change_history_config';
import { mapChangeHistoryRestoreError } from '../utils/map_change_history_restore_error';
import { useInvalidateChangeHistory } from './use_invalidate_change_history';

export interface UseChangeHistoryRestoreArgs {
  /** Invoked after a successful restore, before cache invalidation (e.g. to unlock selection). */
  onRestored?: () => Promise<void> | void;
}

export interface UseChangeHistoryRestoreResult {
  canRestore: boolean;
  isRestoring: boolean;
  error?: ChangeHistoryError;
  clearError: () => void;
  restoreChange: (params: RestoreChangeParams) => Promise<boolean>;
}

export const useChangeHistoryRestore: (
  args?: UseChangeHistoryRestoreArgs
) => UseChangeHistoryRestoreResult = ({ onRestored } = {}) => {
  const { adapter, objectId, supports } = useChangeHistoryConfig();
  const invalidateChangeHistory = useInvalidateChangeHistory();
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<ChangeHistoryError | undefined>();
  const abortControllerRef = useRef<AbortController | undefined>();

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  const restoreChange = useCallback(
    async (params: RestoreChangeParams): Promise<boolean> => {
      if (!supports.restore || !adapter.restoreChange) {
        return false;
      }

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsRestoring(true);
      setError(undefined);

      try {
        await adapter.restoreChange({
          ...params,
          signal: params.signal ?? abortController.signal,
        });

        if (abortController.signal.aborted) {
          return false;
        }

        await onRestored?.();
        await invalidateChangeHistory(objectId);

        if (abortController.signal.aborted) {
          return false;
        }

        return true;
      } catch (restoreError) {
        if (abortController.signal.aborted) {
          return false;
        }

        setError(mapChangeHistoryRestoreError(restoreError));
        return false;
      } finally {
        if (!abortController.signal.aborted) {
          setIsRestoring(false);
        }
      }
    },
    [adapter, invalidateChangeHistory, objectId, onRestored, supports.restore]
  );

  return {
    canRestore: supports.restore,
    isRestoring,
    error,
    clearError,
    restoreChange,
  };
};
