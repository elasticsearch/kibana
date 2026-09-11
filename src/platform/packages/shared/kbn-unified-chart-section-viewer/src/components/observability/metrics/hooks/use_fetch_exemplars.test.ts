/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Mocked with factory functions so the hook's transitive dependency trees
// (e.g. @kbn/data-plugin/public) are never loaded.
jest.mock('../utils/execute_esql_query', () => ({
  executeEsqlQuery: jest.fn(),
}));
jest.mock('../../../../hooks/use_feature_flag', () => ({
  useFeatureFlag: jest.fn(),
}));
jest.mock('../../../../common/utils/esql/create_exemplars_query', () => ({
  createExemplarsQuery: jest.fn(),
}));
const mockReportError = jest.fn();
jest.mock('../../../chart/hooks/use_report_chart_section_error', () => ({
  useReportChartSectionError: jest.fn(() => mockReportError),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { ChartSectionProps } from '@kbn/unified-histogram/types';
import { getFetchParamsMock } from '@kbn/unified-histogram/__mocks__/fetch_params';
import { FEATURE_FLAGS } from '../../../../common/constants';
import { useFeatureFlag } from '../../../../hooks/use_feature_flag';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { createExemplarsQuery } from '../../../../common/utils/esql/create_exemplars_query';
import type { ParsedMetricItem } from '../../../../types';
import { useFetchExemplars, type UseFetchExemplarsParams } from './use_fetch_exemplars';

const mockExecuteEsqlQuery = executeEsqlQuery as jest.MockedFunction<typeof executeEsqlQuery>;
const mockUseFeatureFlag = useFeatureFlag as jest.MockedFunction<typeof useFeatureFlag>;
const mockCreateExemplarsQuery = createExemplarsQuery as jest.MockedFunction<
  typeof createExemplarsQuery
>;

const TEST_PROFILE_ID = 'metrics-data-source-profile';
const TEST_ESQL_QUERY =
  'FROM exemplars-generic.otel-default | WHERE `metrics.http.server.request.duration` IS NOT NULL | KEEP @timestamp | SORT @timestamp DESC | LIMIT 500';

const mockMetric: ParsedMetricItem = {
  metricName: 'metrics.http.server.request.duration',
  indexName: 'metrics-generic.otel-default',
  units: ['ms'],
  metricTypes: ['histogram'],
  fieldTypes: [ES_FIELD_TYPES.TDIGEST],
  dimensionFields: [{ name: 'attributes.http.route' }],
};

const createMockDataView = () =>
  ({
    getIndexPattern: () => 'metrics-generic.otel-default',
    isTimeBased: () => true,
    timeFieldName: '@timestamp',
  } as unknown as DataView);

const createMockServices = () =>
  ({
    data: { search: { search: jest.fn() } },
    uiSettings: {},
  } as unknown as ChartSectionProps['services']);

/**
 * Built once per test and closed over by the render callback: the hook's dependency
 * list includes `search` and `uiSettings`, so rebuilding these on every render would
 * re-fire the fetch indefinitely.
 */
const createParams = (
  overrides: Partial<UseFetchExemplarsParams> = {}
): UseFetchExemplarsParams => ({
  fetchParams: getFetchParamsMock({
    query: { esql: 'TS metrics-generic.otel-default' },
    dataView: createMockDataView(),
    timeRange: { from: 'now-15m', to: 'now' },
    filters: [],
  }),
  services: createMockServices(),
  metricItem: mockMetric,
  availableMetrics: new Set(['metrics.http.server.request.duration']),
  profileId: TEST_PROFILE_ID,
  ...overrides,
});

/** Typical successful fetch response: column metadata + one exemplar row. */
const exemplarResponse = (columnNames: string[]) => ({
  documents: [],
  rawResponse: {
    columns: columnNames.map((name) => ({ name, type: 'double' })),
    values: [[1_700_000_000_000, 0.42, 'trace-abc', 'span-xyz', '/orders']],
  },
  requestParams: { query: TEST_ESQL_QUERY },
});

/**
 * Lets the fetch promise chain settle. Needed by the assertions whose expected outcome
 * is "nothing changed", which `waitFor` cannot distinguish from "not settled yet".
 */
const flushAsync = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('useFetchExemplars', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureFlag.mockReturnValue(true);
    mockCreateExemplarsQuery.mockReturnValue(TEST_ESQL_QUERY);
    mockExecuteEsqlQuery.mockResolvedValue(
      exemplarResponse([
        '@timestamp',
        'metrics.http.server.request.duration',
        'trace_id',
        'span_id',
        'attributes.http.route',
      ])
    );
  });

  describe('when the feature flag is off', () => {
    beforeEach(() => {
      mockUseFeatureFlag.mockReturnValue(false);
    });

    it('issues no request', async () => {
      const params = createParams();
      renderHook(() => useFetchExemplars(params));

      await flushAsync();
      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    });

    it('returns undefined', async () => {
      const params = createParams();
      const { result } = renderHook(() => useFetchExemplars(params));

      await flushAsync();
      expect(result.current).toBeUndefined();
    });
  });

  it('reads the exemplars feature flag with its registered default', async () => {
    const params = createParams();
    renderHook(() => useFetchExemplars(params));

    await flushAsync();
    expect(mockUseFeatureFlag).toHaveBeenCalledWith(FEATURE_FLAGS.IS_EXEMPLARS_ENABLED, false);
  });

  it('returns undefined and issues no request when there is no data view', async () => {
    const params = createParams();
    params.fetchParams = {
      ...params.fetchParams,
      dataView: null as unknown as DataView,
    };

    const { result } = renderHook(() => useFetchExemplars(params));

    await flushAsync();
    expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('returns undefined and issues no request when the metric is absent from availableMetrics', async () => {
    const params = createParams({ availableMetrics: new Set() });

    const { result } = renderHook(() => useFetchExemplars(params));

    await flushAsync();
    expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('returns undefined and issues no request when createExemplarsQuery returns an empty string', async () => {
    mockCreateExemplarsQuery.mockReturnValue('');
    const params = createParams();

    const { result } = renderHook(() => useFetchExemplars(params));

    await flushAsync();
    expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('returns the exemplar columns and rows on a successful fetch', async () => {
    const columns = [
      '@timestamp',
      'metrics.http.server.request.duration',
      'trace_id',
      'span_id',
      'attributes.http.route',
    ];
    mockExecuteEsqlQuery.mockResolvedValue(exemplarResponse(columns));
    const params = createParams();

    const { result } = renderHook(() => useFetchExemplars(params));

    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual({
      columns: columns.map((name) => ({ name, type: 'double' })),
      values: [[1_700_000_000_000, 0.42, 'trace-abc', 'span-xyz', '/orders']],
    });
  });

  it('forwards the signal, search, dataView, uiSettings, timeRange, and profileId to executeEsqlQuery', async () => {
    const params = createParams();

    renderHook(() => useFetchExemplars(params));

    await flushAsync();
    expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        esqlQuery: TEST_ESQL_QUERY,
        search: params.services.data.search.search,
        dataView: params.fetchParams.dataView,
        uiSettings: params.services.uiSettings,
        profileId: TEST_PROFILE_ID,
        timeRange: params.fetchParams.timeRange,
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('returns undefined when rawResponse is missing columns or values arrays', async () => {
    mockExecuteEsqlQuery.mockResolvedValue({
      documents: [],
      rawResponse: { unexpected: true } as unknown,
      requestParams: {},
    } as unknown as Awaited<ReturnType<typeof executeEsqlQuery>>);
    const params = createParams();

    const { result } = renderHook(() => useFetchExemplars(params));

    await flushAsync();
    expect(result.current).toBeUndefined();
  });

  it('returns undefined while the fetch is in flight', () => {
    mockExecuteEsqlQuery.mockReturnValue(new Promise(() => {}));
    const params = createParams();

    const { result } = renderHook(() => useFetchExemplars(params));

    expect(result.current).toBeUndefined();
  });

  describe('when executeEsqlQuery rejects', () => {
    it('swallows AbortErrors without reporting to APM', async () => {
      const abortError = Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      });
      mockExecuteEsqlQuery.mockRejectedValue(abortError);
      const params = createParams();

      const { result } = renderHook(() => useFetchExemplars(params));

      await flushAsync();
      expect(mockReportError).not.toHaveBeenCalled();
      expect(result.current).toBeUndefined();
    });

    it('reports non-abort errors to APM and returns undefined', async () => {
      const fetchError = new Error('network failure');
      mockExecuteEsqlQuery.mockRejectedValue(fetchError);
      const params = createParams();

      const { result } = renderHook(() => useFetchExemplars(params));

      await waitFor(() => expect(mockReportError).toHaveBeenCalledTimes(1));
      expect(mockReportError).toHaveBeenCalledWith({
        error: fetchError,
        source: 'useFetchExemplars',
        labels: { profile_id: TEST_PROFILE_ID },
      });
      expect(result.current).toBeUndefined();
    });
  });
});
