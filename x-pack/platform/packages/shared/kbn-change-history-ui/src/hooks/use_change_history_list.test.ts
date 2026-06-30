/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useChangeHistoryList } from './use_change_history_list';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import { TEST_OBJECT_ID } from '../test_utils/change_history_test_fixtures';
import { createQueryClientWrapper } from '../test_utils/create_query_client_wrapper';

describe('useChangeHistoryList', () => {
  it('loads paginated changes and appends on loadMore', async () => {
    const listChanges = jest
      .fn()
      .mockResolvedValueOnce({
        items: [
          { id: 'evt-1', timestamp: '2026-01-01T00:00:00Z', actor: { name: 'a' }, action: 'x' },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [
          { id: 'evt-2', timestamp: '2026-01-02T00:00:00Z', actor: { name: 'b' }, action: 'y' },
        ],
        total: 2,
      });

    const adapter: ChangeHistoryAdapter = {
      listChanges,
      getChange: jest.fn(),
    };

    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(
      () =>
        useChangeHistoryList({
          adapter,
          objectId: 'obj-1',
          pageSize: 1,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    result.current.loadMore();

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });

    expect(listChanges).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        objectId: 'obj-1',
        page: { index: 0, size: 1 },
      })
    );
    expect(listChanges).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        objectId: 'obj-1',
        page: { index: 1, size: 1 },
      })
    );
  });

  it('clears items immediately when objectId changes', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const listChanges = jest.fn().mockImplementation(({ objectId }) => {
      if (objectId === 'obj-1') {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }

      return Promise.resolve({
        items: [
          { id: 'evt-b', timestamp: '2026-02-01T00:00:00Z', actor: { name: 'b' }, action: 'y' },
        ],
        total: 1,
      });
    });

    const adapter: ChangeHistoryAdapter = {
      listChanges,
      getChange: jest.fn(),
    };

    const { wrapper } = createQueryClientWrapper();

    const { result, rerender } = renderHook(
      ({ objectId }) =>
        useChangeHistoryList({
          adapter,
          objectId,
          pageSize: 20,
        }),
      { initialProps: { objectId: 'obj-1' }, wrapper }
    );

    rerender({ objectId: 'obj-2' });

    expect(result.current.items).toEqual([]);

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    expect(result.current.items[0]?.id).toBe('evt-b');

    resolveFirst?.({
      items: [
        { id: 'evt-a', timestamp: '2026-01-01T00:00:00Z', actor: { name: 'a' }, action: 'x' },
      ],
      total: 1,
    });

    await waitFor(() => {
      expect(listChanges).toHaveBeenCalledTimes(2);
    });

    expect(result.current.items[0]?.id).toBe('evt-b');
  });

  it('refetch reloads the first page', async () => {
    const listChanges = jest
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: 'evt-7',
            timestamp: '2026-06-16T12:00:00.000Z',
            actor: { name: 'Alice' },
            action: 'Updated',
            isCurrent: true,
            metadata: { version: 7 },
          },
        ],
        total: 7,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'evt-8',
            timestamp: '2026-06-16T13:00:00.000Z',
            actor: { name: 'Alice' },
            action: 'restore',
            isCurrent: true,
            metadata: { version: 8 },
          },
          {
            id: 'evt-7',
            timestamp: '2026-06-16T12:00:00.000Z',
            actor: { name: 'Alice' },
            action: 'Updated',
            metadata: { version: 7 },
          },
        ],
        total: 8,
      });

    const adapter: ChangeHistoryAdapter = {
      listChanges,
      getChange: jest.fn(),
    };

    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(
      () =>
        useChangeHistoryList({
          adapter,
          objectId: TEST_OBJECT_ID,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(listChanges).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(result.current.items[0]?.id).toBe('evt-8');
    });
    expect(result.current.total).toBe(8);
  });
});
