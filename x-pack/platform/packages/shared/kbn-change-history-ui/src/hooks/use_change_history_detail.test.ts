/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useChangeHistoryDetail } from './use_change_history_detail';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type { ChangeHistoryDetail } from '../types/change_history_detail';

describe('useChangeHistoryDetail', () => {
  it('does not show loading for synchronously resolved cache hits', async () => {
    const detail: ChangeHistoryDetail = {
      id: 'evt-1',
      timestamp: '2026-01-01T00:00:00Z',
      actor: { name: 'Alice' },
      action: 'Updated',
      snapshot: { workflow: { yaml: 'name: test\n' } },
    };

    const adapter: ChangeHistoryAdapter = {
      listChanges: jest.fn(),
      getChange: jest.fn().mockReturnValue(Promise.resolve(detail)),
    };

    const { result } = renderHook(() =>
      useChangeHistoryDetail({
        adapter,
        objectId: 'obj-1',
        changeId: 'evt-1',
      })
    );

    await waitFor(() => {
      expect(result.current.change).toEqual(detail);
    });

    expect(result.current.isLoading).toBe(false);
  });
});
