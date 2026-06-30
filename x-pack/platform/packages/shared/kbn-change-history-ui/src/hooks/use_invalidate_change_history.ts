/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQueryClient } from '@kbn/react-query';
import { useCallback } from 'react';
import {
  CHANGE_HISTORY_QUERY_KEY,
  changeHistoryObjectQueryKeyPrefix,
} from './change_history_list_query_key';

export const useInvalidateChangeHistory = () => {
  const queryClient = useQueryClient();

  return useCallback(
    async (objectId?: string): Promise<void> => {
      await queryClient.invalidateQueries({
        queryKey: objectId ? changeHistoryObjectQueryKeyPrefix(objectId) : CHANGE_HISTORY_QUERY_KEY,
        refetchType: 'active',
      });
    },
    [queryClient]
  );
};
