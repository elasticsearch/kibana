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
const mockReportError = jest.fn();
jest.mock('../../../chart/hooks/use_report_chart_section_error', () => ({
  useReportChartSectionError: jest.fn(() => mockReportError),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { ChartSectionProps } from '@kbn/unified-histogram/types';
import { getFetchParamsMock } from '@kbn/unified-histogram/__mocks__/fetch_params';
import { FEATURE_FLAGS } from '../../../../common/constants';
import { useFeatureFlag } from '../../../../hooks/use_feature_flag';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import {
  EXEMPLARS_PROBE_QUERY,
  resetExemplarsAvailabilityCache,
  useExemplarsAvailability,
  type UseExemplarsAvailabilityParams,
} from './use_exemplars_availability';

const mockExecuteEsqlQuery = executeEsqlQuery as jest.MockedFunction<typeof executeEsqlQuery>;
const mockUseFeatureFlag = useFeatureFlag as jest.MockedFunction<typeof useFeatureFlag>;

const TEST_PROFILE_ID = 'metrics-data-source-profile';

const METRICS_WITH_EXEMPLARS = [
  'metrics.http.server.request.duration',
  'metrics.orders.created',
  'metrics.orders.rejected',
];

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
 * Built once per test and closed over by the render callback: the probe's dependency
 * list includes `search` and `uiSettings`, so rebuilding these on every render would
 * re-fire the probe indefinitely.
 */
const createParams = (dataView: DataView | null = createMockDataView()) =>
  ({
    fetchParams: getFetchParamsMock({
      query: { esql: 'TS metrics-generic.otel-default' },
      dataView: dataView as DataView,
      timeRange: { from: 'now-15m', to: 'now' },
      filters: [],
    }),
    services: createMockServices(),
    profileId: TEST_PROFILE_ID,
  } as UseExemplarsAvailabilityParams);

/**
 * Lets the probe promise chain settle. Needed by the assertions whose expected outcome
 * is "nothing changed", which `waitFor` cannot distinguish from "not settled yet".
 */
const flushProbe = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

/** Shape of the `LIMIT 0` probe response: column metadata only, no rows. */
const probeResponse = (columnNames: string[]) => ({
  documents: [],
  rawResponse: {
    columns: columnNames.map((name) => ({ name, type: 'double' })),
    values: [],
  },
  requestParams: { query: EXEMPLARS_PROBE_QUERY },
});

describe('useExemplarsAvailability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureFlag.mockReturnValue(true);
    mockExecuteEsqlQuery.mockResolvedValue(probeResponse([]));
    // The probe is cached in a module-level Map that outlives individual tests
    // within a Jest worker. Clear it so each test starts from a clean slate.
    resetExemplarsAvailabilityCache();
  });

  describe('when the feature flag is off', () => {
    beforeEach(() => {
      mockUseFeatureFlag.mockReturnValue(false);
    });

    it('issues no request at all', async () => {
      const params = createParams();

      renderHook(() => useExemplarsAvailability(params));

      await flushProbe();
      expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
    });

    it('reports nothing as available', async () => {
      const params = createParams();

      const { result } = renderHook(() => useExemplarsAvailability(params));

      await flushProbe();
      expect(result.current.availableMetrics.size).toBe(0);
      expect(result.current.hasProbeFailed).toBe(false);
    });
  });

  it('reads the exemplars feature flag with its registered default', async () => {
    const params = createParams();

    renderHook(() => useExemplarsAvailability(params));

    await flushProbe();
    expect(mockUseFeatureFlag).toHaveBeenCalledWith(FEATURE_FLAGS.IS_EXEMPLARS_ENABLED, false);
  });

  it('populates availableMetrics from the probe response columns', async () => {
    mockExecuteEsqlQuery.mockResolvedValue(probeResponse(METRICS_WITH_EXEMPLARS));
    const params = createParams();

    const { result } = renderHook(() => useExemplarsAvailability(params));

    await waitFor(() => expect(result.current.availableMetrics.size).toBe(3));
    expect([...result.current.availableMetrics]).toEqual(METRICS_WITH_EXEMPLARS);
    expect(result.current.hasProbeFailed).toBe(false);
  });

  it('sends the wildcard column probe without a time range or filters', async () => {
    mockExecuteEsqlQuery.mockResolvedValue(probeResponse(METRICS_WITH_EXEMPLARS));
    const params = createParams();

    renderHook(() => useExemplarsAvailability(params));

    await flushProbe();
    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
      esqlQuery: 'FROM exemplars-*.otel-* | KEEP metrics.* | LIMIT 0',
      search: params.services.data.search.search,
      dataView: params.fetchParams.dataView,
      uiSettings: params.services.uiSettings,
      profileId: TEST_PROFILE_ID,
    });
  });

  it('reports nothing as available while the probe is in flight', () => {
    mockExecuteEsqlQuery.mockReturnValue(new Promise(() => {}));
    const params = createParams();

    const { result } = renderHook(() => useExemplarsAvailability(params));

    expect(result.current.availableMetrics.size).toBe(0);
    expect(result.current.hasProbeFailed).toBe(false);
  });

  it('reports nothing as available when the probe returns no metric columns', async () => {
    mockExecuteEsqlQuery.mockResolvedValue(probeResponse([]));
    const params = createParams();

    const { result } = renderHook(() => useExemplarsAvailability(params));

    await flushProbe();
    expect(mockExecuteEsqlQuery).toHaveBeenCalled();
    expect(result.current.availableMetrics.size).toBe(0);
    expect(result.current.hasProbeFailed).toBe(false);
  });

  it('does not request the probe when there is no data view', async () => {
    const params = createParams(null);

    renderHook(() => useExemplarsAvailability(params));

    await flushProbe();
    expect(mockExecuteEsqlQuery).not.toHaveBeenCalled();
  });

  describe('when the probe fails', () => {
    const probeError = new Error('verification_exception: Unknown index');

    it('flags the failure, reports it to APM and does not throw', async () => {
      mockExecuteEsqlQuery.mockRejectedValue(probeError);
      const params = createParams();

      const { result } = renderHook(() => useExemplarsAvailability(params));

      await waitFor(() => expect(result.current.hasProbeFailed).toBe(true));
      expect(result.current.availableMetrics.size).toBe(0);
      expect(mockReportError).toHaveBeenCalledTimes(1);
      expect(mockReportError).toHaveBeenCalledWith({
        error: probeError,
        source: 'useFetchExemplars',
        labels: { profile_id: TEST_PROFILE_ID },
      });
    });

    it('evicts the cache so a later mount retries', async () => {
      mockExecuteEsqlQuery
        .mockRejectedValueOnce(probeError)
        .mockResolvedValueOnce(probeResponse(METRICS_WITH_EXEMPLARS));
      const firstParams = createParams();
      const secondParams = createParams();

      const first = renderHook(() => useExemplarsAvailability(firstParams));
      await waitFor(() => expect(first.result.current.hasProbeFailed).toBe(true));

      const second = renderHook(() => useExemplarsAvailability(secondParams));
      await waitFor(() => expect(second.result.current.availableMetrics.size).toBe(3));
      expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('when the probe is aborted', () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });

    it('does not report the abort to APM', async () => {
      mockExecuteEsqlQuery.mockRejectedValue(abortError);
      const params = createParams();

      const { result } = renderHook(() => useExemplarsAvailability(params));

      await flushProbe();
      expect(mockExecuteEsqlQuery).toHaveBeenCalled();
      expect(mockReportError).not.toHaveBeenCalled();
      expect(result.current.hasProbeFailed).toBe(false);
    });
  });

  it('deduplicates the probe across concurrent mounts', async () => {
    mockExecuteEsqlQuery.mockResolvedValue(probeResponse(METRICS_WITH_EXEMPLARS));
    const firstParams = createParams();
    const secondParams = createParams();

    const first = renderHook(() => useExemplarsAvailability(firstParams));
    const second = renderHook(() => useExemplarsAvailability(secondParams));

    await waitFor(() => expect(first.result.current.availableMetrics.size).toBe(3));
    await waitFor(() => expect(second.result.current.availableMetrics.size).toBe(3));
    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
  });

  it('returns a referentially stable result while nothing has landed', () => {
    mockExecuteEsqlQuery.mockReturnValue(new Promise(() => {}));
    const params = createParams();

    const { result, rerender } = renderHook(() => useExemplarsAvailability(params));
    const initial = result.current;

    rerender();

    // Consumers rebuild Lens props off this value's identity, so a fresh object on
    // every render would re-trigger a rebuild.
    expect(result.current).toBe(initial);
  });
});
