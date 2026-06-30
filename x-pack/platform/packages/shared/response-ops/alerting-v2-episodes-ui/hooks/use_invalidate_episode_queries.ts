/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@kbn/react-query';
import { queryKeys } from '../query_keys';

/**
 * Returns a stable callback that invalidates every episode-scoped query key
 * affected by an episode action (ack, snooze, resolve, tag, assignee, etc.).
 *
 * Use this in `onSuccess` handlers wherever episode actions are dispatched
 * (e.g. bulk and row actions on the table) to keep any other mounted consumer
 * of these queries — including an open details flyout sharing the same
 * `QueryClient` — in sync with the updated state.
 */
export const useInvalidateEpisodeQueries = () => {
  const queryClient = useQueryClient();

  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.actionsAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groupActionsAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.actionsHistoryAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.listAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.episodeAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.episodeEventsAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.episodeEventDataAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tagSuggestionsAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tagOptionsAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.histogramAll() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.kpisAll() }),
      ]),
    [queryClient]
  );
};
