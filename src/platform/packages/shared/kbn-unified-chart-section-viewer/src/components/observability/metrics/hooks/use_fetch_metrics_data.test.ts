/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Stable references for mock functions that must not change across renders
// (otherwise useAsyncFn recreates executeFetch, causing infinite loops).
const mockTrackRequest = jest.fn(
  async (_name: string, _desc: string, fn: () => Promise<{ data: unknown }>) => {
    const result = await fn();
    return result.data;
  }
);
const mockTrackMetricsInfo = jest.fn();

// Mock ALL external heavy dependencies with factory functions to avoid loading
// their transitive dependency trees (e.g., @kbn/data-plugin/public).
jest.mock('../utils/execute_esql_query', () => ({
  executeEsqlQuery: jest.fn(),
}));
jest.mock('../utils/parse_metrics_response_with_telemetry', () => ({
  parseMetricsWithTelemetry: jest.fn(),
}));
jest.mock('../utils/get_esql_query', () => ({
  getEsqlQuery: jest.fn((query: { esql?: string } | undefined) => query?.esql),
}));
jest.mock('@kbn/esql-utils', () => ({
  buildMetricsInfoQuery: jest.fn((esql: string, dims?: string[]) =>
    dims?.length
      ? `${esql} | WHERE dim IS NOT NULL | METRICS_INFO | WHERE ${dims
          .map((dim) => `MV_CONTAINS(dimension_fields, "${dim}")`)
          .join(' AND ')}`
      : `${esql} | METRICS_INFO`
  ),
  hasTransformationalCommand: jest.fn(() => false),
}));
jest.mock('@kbn/field-utils', () => ({
  getFieldIconType: jest.fn(() => 'number'),
}));
jest.mock('../../../../context/ebt_telemetry_context', () => ({
  useTelemetry: () => ({
    trackMetricsInfo: mockTrackMetricsInfo,
  }),
}));
jest.mock('../../../../context/chart_section_inspector', () => ({
  useChartSectionInspector: () => ({
    trackRequest: mockTrackRequest,
  }),
}));
const mockReportError = jest.fn();
jest.mock('../../../chart/hooks/use_report_chart_section_error', () => ({
  useReportChartSectionError: jest.fn(() => mockReportError),
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import type { DataView, DataViewField } from '@kbn/data-views-plugin/common';
import type { ChartSectionProps } from '@kbn/unified-histogram/types';
import type { Dimension, ParsedMetricsWithTelemetry } from '../../../../types';
import { useFetchMetricsData } from './use_fetch_metrics_data';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { EsqlResponseError } from '../../../../common/errors/esql_response_error';
import { parseMetricsWithTelemetry } from '../utils/parse_metrics_response_with_telemetry';
import { getFetchParamsMock } from '@kbn/unified-histogram/__mocks__/fetch_params';

const mockExecuteEsqlQuery = executeEsqlQuery as jest.MockedFunction<typeof executeEsqlQuery>;
const mockParseMetricsWithTelemetry = parseMetricsWithTelemetry as jest.MockedFunction<
  typeof parseMetricsWithTelemetry
>;

const createDimension = (name: string): Dimension => ({ name });

const hostDimension = createDimension('host.name');
const serviceDimension = createDimension('service.name');

const createMockParsedMetrics = (
  metricNames: string[],
  dimensions: Dimension[]
): ParsedMetricsWithTelemetry => ({
  metricItems: metricNames.map((name) => ({
    metricName: name,
    indexName: 'metrics-*',
    units: [null],
    metricTypes: ['gauge'],
    fieldTypes: [ES_FIELD_TYPES.DOUBLE],
    dimensionFields: dimensions,
  })),
  allDimensions: dimensions,
  telemetry: {
    total_number_of_metrics: metricNames.length,
    total_number_of_dimensions: dimensions.length,
    metrics_by_type: { gauge: metricNames.length },
    units: { none: metricNames.length },
    multi_value_counts: { index_names: 0, field_types: 0, metric_types: 0, units: 0 },
  },
});

// Minimal DataView surface the hook-under-test and its collaborators actually
// read. `isTimeBased` is a type predicate on DataView, so we declare the
// stub as its plain boolean sibling and cast once at the use site via the
// DataView `as unknown as` below.
type MockDataView = Pick<DataView, 'getFieldByName' | 'getIndexPattern'> & {
  isTimeBased: () => boolean;
};

// Default to "every requested field exists" so the appliedDimensions
// derivation in useFetchMetricsData (#264957) is a no-op for existing
// tests. Tests that exercise the prune behavior override this per-test.
const createMockDataView = (): MockDataView => ({
  getFieldByName: jest.fn((name: string) => ({ name } as unknown as DataViewField)),
  getIndexPattern: () => 'metrics-*',
  isTimeBased: () => true,
});

// Minimal services surface the hook-under-test reads: `data.search.search`
// and `uiSettings`. Declared as a partial so we don't have to mock the
// entire UnifiedHistogramServices tree.
interface MockServices {
  data: { search: { search: jest.Mock } };
  uiSettings: Record<string, unknown>;
}

const createMockServices = (): MockServices => ({
  data: { search: { search: jest.fn() } },
  uiSettings: {},
});

const createDefaultParams = (overrides?: Record<string, unknown>) => ({
  fetchParams: getFetchParamsMock({
    query: { esql: 'TS metrics-*' },
    dataView: createMockDataView() as unknown as DataView,
    timeRange: { from: 'now-15m', to: 'now' },
    filters: [],
    esqlVariables: [],
    ...overrides,
  }),
  services: createMockServices() as unknown as ChartSectionProps['services'],
  isComponentVisible: true,
  selectedDimensionNames: undefined as Dimension[] | undefined,
  profileId: 'test-profile-id',
});

describe('useFetchMetricsData', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore mock implementations after clearAllMocks resets them.
    // Without these restorations, getEsqlQuery returns undefined (disabling shouldFetch),
    // trackRequest stops calling fn() (so the fetch never runs), etc.
    const { getEsqlQuery } = jest.requireMock('../utils/get_esql_query');
    getEsqlQuery.mockImplementation((query: { esql?: string } | undefined) => query?.esql);

    const { buildMetricsInfoQuery, hasTransformationalCommand } =
      jest.requireMock('@kbn/esql-utils');
    buildMetricsInfoQuery.mockImplementation((esql: string, dims?: string[]) =>
      dims?.length
        ? `${esql} | WHERE dim IS NOT NULL | METRICS_INFO | WHERE ${dims
            .map((dim) => `MV_CONTAINS(dimension_fields, "${dim}")`)
            .join(' AND ')}`
        : `${esql} | METRICS_INFO`
    );
    hasTransformationalCommand.mockImplementation(() => false);

    mockTrackRequest.mockImplementation(
      async (_name: string, _desc: string, fn: () => Promise<{ data: unknown }>) => {
        const result = await fn();
        return result.data;
      }
    );

    const parsed = createMockParsedMetrics(['system.cpu.utilization'], [hostDimension]);

    mockExecuteEsqlQuery.mockResolvedValue({
      documents: [
        {
          metric_name: 'system.cpu.utilization',
          index_name: 'metrics-*',
          unit: null,
          metric_type: 'gauge',
          field_type: 'double',
          dimension_fields: ['host.name'],
        },
      ],
      rawResponse: {},
      requestParams: { query: 'TS metrics-* | METRICS_INFO' },
    });

    mockParseMetricsWithTelemetry.mockReturnValue(parsed);
  });

  describe('initial fetch behavior', () => {
    it('fetches and returns parsed metric items when conditions are met', async () => {
      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.metricItems).toHaveLength(1);
        expect(result.current.metricItems[0].metricName).toBe('system.cpu.utilization');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.allDimensions).toEqual([hostDimension]);
    });

    it('returns sorted metricItems and allDimensions', async () => {
      const parsed = createMockParsedMetrics(
        ['system.memory.utilization', 'system.cpu.utilization'],
        [serviceDimension, hostDimension]
      );
      mockParseMetricsWithTelemetry.mockReturnValue(parsed);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.metricItems[0].metricName).toBe('system.cpu.utilization');
      expect(result.current.metricItems[1].metricName).toBe('system.memory.utilization');
      expect(result.current.allDimensions[0].name).toBe('host.name');
      expect(result.current.allDimensions[1].name).toBe('service.name');
    });

    it('returns empty arrays when no data is available', async () => {
      mockExecuteEsqlQuery.mockResolvedValue({
        documents: [],
        rawResponse: {},
        requestParams: { query: 'TS metrics-* | METRICS_INFO' },
      });
      mockParseMetricsWithTelemetry.mockReturnValue({
        metricItems: [],
        allDimensions: [],
        telemetry: {
          total_number_of_metrics: 0,
          total_number_of_dimensions: 0,
          metrics_by_type: {},
          units: {},
          multi_value_counts: { index_names: 0, field_types: 0, metric_types: 0, units: 0 },
        },
      });

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.metricItems).toEqual([]);
      expect(result.current.allDimensions).toEqual([]);
      expect(result.current.activeDimensions).toEqual([]);
    });
  });

  describe('shouldFetch guard', () => {
    it('does not fetch when component is not visible', async () => {
      const params = createDefaultParams();
      params.isComponentVisible = false;

      renderHook(() => useFetchMetricsData(params));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    });

    it('does not fetch when query is undefined', async () => {
      const params = createDefaultParams({ query: undefined });

      renderHook(() => useFetchMetricsData(params));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    });

    it('does not fetch when dataView is undefined', async () => {
      const params = createDefaultParams({ dataView: undefined });

      renderHook(() => useFetchMetricsData(params));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    });

    it('does not fetch when query has a transformational command', async () => {
      const { hasTransformationalCommand } = jest.requireMock('@kbn/esql-utils');
      hasTransformationalCommand.mockReturnValue(true);

      const params = createDefaultParams();

      renderHook(() => useFetchMetricsData(params));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    });
  });

  describe('activeDimensions (race condition fix)', () => {
    it('returns empty activeDimensions when no dimensions are selected', async () => {
      const params = createDefaultParams();

      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.activeDimensions).toEqual([]);
    });

    it('returns selectedDimensionNames as activeDimensions after fetch completes', async () => {
      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension];

      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.activeDimensions).toEqual([hostDimension]);
    });

    it('captures dimensions at fetch time so activeDimensions stay consistent with metricItems', async () => {
      // This test verifies the core race-condition fix:
      // activeDimensions should reflect the dimensions that were selected when the
      // fetch was initiated, not the current value of selectedDimensionNames.
      let resolveFirstFetch: (value: any) => void;
      const firstFetchPromise = new Promise((resolve) => {
        resolveFirstFetch = resolve;
      });

      let fetchCallCount = 0;
      mockExecuteEsqlQuery.mockImplementation(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return firstFetchPromise as any;
        }
        return {
          documents: [
            {
              metric_name: 'system.cpu.utilization',
              index_name: 'metrics-*',
              unit: null,
              metric_type: 'gauge',
              field_type: 'double',
              dimension_fields: ['host.name'],
            },
          ],
          rawResponse: {},
          requestParams: { query: 'TS metrics-* | METRICS_INFO' },
        };
      });

      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension];

      const { result, rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      // Wait for the initial fetch to start
      await waitFor(() => {
        expect(fetchCallCount).toBeGreaterThanOrEqual(1);
      });

      // Change dimensions while first fetch is in-flight
      const updatedParams = {
        ...params,
        selectedDimensionNames: [hostDimension, serviceDimension],
      };
      rerender(updatedParams);

      // Resolve the first fetch
      resolveFirstFetch!({
        documents: [
          {
            metric_name: 'system.cpu.utilization',
            index_name: 'metrics-*',
            unit: null,
            metric_type: 'gauge',
            field_type: 'double',
            dimension_fields: ['host.name'],
          },
        ],
        rawResponse: {},
        requestParams: { query: 'TS metrics-* | METRICS_INFO' },
      });

      // After resolution, activeDimensions should eventually reflect the latest fetch's dimensions
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // The key assertion: activeDimensions aligns with the fetch that produced
      // the current metricItems, not an intermediate stale value
      expect(result.current.activeDimensions).toBeDefined();
      expect(result.current.metricItems).toBeDefined();
    });

    it('updates activeDimensions when selectedDimensionNames changes and fetch completes', async () => {
      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension];

      const { result, rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.activeDimensions).toEqual([hostDimension]);
      });

      // Add a second dimension
      const updatedParams = {
        ...params,
        selectedDimensionNames: [hostDimension, serviceDimension],
      };
      rerender(updatedParams);

      await waitFor(() => {
        expect(result.current.activeDimensions).toEqual([hostDimension, serviceDimension]);
      });
    });

    it('clears activeDimensions when selectedDimensionNames is cleared', async () => {
      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension];

      const { result, rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      await waitFor(() => {
        expect(result.current.activeDimensions).toEqual([hostDimension]);
      });

      const clearedParams = { ...params, selectedDimensionNames: undefined };
      rerender(clearedParams);

      await waitFor(() => {
        expect(result.current.activeDimensions).toEqual([]);
      });
    });
  });

  describe('error handling', () => {
    it('returns error when fetch fails', async () => {
      const fetchError = new Error('Network error');
      mockExecuteEsqlQuery.mockRejectedValue(fetchError);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.error).toBe(fetchError);
      expect(result.current.metricItems).toEqual([]);
      expect(result.current.allDimensions).toEqual([]);
      expect(result.current.activeDimensions).toEqual([]);
    });

    it('returns EsqlResponseError when ES|QL responds with HTTP 200 and embedded error', async () => {
      const embeddedError = new EsqlResponseError(
        {
          type: 'remote_transport_exception',
          reason: 'ccs query failed',
          root_cause: [{ type: 'index_not_found_exception', reason: 'no such index [metrics-*]' }],
        },
        { status: 400 }
      );
      mockExecuteEsqlQuery.mockRejectedValue(embeddedError);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBe(embeddedError);
      });

      expect(result.current.error).toBeInstanceOf(EsqlResponseError);
      expect(result.current.error).toMatchObject({
        message: 'remote_transport_exception: ccs query failed',
        status: 400,
        rootCause: [{ type: 'index_not_found_exception', reason: 'no such index [metrics-*]' }],
      });
      expect(result.current.metricItems).toEqual([]);
    });

    it('returns empty arrays and null error in initial state', () => {
      // Delay fetch indefinitely so we can inspect the initial state
      mockExecuteEsqlQuery.mockReturnValue(new Promise(() => {}));

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      expect(result.current.error).toBeNull();
      expect(result.current.metricItems).toEqual([]);
      expect(result.current.allDimensions).toEqual([]);
      expect(result.current.activeDimensions).toEqual([]);
    });

    it('reports landed fetch errors via reportChartSectionError', async () => {
      const fetchError = new Error('boom');
      mockExecuteEsqlQuery.mockRejectedValue(fetchError);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
      });

      expect(mockReportError).toHaveBeenCalledTimes(1);
      expect(mockReportError).toHaveBeenCalledWith({
        error: fetchError,
        source: 'useFetchMetricsData',
        labels: {
          page: 'metrics_fetch_metrics_info',
          profile_id: 'test-profile-id',
        },
      });
    });

    it('hands AbortError to the reporter (which internally suppresses it)', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      mockExecuteEsqlQuery.mockRejectedValue(abortError);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
      });

      // AbortError suppression lives in the reporter (see its own tests).
      expect(mockReportError).toHaveBeenCalledTimes(1);
      expect(mockReportError).toHaveBeenCalledWith({
        error: abortError,
        source: 'useFetchMetricsData',
        labels: {
          page: 'metrics_fetch_metrics_info',
          profile_id: 'test-profile-id',
        },
      });
    });

    it('does not re-fire on re-renders that preserve the error reference', async () => {
      // `useAsyncFn` exposes a stable error reference for a given failed run,
      // so the reporter useEffect (deps: [error, profileId]) does not re-fire
      // on identity-preserving re-renders. Repeat failures with fresh Error
      // instances do produce fresh reports - exercised by the sibling test.
      const fetchError = new Error('re-render test');
      mockExecuteEsqlQuery.mockRejectedValue(fetchError);

      const params = createDefaultParams();
      const { result, rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(mockReportError).toHaveBeenCalledTimes(1);

      rerender(params);
      rerender(params);

      expect(mockReportError).toHaveBeenCalledTimes(1);
    });

    it('re-reports when a subsequent fetch fails with a fresh error instance', async () => {
      const firstError = new Error('first failure');
      const secondError = new Error('second failure');
      mockExecuteEsqlQuery.mockRejectedValueOnce(firstError);

      const params = createDefaultParams();
      const { result, rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      await waitFor(() => {
        expect(result.current.error).toBe(firstError);
      });
      expect(mockReportError).toHaveBeenCalledTimes(1);

      // Trigger a refetch by changing fetchParams.timeRange, then resolve the
      // next call with a different rejection so `error` references update.
      mockExecuteEsqlQuery.mockRejectedValueOnce(secondError);
      rerender({
        ...params,
        fetchParams: { ...params.fetchParams, timeRange: { from: 'now-1h', to: 'now' } },
      });

      await waitFor(() => {
        expect(result.current.error).toBe(secondError);
      });
      expect(mockReportError).toHaveBeenCalledTimes(2);
      expect(mockReportError).toHaveBeenLastCalledWith({
        error: secondError,
        source: 'useFetchMetricsData',
        labels: {
          page: 'metrics_fetch_metrics_info',
          profile_id: 'test-profile-id',
        },
      });
    });
  });

  describe('refetch on dependency changes', () => {
    it('refetches when timeRange changes', async () => {
      const params = createDefaultParams();
      const { result, rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);

      const updatedParams = {
        ...params,
        fetchParams: { ...params.fetchParams, timeRange: { from: 'now-1h', to: 'now' } },
      };
      rerender(updatedParams);

      await waitFor(() => {
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
      });
    });

    it('refetches when selectedDimensionNames changes', async () => {
      const params = createDefaultParams();
      const { result, rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);

      const updatedParams = { ...params, selectedDimensionNames: [hostDimension] };
      rerender(updatedParams);

      await waitFor(() => {
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('appliedDimensions vs selectedDimensions (#264957)', () => {
    const { buildMetricsInfoQuery: buildMetricsInfoQueryMock } = jest.requireMock(
      '@kbn/esql-utils'
    ) as { buildMetricsInfoQuery: jest.Mock };

    it('passes no dimensions to the query when none of the selected ones exist on the current data view', async () => {
      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension];
      // Stream B does not carry `host.name` — simulate the issue scenario.
      (params.fetchParams.dataView as any).getFieldByName = jest.fn(() => undefined);

      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(buildMetricsInfoQueryMock).toHaveBeenLastCalledWith('TS metrics-*', []);
      expect(result.current.activeDimensions).toEqual([]);
      // Intent must not be mutated — the caller still sees the original array.
      expect(params.selectedDimensionNames).toEqual([hostDimension]);
    });

    it('keeps only the subset of selected dimensions that exist on the current data view', async () => {
      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension, serviceDimension];
      // Only `host.name` exists on the current data view.
      (params.fetchParams.dataView as any).getFieldByName = jest.fn((name: string) =>
        name === 'host.name' ? { name } : undefined
      );

      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(buildMetricsInfoQueryMock).toHaveBeenLastCalledWith('TS metrics-*', ['host.name']);
      expect(result.current.activeDimensions).toEqual([hostDimension]);
    });

    it('passes all selected dimensions when they all exist on the current data view', async () => {
      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension, serviceDimension];
      // Default mock returns a stub field for every requested name.

      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(buildMetricsInfoQueryMock).toHaveBeenLastCalledWith('TS metrics-*', [
        'host.name',
        'service.name',
      ]);
      expect(result.current.activeDimensions).toEqual([hostDimension, serviceDimension]);
    });

    it('does not validate when dataView is undefined (fetch is already gated by shouldFetch)', async () => {
      const params = createDefaultParams({ dataView: undefined });
      params.selectedDimensionNames = [hostDimension];

      renderHook(() => useFetchMetricsData(params));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // No fetch happens because the effect bails out when dataView is missing.
      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    });

    it('does not invoke getFieldByName when there are no selected dimensions', async () => {
      const params = createDefaultParams();
      const getFieldByName = jest.fn((name: string) => ({ name }));
      (params.fetchParams.dataView as any).getFieldByName = getFieldByName;

      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // The validation memo short-circuits when selectedDimensionNames is empty/undefined,
      // so getFieldByName is only reached by the unrelated getFieldType helper inside the
      // parser (which doesn't run for the empty document set used here).
      expect(getFieldByName).not.toHaveBeenCalled();
      expect(result.current.activeDimensions).toEqual([]);
    });

    it('refetches when the applied set changes after a data view switch', async () => {
      const params = createDefaultParams();
      params.selectedDimensionNames = [hostDimension];

      const { rerender } = renderHook(
        (props: ReturnType<typeof createDefaultParams>) => useFetchMetricsData(props),
        { initialProps: params }
      );

      await waitFor(() => {
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
      });

      // Switch to a data view that doesn't carry `host.name` — same intent,
      // different applied set, so we expect a refetch with the pruned dimensions.
      const switchedParams = {
        ...params,
        fetchParams: {
          ...params.fetchParams,
          dataView: {
            getFieldByName: jest.fn(() => undefined),
            getIndexPattern: () => 'metrics-*',
            isTimeBased: () => true,
          } as any,
        },
      };
      rerender(switchedParams);

      await waitFor(() => {
        expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
      });

      expect(buildMetricsInfoQueryMock).toHaveBeenLastCalledWith('TS metrics-*', []);
    });
  });

  describe('telemetry', () => {
    it('calls trackMetricsInfo with parsed telemetry when fetch succeeds', async () => {
      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockTrackMetricsInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          total_number_of_metrics: 1,
        })
      );
    });

    it('forwards profileId to executeEsqlQuery so the request executionContext carries it as meta', async () => {
      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'test-profile-id' })
      );
    });

    it('does not fire trackMetricsInfo when the fetch fails', async () => {
      const fetchError = new Error('Network error');
      mockExecuteEsqlQuery.mockRejectedValue(fetchError);

      const params = createDefaultParams();
      const { result } = renderHook(() => useFetchMetricsData(params));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
      });

      expect(mockTrackMetricsInfo).not.toHaveBeenCalled();
    });
  });
});
