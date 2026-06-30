/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useChangeHistoryAutoSelection } from './use_change_history_auto_selection';
import type { ChangeHistoryListItem } from '../types/change_history_list_item';

const createItem = (id: string): ChangeHistoryListItem => ({
  id,
  timestamp: '2026-01-01T00:00:00Z',
  actor: { name: 'Alice' },
  action: 'Updated',
});

describe('useChangeHistoryAutoSelection', () => {
  it('auto-selects the first item once the first page fetch settles', async () => {
    const setSelectedChangeId = jest.fn();

    const { rerender } = renderHook(
      ({ items, isFetchingFirstPage }) =>
        useChangeHistoryAutoSelection({
          objectId: 'obj-1',
          items,
          isFetchingFirstPage,
          setSelectedChangeId,
        }),
      {
        initialProps: {
          items: [] as ChangeHistoryListItem[],
          isFetchingFirstPage: true,
        },
      }
    );

    rerender({
      items: [createItem('evt-1')],
      isFetchingFirstPage: true,
    });

    expect(setSelectedChangeId).toHaveBeenCalledWith('evt-1');

    setSelectedChangeId.mockClear();

    rerender({
      items: [createItem('evt-1')],
      isFetchingFirstPage: false,
    });

    expect(setSelectedChangeId).toHaveBeenLastCalledWith('evt-1');

    setSelectedChangeId.mockClear();

    rerender({
      items: [createItem('evt-2'), createItem('evt-1')],
      isFetchingFirstPage: false,
    });

    expect(setSelectedChangeId).not.toHaveBeenCalled();
  });

  it('re-selects the first item after unlock when fresh items arrive', async () => {
    const setSelectedChangeId = jest.fn();

    const { result, rerender } = renderHook(
      ({ items, isFetchingFirstPage }) =>
        useChangeHistoryAutoSelection({
          objectId: 'obj-1',
          items,
          isFetchingFirstPage,
          setSelectedChangeId,
        }),
      {
        initialProps: {
          items: [createItem('evt-1')],
          isFetchingFirstPage: false,
        },
      }
    );

    await waitFor(() => {
      expect(setSelectedChangeId).toHaveBeenCalledWith('evt-1');
    });

    setSelectedChangeId.mockClear();
    result.current.lockSelectionDecision();

    rerender({
      items: [createItem('evt-2'), createItem('evt-1')],
      isFetchingFirstPage: true,
    });

    expect(setSelectedChangeId).not.toHaveBeenCalled();

    result.current.unlockSelectionDecision();

    rerender({
      items: [createItem('evt-2'), createItem('evt-1')],
      isFetchingFirstPage: false,
    });

    expect(setSelectedChangeId).toHaveBeenCalledWith('evt-2');
  });

  it('invokes onAutoSelect when auto-selecting the first item', async () => {
    const onAutoSelect = jest.fn();
    const firstItem = createItem('evt-1');

    const { rerender } = renderHook(
      ({ items, isFetchingFirstPage }) =>
        useChangeHistoryAutoSelection({
          objectId: 'obj-1',
          items,
          isFetchingFirstPage,
          setSelectedChangeId: jest.fn(),
          onAutoSelect,
        }),
      {
        initialProps: {
          items: [] as ChangeHistoryListItem[],
          isFetchingFirstPage: true,
        },
      }
    );

    rerender({
      items: [firstItem],
      isFetchingFirstPage: false,
    });

    await waitFor(() => {
      expect(onAutoSelect).toHaveBeenCalledWith(firstItem);
    });
  });

  it('resets selection when objectId changes', () => {
    const setSelectedChangeId = jest.fn();

    const { rerender } = renderHook(
      ({ objectId }) =>
        useChangeHistoryAutoSelection({
          objectId,
          items: [createItem('evt-1')],
          isFetchingFirstPage: false,
          setSelectedChangeId,
        }),
      { initialProps: { objectId: 'obj-1' } }
    );

    setSelectedChangeId.mockClear();

    rerender({ objectId: 'obj-2' });

    expect(setSelectedChangeId).toHaveBeenCalledWith(undefined);
  });
});
