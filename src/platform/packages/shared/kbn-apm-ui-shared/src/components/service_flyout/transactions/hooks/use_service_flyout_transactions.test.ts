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
import { LatencyAggregationType } from '@kbn/apm-types';
import { useServiceFlyoutTransactions } from './use_service_flyout_transactions';
import { usePreferredTransactionDataSource } from './use_preferred_transaction_data_source';

jest.mock('./use_preferred_transaction_data_source', () => ({
  usePreferredTransactionDataSource: jest.fn().mockReturnValue({
    dataSource: { documentType: 'transactionMetric', rollupInterval: '1m' },
    isLoading: false,
  }),
}));

const START = '2024-01-01T00:00:00.000Z';
const END = '2024-01-01T01:00:00.000Z';

const mockAddDanger = jest.fn();

const BASE_PARAMS = {
  notifications: { toasts: { addDanger: mockAddDanger } } as any,
  serviceName: 'my-service',
  environment: 'production',
  start: START,
  end: END,
  transactionType: 'request',
  latencyAggregationType: LatencyAggregationType.p95,
  searchQuery: '',
};

const EMPTY_RESPONSE = { transactionGroups: [], maxCountExceeded: false };

function makeHttp(resolvedValue: object) {
  return {
    get: jest.fn().mockResolvedValue(resolvedValue),
  } as unknown as HttpStart;
}

const mockedUsePreferredTransactionDataSource = usePreferredTransactionDataSource as jest.Mock;

describe('useServiceFlyoutTransactions', () => {
  beforeEach(() => {
    mockAddDanger.mockClear();
  });
  it('calls http.get with the correct endpoint and params', async () => {
    const http = makeHttp(EMPTY_RESPONSE);

    renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));

    expect(http.get).toHaveBeenCalledWith(
      '/internal/apm/services/my-service/transactions/groups/main_statistics',
      expect.objectContaining({
        query: expect.objectContaining({
          environment: 'production',
          start: START,
          end: END,
          transactionType: 'request',
          latencyAggregationType: LatencyAggregationType.p95,
          kuery: '',
          documentType: 'transactionMetric',
          rollupInterval: '1m',
          searchQuery: '',
        }),
      })
    );
  });

  it('URL-encodes the service name', async () => {
    const http = makeHttp(EMPTY_RESPONSE);

    renderHook(() =>
      useServiceFlyoutTransactions({ http, ...BASE_PARAMS, serviceName: 'my service/v2' })
    );

    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    expect(http.get).toHaveBeenCalledWith(
      '/internal/apm/services/my%20service%2Fv2/transactions/groups/main_statistics',
      expect.anything()
    );
  });

  it('does not call http.get when transactionType is undefined', () => {
    const http = makeHttp(EMPTY_RESPONSE);

    renderHook(() =>
      useServiceFlyoutTransactions({ http, ...BASE_PARAMS, transactionType: undefined })
    );

    expect(http.get).not.toHaveBeenCalled();
  });

  it('does not call http.get when latencyAggregationType is undefined', () => {
    const http = makeHttp(EMPTY_RESPONSE);

    renderHook(() =>
      useServiceFlyoutTransactions({ http, ...BASE_PARAMS, latencyAggregationType: undefined })
    );

    expect(http.get).not.toHaveBeenCalled();
  });

  it('maps response transactionGroups to TransactionGroup items', async () => {
    const http = makeHttp({
      maxCountExceeded: false,
      transactionGroups: [
        {
          name: 'GET /api/orders',
          transactionType: 'request',
          latency: 1200000,
          throughput: 42.3,
          errorRate: 0.02,
          alertsCount: 1,
          impact: 90,
        },
      ],
    });

    const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toEqual({
      name: 'GET /api/orders',
      transactionType: 'request',
      latency: { value: 1200000 },
      throughput: { value: 42.3 },
      errorRate: { value: 0.02 },
      alertsCount: 1,
      impact: { value: 90 },
    });
  });

  it('maps null latency and errorRate correctly', async () => {
    const http = makeHttp({
      maxCountExceeded: false,
      transactionGroups: [
        { name: 'GET /api', latency: null, throughput: 0, errorRate: null, alertsCount: 0 },
      ],
    });

    const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    expect(result.current.items[0].latency.value).toBeNull();
    expect(result.current.items[0].errorRate.value).toBeNull();
    expect(result.current.items[0].throughput.value).toBe(0);
  });

  it('omits impact when the field is missing from the response', async () => {
    const http = makeHttp({
      maxCountExceeded: false,
      transactionGroups: [
        { name: 'GET /api', latency: 100, throughput: 1, errorRate: 0, alertsCount: 0 },
      ],
    });

    const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].impact).toBeUndefined();
  });

  it('reflects maxCountExceeded from the response', async () => {
    const http = makeHttp({ transactionGroups: [], maxCountExceeded: true });

    const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(result.current.maxCountExceeded).toBe(true));
  });

  it('reflects hasActiveAlerts from the response', async () => {
    const http = makeHttp({
      transactionGroups: [],
      maxCountExceeded: false,
      hasActiveAlerts: true,
    });

    const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(result.current.hasActiveAlerts).toBe(true));
  });

  it('defaults hasActiveAlerts to false when absent from the response', async () => {
    const http = makeHttp(EMPTY_RESPONSE);

    const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(result.current.hasActiveAlerts).toBe(false));
  });

  it('filters items in-memory when maxCountExceeded is false and searchQuery changes', async () => {
    const http = makeHttp({
      maxCountExceeded: false,
      transactionGroups: [
        { name: 'GET /api/orders', latency: 100, throughput: 1, errorRate: 0, alertsCount: 0 },
        { name: 'POST /api/checkout', latency: 200, throughput: 2, errorRate: 0, alertsCount: 0 },
      ],
    });

    const { result, rerender } = renderHook(
      ({ searchQuery }: { searchQuery: string }) =>
        useServiceFlyoutTransactions({ http, ...BASE_PARAMS, searchQuery }),
      { initialProps: { searchQuery: '' } }
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));

    rerender({ searchQuery: 'checkout' });

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('POST /api/checkout');
  });

  it('re-fetches when searchQuery changes and maxCountExceeded is true', async () => {
    const http = makeHttp({ transactionGroups: [], maxCountExceeded: true });

    const { rerender } = renderHook(
      ({ searchQuery }: { searchQuery: string }) =>
        useServiceFlyoutTransactions({ http, ...BASE_PARAMS, searchQuery }),
      { initialProps: { searchQuery: '' } }
    );

    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));

    rerender({ searchQuery: 'checkout' });

    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(2));
    expect(http.get).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ query: expect.objectContaining({ searchQuery: 'checkout' }) })
    );
  });

  it('returns isLoading true while the request is in flight', async () => {
    let resolveRequest!: (value: object) => void;
    const http = {
      get: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          })
      ),
    } as unknown as HttpStart;

    const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    resolveRequest(EMPTY_RESPONSE);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  describe('when the data source fetch fails', () => {
    const fetchError = new Error('network error');
    const http = makeHttp(EMPTY_RESPONSE);

    beforeAll(() => {
      mockedUsePreferredTransactionDataSource.mockReturnValue({
        dataSource: undefined,
        isLoading: false,
        error: fetchError,
      });
    });

    afterAll(() => {
      mockedUsePreferredTransactionDataSource.mockReturnValue({
        dataSource: { documentType: 'transactionMetric', rollupInterval: '1m' },
        isLoading: false,
      });
    });

    it('returns the error in the hook result', async () => {
      const { result } = renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));
      await waitFor(() => expect(result.current.error).toBe(fetchError));
    });

    it('fires a danger toast with the error title', async () => {
      renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));
      await waitFor(() =>
        expect(mockAddDanger).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Failed to load transaction data' })
        )
      );
    });

    it('does not call http.get for the main statistics', () => {
      renderHook(() => useServiceFlyoutTransactions({ http, ...BASE_PARAMS }));
      expect(http.get).not.toHaveBeenCalled();
    });
  });
});
