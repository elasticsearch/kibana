/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type { ChangeHistoryDetail } from '../types/change_history_detail';
import { changeHistoryDetailQueryKey } from './change_history_list_query_key';

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
  const { data, error, isLoading } = useQuery<ChangeHistoryDetail, Error>(
    changeHistoryDetailQueryKey({
      objectId,
      changeId: changeId ?? '__none__',
    }),
    ({ signal }) => {
      if (!changeId) {
        throw new Error('changeId is required');
      }

      return adapter.getChange({ objectId, changeId, signal });
    },
    {
      enabled: enabled && Boolean(changeId) && Boolean(objectId),
      keepPreviousData: true,
    }
  );

  return {
    change: changeId ? data : undefined,
    isLoading,
    error: error ?? undefined,
  };
};
