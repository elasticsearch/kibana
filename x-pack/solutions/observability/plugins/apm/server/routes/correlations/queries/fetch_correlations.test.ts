/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { fetchCorrelations } from './fetch_correlations';

jest.mock('../../latency_distribution/get_overall_latency_distribution');
jest.mock('./fetch_infra_field_candidates');
jest.mock('./fetch_duration_field_candidates');
jest.mock('./fetch_field_value_pairs');
jest.mock('./fetch_throughput_correlations');
jest.mock('./fetch_p_values');
jest.mock('./fetch_significant_correlations');

import { getOverallLatencyDistribution } from '../../latency_distribution/get_overall_latency_distribution';
import { fetchInfraFieldCandidates } from './fetch_infra_field_candidates';
import { fetchDurationFieldCandidates } from './fetch_duration_field_candidates';
import { fetchFieldValuePairs } from './fetch_field_value_pairs';
import { fetchThroughputCorrelations } from './fetch_throughput_correlations';
import { fetchPValues } from './fetch_p_values';
import { fetchSignificantCorrelations } from './fetch_significant_correlations';

const mockGetOverallLatencyDistribution = getOverallLatencyDistribution as jest.MockedFunction<
  typeof getOverallLatencyDistribution
>;
const mockFetchInfraFieldCandidates = fetchInfraFieldCandidates as jest.MockedFunction<
  typeof fetchInfraFieldCandidates
>;
const mockFetchDurationFieldCandidates = fetchDurationFieldCandidates as jest.MockedFunction<
  typeof fetchDurationFieldCandidates
>;
const mockFetchFieldValuePairs = fetchFieldValuePairs as jest.MockedFunction<
  typeof fetchFieldValuePairs
>;
const mockFetchThroughputCorrelations = fetchThroughputCorrelations as jest.MockedFunction<
  typeof fetchThroughputCorrelations
>;
const mockFetchPValues = fetchPValues as jest.MockedFunction<typeof fetchPValues>;
const mockFetchSignificantCorrelations = fetchSignificantCorrelations as jest.MockedFunction<
  typeof fetchSignificantCorrelations
>;

const mockApmEventClient = {} as unknown as APMEventClient;

const defaultParams = {
  apmEventClient: mockApmEventClient,
  start: 0,
  end: 3_600_000,
  environment: 'ENVIRONMENT_ALL',
  query: { match_all: {} } as any,
  kuery: '',
};

const defaultDistribution = {
  durationMin: 1000,
  durationMax: 100_000,
  totalDocCount: 500,
  overallHistogram: undefined,
  percentileThresholdValue: undefined,
};

const infraCorrelation = {
  fieldName: 'host.name',
  fieldValue: 'host-a',
  correlation: 0.8,
};

describe('fetchCorrelations', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetOverallLatencyDistribution.mockResolvedValue(defaultDistribution);
  });

  describe('throughput metric', () => {
    it('uses fetchFieldValuePairs then fetchThroughputCorrelations', async () => {
      mockFetchDurationFieldCandidates.mockResolvedValue({ fieldCandidates: ['host.name'] });
      mockFetchFieldValuePairs.mockResolvedValue({
        fieldValuePairs: [{ fieldName: 'host.name', fieldValue: 'host-a' }],
        errors: [],
      });
      mockFetchThroughputCorrelations.mockResolvedValue({
        throughputCorrelations: [infraCorrelation],
        ccsWarning: false,
      });

      const result = await fetchCorrelations({ ...defaultParams, metric: 'throughput' });

      expect(mockFetchThroughputCorrelations).toHaveBeenCalledTimes(1);
      expect(result.correlations).toEqual([infraCorrelation]);
      expect(mockFetchInfraFieldCandidates).not.toHaveBeenCalled();
    });

    it('propagates ccsWarning from throughput response', async () => {
      mockFetchDurationFieldCandidates.mockResolvedValue({ fieldCandidates: ['host.name'] });
      mockFetchFieldValuePairs.mockResolvedValue({ fieldValuePairs: [], errors: [] });
      mockFetchThroughputCorrelations.mockResolvedValue({
        throughputCorrelations: [],
        ccsWarning: true,
      });

      const result = await fetchCorrelations({ ...defaultParams, metric: 'throughput' });

      expect(result.ccsWarning).toBe(true);
    });

    it('propagates fallbackResult from throughput response', async () => {
      const fallback = { ...infraCorrelation, isFallbackResult: true as const };
      mockFetchDurationFieldCandidates.mockResolvedValue({ fieldCandidates: ['host.name'] });
      mockFetchFieldValuePairs.mockResolvedValue({ fieldValuePairs: [], errors: [] });
      mockFetchThroughputCorrelations.mockResolvedValue({
        throughputCorrelations: [],
        ccsWarning: false,
        fallbackResult: fallback,
      });

      const result = await fetchCorrelations({ ...defaultParams, metric: 'throughput' });

      expect(result.fallbackResult).toEqual(fallback);
    });
  });

  describe('infra_metrics metric', () => {
    const infraPair = { fieldName: 'host.name', fieldValue: 'host-a' };
    // ksTest required for the deduplication filter in fetchCorrelations
    const infraSignificantCorrelation = { ...infraCorrelation, ksTest: 0.05 };

    it('uses fetchInfraFieldCandidates and passes results through fetchSignificantCorrelations', async () => {
      mockFetchInfraFieldCandidates.mockResolvedValue({ fieldCandidates: ['host.name'] });
      mockFetchFieldValuePairs.mockResolvedValue({ fieldValuePairs: [infraPair], errors: [] });
      mockFetchSignificantCorrelations.mockResolvedValue({
        latencyCorrelations: [infraSignificantCorrelation],
        ccsWarning: false,
        totalDocCount: 500,
      });

      const result = await fetchCorrelations({ ...defaultParams, metric: 'infra_metrics' });

      expect(mockFetchInfraFieldCandidates).toHaveBeenCalledTimes(1);
      expect(mockFetchDurationFieldCandidates).not.toHaveBeenCalled();
      expect(mockFetchSignificantCorrelations).toHaveBeenCalledTimes(1);
      expect(result.correlations).toEqual([infraSignificantCorrelation]);
    });

    it('skips fetchInfraFieldCandidates when fieldCandidates are provided', async () => {
      mockFetchFieldValuePairs.mockResolvedValue({ fieldValuePairs: [infraPair], errors: [] });
      mockFetchSignificantCorrelations.mockResolvedValue({
        latencyCorrelations: [infraSignificantCorrelation],
        ccsWarning: false,
        totalDocCount: 500,
      });

      const result = await fetchCorrelations({
        ...defaultParams,
        metric: 'infra_metrics',
        fieldCandidates: ['host.name'],
      });

      expect(mockFetchInfraFieldCandidates).not.toHaveBeenCalled();
      expect(mockFetchDurationFieldCandidates).not.toHaveBeenCalled();
      expect(mockFetchSignificantCorrelations).toHaveBeenCalledTimes(1);
      expect(result.correlations).toEqual([infraSignificantCorrelation]);
    });
  });

  describe('failure_rate metric', () => {
    it('uses fetchPValues and does not call fetchThroughputCorrelations', async () => {
      mockFetchDurationFieldCandidates.mockResolvedValue({ fieldCandidates: ['host.name'] });
      mockFetchPValues.mockResolvedValue({
        failedTransactionsCorrelations: [],
        ccsWarning: false,
      });

      await fetchCorrelations({ ...defaultParams, metric: 'failure_rate' });

      expect(mockFetchPValues).toHaveBeenCalledTimes(1);
      expect(mockFetchThroughputCorrelations).not.toHaveBeenCalled();
    });
  });
});
