/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useInfiniteQuery, useQuery } from '@kbn/react-query';
import { createChangeHistoryHookWrapper } from '../test_utils/create_change_history_hook_wrapper';
import { useInvalidateChangeHistory } from './use_invalidate_change_history';
import {
  changeHistoryDetailQueryKey,
  changeHistoryListQueryKey,
  changeHistoryObjectQueryKeyPrefix,
  changeHistoryScopeQueryKeyPrefix,
} from './change_history_list_query_key';

const testScope = {
  module: 'stack',
  dataset: 'workflows',
  objectType: 'workflow',
} as const;

describe('useInvalidateChangeHistory', () => {
  it('invalidates list and detail queries for an object', async () => {
    const listChanges = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const getChange = jest.fn().mockResolvedValue({
      id: 'evt-1',
      timestamp: '2026-01-01T00:00:00Z',
      actor: { name: 'Alice' },
      action: 'Updated',
      snapshot: { name: 'test' },
    });

    const adapter = { listChanges, getChange };
    const { wrapper, queryClient } = createChangeHistoryHookWrapper({
      adapter,
      objectId: 'obj-1',
      scope: testScope,
    });

    const { result: listResult } = renderHook(
      () =>
        useInfiniteQuery(changeHistoryListQueryKey({ objectId: 'obj-1', scope: testScope }), () =>
          listChanges()
        ),
      { wrapper }
    );

    const { result: detailResult } = renderHook(
      () =>
        useQuery(
          changeHistoryDetailQueryKey({ objectId: 'obj-1', changeId: 'evt-1', scope: testScope }),
          () => getChange()
        ),
      { wrapper }
    );

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true);
      expect(detailResult.current.isSuccess).toBe(true);
    });

    expect(listChanges).toHaveBeenCalledTimes(1);
    expect(getChange).toHaveBeenCalledTimes(1);

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result: invalidateResult } = renderHook(() => useInvalidateChangeHistory(), {
      wrapper,
    });

    await invalidateResult.current('obj-1');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: changeHistoryObjectQueryKeyPrefix('obj-1', testScope),
      refetchType: 'active',
    });

    await waitFor(() => {
      expect(listChanges).toHaveBeenCalledTimes(2);
      expect(getChange).toHaveBeenCalledTimes(2);
    });
  });

  it('invalidates all queries for the provider scope when objectId is omitted', async () => {
    const adapter = {
      listChanges: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getChange: jest.fn(),
    };
    const { wrapper, queryClient } = createChangeHistoryHookWrapper({
      adapter,
      objectId: 'obj-1',
      scope: testScope,
    });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result: invalidateResult } = renderHook(() => useInvalidateChangeHistory(), {
      wrapper,
    });

    await invalidateResult.current();

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: changeHistoryScopeQueryKeyPrefix(testScope),
      refetchType: 'active',
    });
  });
});
