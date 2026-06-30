/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useInvalidateEpisodeQueries } from './use_invalidate_episode_queries';
import { queryKeys } from '../query_keys';

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock('@kbn/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

describe('useInvalidateEpisodeQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates every episode-scoped query key affected by an action', async () => {
    const { result } = renderHook(() => useInvalidateEpisodeQueries());

    await result.current();

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map(([arg]) => arg.queryKey);

    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        queryKeys.actionsAll(),
        queryKeys.groupActionsAll(),
        queryKeys.actionsHistoryAll(),
        queryKeys.listAll(),
        queryKeys.episodeAll(),
        queryKeys.episodeEventsAll(),
        queryKeys.episodeEventDataAll(),
        queryKeys.tagSuggestionsAll(),
        queryKeys.tagOptionsAll(),
        queryKeys.histogramAll(),
        queryKeys.kpisAll(),
      ])
    );
  });

  it('invalidates the timeline action-history query so it reacts to actions', async () => {
    const { result } = renderHook(() => useInvalidateEpisodeQueries());

    await result.current();

    const invalidatedKeys = mockInvalidateQueries.mock.calls.map(([arg]) => arg.queryKey);

    expect(invalidatedKeys).toContainEqual(queryKeys.actionsHistoryAll());
  });
});
