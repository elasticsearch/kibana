/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQueryClient } from '@kbn/react-query';
import { useCallback } from 'react';
import { DISCOVERY_QUERIES_QUERY_KEY } from './use_fetch_discovery_queries';
import { DISCOVERY_QUERIES_OCCURRENCES_QUERY_KEY } from './use_fetch_discovery_queries_occurrences';

export const useInvalidatePromoteRelatedQueries = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERIES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERIES_OCCURRENCES_QUERY_KEY }),
      ]),
    [queryClient]
  );
};
