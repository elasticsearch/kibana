/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getServicesItems } from './get_services_items';
import { getServiceTransactionStats } from './get_service_transaction_stats';
import { getServiceAnomalyScores } from './get_service_anomaly_scores';
import { getServicesAlerts } from './get_service_alerts';
import { getServicesSloStats } from './get_services_slo_stats';
import { mergeServiceStats } from './merge_service_stats';
import type { Logger } from '@kbn/logging';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import type { ApmAlertsClient } from '../../../lib/helpers/get_apm_alerts_client';
import type { ApmSloClient } from '../../../lib/helpers/get_apm_slo_client';
import type { RandomSampler } from '../../../lib/helpers/get_random_sampler';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';

jest.mock('./get_service_transaction_stats');
jest.mock('./get_service_anomaly_scores');
jest.mock('./get_service_alerts');
jest.mock('./get_services_slo_stats');
jest.mock('./merge_service_stats');

const mockGetServiceTransactionStats = getServiceTransactionStats as jest.Mock;
const mockGetServiceAnomalyScores = getServiceAnomalyScores as jest.Mock;
const mockGetServicesAlerts = getServicesAlerts as jest.Mock;
const mockGetServicesSloStats = getServicesSloStats as jest.Mock;
const mockMergeServiceStats = mergeServiceStats as jest.Mock;

describe('getServicesItems', () => {
  const mockLogger = {
    debug: jest.fn(),
  } as unknown as Logger;

  const baseParams = {
    environment: 'production',
    kuery: '',
    apmEventClient: {} as unknown as APMEventClient,
    apmAlertsClient: {} as unknown as ApmAlertsClient,
    sloClient: {} as unknown as ApmSloClient,
    logger: mockLogger,
    start: 1000,
    end: 2000,
    serviceGroup: null,
    randomSampler: {} as unknown as RandomSampler,
    documentType: 'transactionMetric' as ApmServiceTransactionDocumentType,
    rollupInterval: '1m' as RollupInterval,
    useDurationSummary: false,
  };

  const mockServiceStats = {
    serviceStats: [
      { serviceName: 'service-a', throughput: 100 },
      { serviceName: 'service-b', throughput: 200 },
    ],
    serviceOverflowCount: 0,
    maxCountExceeded: false,
  };

  const mockAnomalyScores = [{ serviceName: 'service-a', anomalyScore: 75 }];

  const mockAlertCounts = [{ serviceName: 'service-a', alertsCount: 2 }];

  const mockSloCounts = [{ serviceName: 'service-a', sloStatus: 'healthy', sloCount: 1 }];

  const mockMergedItems = [
    { serviceName: 'service-a', throughput: 100, alertsCount: 2 },
    { serviceName: 'service-b', throughput: 200 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServiceTransactionStats.mockResolvedValue(mockServiceStats);
    mockGetServiceAnomalyScores.mockResolvedValue(mockAnomalyScores);
    mockGetServicesAlerts.mockResolvedValue(mockAlertCounts);
    mockGetServicesSloStats.mockResolvedValue(mockSloCounts);
    mockMergeServiceStats.mockReturnValue(mockMergedItems);
  });

  describe('data fetching', () => {
    it('fetches all data sources', async () => {
      const result = await getServicesItems({
        ...baseParams,
      });

      expect(mockGetServiceTransactionStats).toHaveBeenCalled();
      expect(mockGetServiceAnomalyScores).toHaveBeenCalled();
      expect(mockGetServicesAlerts).toHaveBeenCalled();
      expect(mockGetServicesSloStats).toHaveBeenCalled();
      expect(result.items).toEqual(mockMergedItems);
    });
  });

  describe('error handling', () => {
    it('returns empty array and logs debug when getServiceAnomalyScores fails', async () => {
      const error = new Error('Anomaly scores error');
      mockGetServiceAnomalyScores.mockRejectedValue(error);

      const result = await getServicesItems({
        ...baseParams,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(error);
      expect(mockMergeServiceStats).toHaveBeenCalledWith(
        expect.objectContaining({
          anomalyScores: [],
        })
      );
      expect(result.items).toEqual(mockMergedItems);
    });

    it('returns empty array and logs debug when getServicesAlerts fails', async () => {
      const error = new Error('Alerts error');
      mockGetServicesAlerts.mockRejectedValue(error);

      const result = await getServicesItems({
        ...baseParams,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(error);
      expect(mockMergeServiceStats).toHaveBeenCalledWith(
        expect.objectContaining({
          alertCounts: [],
        })
      );
      expect(result.items).toEqual(mockMergedItems);
    });

    it('returns empty array and logs debug when getServicesSloStats fails', async () => {
      const error = new Error('SLO error');
      mockGetServicesSloStats.mockRejectedValue(error);

      const result = await getServicesItems({
        ...baseParams,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(error);
      expect(mockMergeServiceStats).toHaveBeenCalledWith(
        expect.objectContaining({
          sloStats: [],
        })
      );
      expect(result.items).toEqual(mockMergedItems);
    });
  });

  describe('response structure', () => {
    it('returns correct response structure', async () => {
      const result = await getServicesItems({
        ...baseParams,
      });

      expect(result).toEqual({
        items: mockMergedItems,
        maxCountExceeded: false,
        serviceOverflowCount: 0,
      });
    });

    it('passes maxCountExceeded from service stats', async () => {
      mockGetServiceTransactionStats.mockResolvedValue({
        ...mockServiceStats,
        maxCountExceeded: true,
      });

      const result = await getServicesItems({
        ...baseParams,
      });

      expect(result.maxCountExceeded).toBe(true);
    });

    it('passes serviceOverflowCount from service stats', async () => {
      mockGetServiceTransactionStats.mockResolvedValue({
        ...mockServiceStats,
        serviceOverflowCount: 50,
      });

      const result = await getServicesItems({
        ...baseParams,
      });

      expect(result.serviceOverflowCount).toBe(50);
    });
  });
});
