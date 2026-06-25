/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createChangeHistoryHttpAdapter } from './create_http_adapter';
import type { ChangeHistoryListItem } from '../types/change_history_list_item';

describe('createChangeHistoryHttpAdapter', () => {
  it('fetches and maps list changes', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        items: [{ id: 'evt-1', timestamp: '2026-01-01T00:00:00Z' }],
        total: 1,
      }),
    };

    const mapListItem = jest.fn((dto: unknown) => dto as ChangeHistoryListItem);

    const adapter = createChangeHistoryHttpAdapter({
      http,
      listPath: '/api/example/{objectId}/history',
      mapListItem,
    });

    const result = await adapter.listChanges({
      objectId: 'entity-1',
      page: { index: 0, size: 20 },
    });

    expect(http.get).toHaveBeenCalledWith('/api/example/entity-1/history', {
      query: { page: 0, per_page: 20 },
      signal: undefined,
    });
    expect(mapListItem).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
  });

  it('getChange requires detailPath', async () => {
    const adapter = createChangeHistoryHttpAdapter({
      http: { get: jest.fn() },
      listPath: '/api/history/{objectId}',
    });

    await expect(
      adapter.getChange({
        objectId: 'entity-1',
        changeId: 'evt-1',
      })
    ).rejects.toThrow('detailPath is required');
  });
});
