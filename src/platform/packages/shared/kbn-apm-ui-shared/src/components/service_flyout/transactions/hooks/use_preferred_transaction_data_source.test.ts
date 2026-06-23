/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, waitFor } from '@testing-library/react';
import type { HttpStart } from '@kbn/core-http-browser';
import { usePreferredTransactionDataSource } from './use_preferred_transaction_data_source';

// 1-hour window: bucketSize = 3600 / 20 = 180s — only 1m (60s) fits
const START_1H = '2024-01-01T00:00:00.000Z';
const END_1H = '2024-01-01T01:00:00.000Z';

// 24-hour window: bucketSize = 86400 / 20 = 4320s — 60m (3600s) fits
const START_24H = '2024-01-01T00:00:00.000Z';
const END_24H = '2024-01-02T00:00:00.000Z';

function withSources(
  list: Array<{ documentType: string; rollupInterval: string; hasDocs: boolean }>,
  start = START_1H,
  end = END_1H
) {
  return {
    http: {
      get: jest.fn().mockResolvedValue({ sources: list }),
    } as unknown as HttpStart,
    start,
    end,
  };
}

describe('usePreferredTransactionDataSource', () => {
  describe('source selection', () => {
    it('prefers transactionMetric over transactionEvent', async () => {
      const { http, start, end } = withSources([
        { documentType: 'transactionEvent', rollupInterval: 'none', hasDocs: true },
        { documentType: 'transactionMetric', rollupInterval: '1m', hasDocs: true },
      ]);
      const { result } = renderHook(() => usePreferredTransactionDataSource({ http, start, end }));
      await waitFor(() => expect(result.current.dataSource).toBeDefined());
      expect(result.current.dataSource?.documentType).toBe('transactionMetric');
    });

    it('prefers coarser rollup interval that fits within the bucket size', async () => {
      // 24h window → bucketSize 4320s → 60m (3600s) fits
      const { http, start, end } = withSources(
        [
          { documentType: 'transactionMetric', rollupInterval: '1m', hasDocs: true },
          { documentType: 'transactionMetric', rollupInterval: '60m', hasDocs: true },
          { documentType: 'transactionMetric', rollupInterval: '10m', hasDocs: true },
        ],
        START_24H,
        END_24H
      );
      const { result } = renderHook(() => usePreferredTransactionDataSource({ http, start, end }));
      await waitFor(() => expect(result.current.dataSource).toBeDefined());
      expect(result.current.dataSource).toEqual({
        documentType: 'transactionMetric',
        rollupInterval: '60m',
      });
    });

    it('falls back to finest rollup when all rollups are coarser than the bucket size', async () => {
      // 1h window → bucketSize 180s → 10m (600s) and 60m (3600s) do not fit → falls back to 1m
      const { http, start, end } = withSources([
        { documentType: 'transactionMetric', rollupInterval: '10m', hasDocs: true },
        { documentType: 'transactionMetric', rollupInterval: '60m', hasDocs: true },
      ]);
      const { result } = renderHook(() => usePreferredTransactionDataSource({ http, start, end }));
      await waitFor(() => expect(result.current.dataSource).toBeDefined());
      expect(result.current.dataSource).toEqual({
        documentType: 'transactionMetric',
        rollupInterval: '10m',
      });
    });

    it('skips sources with hasDocs: false', async () => {
      const { http, start, end } = withSources([
        { documentType: 'transactionMetric', rollupInterval: '1m', hasDocs: false },
        { documentType: 'transactionEvent', rollupInterval: 'none', hasDocs: true },
      ]);
      const { result } = renderHook(() => usePreferredTransactionDataSource({ http, start, end }));
      await waitFor(() => expect(result.current.dataSource).toBeDefined());
      expect(result.current.dataSource?.documentType).toBe('transactionEvent');
    });

    it('falls back to transactionMetric/1m when all sources have hasDocs: false', async () => {
      const { http, start, end } = withSources([
        { documentType: 'transactionMetric', rollupInterval: '1m', hasDocs: false },
      ]);
      const { result } = renderHook(() => usePreferredTransactionDataSource({ http, start, end }));
      await waitFor(() => expect(result.current.dataSource).toBeDefined());
      expect(result.current.dataSource).toEqual({
        documentType: 'transactionMetric',
        rollupInterval: '1m',
      });
    });

    it('falls back to transactionMetric/1m when only ineligible document types are present', async () => {
      const { http, start, end } = withSources([
        { documentType: 'serviceTransactionMetric', rollupInterval: '1m', hasDocs: true },
      ]);
      const { result } = renderHook(() => usePreferredTransactionDataSource({ http, start, end }));
      await waitFor(() => expect(result.current.dataSource).toBeDefined());
      expect(result.current.dataSource).toEqual({
        documentType: 'transactionMetric',
        rollupInterval: '1m',
      });
    });

    it('ignores serviceTransactionMetric sources', async () => {
      const { http, start, end } = withSources([
        { documentType: 'serviceTransactionMetric', rollupInterval: '1m', hasDocs: true },
        { documentType: 'transactionMetric', rollupInterval: '1m', hasDocs: true },
      ]);
      const { result } = renderHook(() => usePreferredTransactionDataSource({ http, start, end }));
      await waitFor(() => expect(result.current.dataSource).toBeDefined());
      expect(result.current.dataSource?.documentType).toBe('transactionMetric');
    });
  });

  it('calls time_range_metadata with the correct params', async () => {
    const { http, start, end } = withSources([
      { documentType: 'transactionMetric', rollupInterval: '1m', hasDocs: true },
    ]);

    renderHook(() => usePreferredTransactionDataSource({ http, start, end }));

    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));

    expect(http.get).toHaveBeenCalledWith(
      '/internal/apm/time_range_metadata',
      expect.objectContaining({
        query: expect.objectContaining({
          start: START_1H,
          end: END_1H,
          kuery: '',
          useSpanName: false,
        }),
      })
    );
  });

  it('returns undefined dataSource and exposes the error when the metadata call fails', async () => {
    const fetchError = new Error('network error');
    const http = {
      get: jest.fn().mockRejectedValue(fetchError),
    } as unknown as HttpStart;

    const { result } = renderHook(() =>
      usePreferredTransactionDataSource({ http, start: START_1H, end: END_1H })
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.dataSource).toBeUndefined();
    expect(result.current.error).toBe(fetchError);
  });

  it('returns undefined dataSource with isLoading true before the response arrives', () => {
    const http = {
      get: jest.fn(() => new Promise(() => {})),
    } as unknown as HttpStart;

    const { result } = renderHook(() =>
      usePreferredTransactionDataSource({ http, start: START_1H, end: END_1H })
    );

    expect(result.current.dataSource).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});
