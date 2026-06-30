/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useInfiniteQuery, useQuery } from '@kbn/react-query';
import { useInvalidateChangeHistory } from './use_invalidate_change_history';
import {
  changeHistoryDetailQueryKey,
  changeHistoryListQueryKey,
  changeHistoryObjectQueryKeyPrefix,
} from './change_history_list_query_key';
import { createQueryClientWrapper } from '../test_utils/create_query_client_wrapper';

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

    const { wrapper, queryClient } = createQueryClientWrapper();

    const { result: listResult } = renderHook(
      () => useInfiniteQuery(changeHistoryListQueryKey({ objectId: 'obj-1' }), () => listChanges()),
      { wrapper }
    );

    const { result: detailResult } = renderHook(
      () =>
        useQuery(changeHistoryDetailQueryKey({ objectId: 'obj-1', changeId: 'evt-1' }), () =>
          getChange()
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
      queryKey: changeHistoryObjectQueryKeyPrefix('obj-1'),
      refetchType: 'active',
    });

    await waitFor(() => {
      expect(listChanges).toHaveBeenCalledTimes(2);
      expect(getChange).toHaveBeenCalledTimes(2);
    });
  });
});
