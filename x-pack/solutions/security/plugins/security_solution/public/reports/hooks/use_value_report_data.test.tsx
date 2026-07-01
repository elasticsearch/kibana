/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';

import { useValueReportData } from './use_value_report_data';
import { useValueMetrics } from '../components/ai_value/hooks/use_value_metrics';
import { useHasEverUsedAttackDiscovery } from '../components/ai_value/hooks/use_has_ever_used_attack_discovery';
import {
  SAMPLE_VALUE_METRICS,
  SAMPLE_VALUE_METRICS_COMPARE,
} from '../components/ai_value/sample_data';
import type { ValueMetrics } from '../components/ai_value/metrics';

jest.mock('../components/ai_value/hooks/use_value_metrics');
jest.mock('../components/ai_value/hooks/use_has_ever_used_attack_discovery');

const mockUseValueMetrics = useValueMetrics as jest.MockedFunction<typeof useValueMetrics>;
const mockUseHasEverUsedAttackDiscovery = useHasEverUsedAttackDiscovery as jest.MockedFunction<
  typeof useHasEverUsedAttackDiscovery
>;

const LIVE_METRICS: ValueMetrics = {
  attackDiscoveryCount: 3,
  filteredAlerts: 100,
  filteredAlertsPerc: 90,
  escalatedAlertsPerc: 10,
  hoursSaved: 12,
  totalAlerts: 110,
  costSavings: 900,
};

const LIVE_METRICS_COMPARE: ValueMetrics = {
  attackDiscoveryCount: 1,
  filteredAlerts: 50,
  filteredAlertsPerc: 80,
  escalatedAlertsPerc: 20,
  hoursSaved: 6,
  totalAlerts: 60,
  costSavings: 400,
};

const EMPTY_LIVE_METRICS: ValueMetrics = { ...LIVE_METRICS, attackDiscoveryCount: 0 };

const LIVE_ALERT_IDS = ['live-alert-1', 'live-alert-2'];

const PROPS = {
  from: '2026-04-01T00:00:00.000Z',
  to: '2026-05-01T00:00:00.000Z',
  minutesPerAlert: 12,
  analystHourlyRate: 100,
};

const mockMetrics = ({
  isLoading = false,
  valueMetrics = LIVE_METRICS,
  valueMetricsCompare = LIVE_METRICS_COMPARE,
  attackAlertIds = LIVE_ALERT_IDS,
  hasNoCurrentDiscoveries,
}: Partial<ReturnType<typeof useValueMetrics>> = {}) => {
  mockUseValueMetrics.mockReturnValue({
    isLoading,
    valueMetrics,
    valueMetricsCompare,
    attackAlertIds,
    hasNoCurrentDiscoveries:
      hasNoCurrentDiscoveries ?? (!isLoading && valueMetrics.attackDiscoveryCount === 0),
  });
};

const mockHistory = ({
  hasEverUsedAttackDiscovery = false,
  isLoading = false,
}: Partial<ReturnType<typeof useHasEverUsedAttackDiscovery>> = {}) => {
  mockUseHasEverUsedAttackDiscovery.mockReturnValue({
    hasEverUsedAttackDiscovery,
    isLoading,
  });
};

describe('useValueReportData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sample vs live mode', () => {
    it('enters sample mode when the feature was never used and the range is empty, passing through settings-derived props', () => {
      mockMetrics({ valueMetrics: EMPTY_LIVE_METRICS });
      mockHistory({ hasEverUsedAttackDiscovery: false });

      const { result } = renderHook(() => useValueReportData(PROPS));

      expect(result.current).toEqual({
        isLoading: false,
        isSample: true,
        hasEverUsedAttackDiscovery: false,
        attackAlertIds: [],
        analystHourlyRate: PROPS.analystHourlyRate,
        minutesPerAlert: PROPS.minutesPerAlert,
        from: PROPS.from,
        to: PROPS.to,
        valueMetrics: SAMPLE_VALUE_METRICS,
        valueMetricsCompare: SAMPLE_VALUE_METRICS_COMPARE,
      });
      expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: true });
    });

    it('stays in live mode when the feature was ever used, even if the current range has zero discoveries', () => {
      mockMetrics({ valueMetrics: EMPTY_LIVE_METRICS });
      mockHistory({ hasEverUsedAttackDiscovery: true });

      const { result } = renderHook(() => useValueReportData(PROPS));

      expect(result.current.isSample).toBe(false);
      expect(result.current.from).toBe(PROPS.from);
      expect(result.current.to).toBe(PROPS.to);
      expect(result.current.minutesPerAlert).toBe(PROPS.minutesPerAlert);
      expect(result.current.analystHourlyRate).toBe(PROPS.analystHourlyRate);
      expect(result.current.valueMetrics).toBe(EMPTY_LIVE_METRICS);
      expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: true });
    });

    it.each([
      ['feature never used', false],
      ['feature ever used', true],
    ])(
      'stays in live mode when the current range has discoveries (%s)',
      (_label, hasHistoricalAttackDiscoveries) => {
        mockMetrics({ valueMetrics: LIVE_METRICS });
        mockHistory({ hasEverUsedAttackDiscovery: hasHistoricalAttackDiscoveries });

        const { result } = renderHook(() => useValueReportData(PROPS));

        expect(result.current.isSample).toBe(false);
        expect(result.current.valueMetrics).toBe(LIVE_METRICS);
        expect(result.current.hasEverUsedAttackDiscovery).toBe(true);
        expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: false });
      }
    );

    it('passes attackAlertIds and both metric objects through unchanged in live mode', () => {
      mockMetrics();
      mockHistory({ hasEverUsedAttackDiscovery: true });

      const { result } = renderHook(() => useValueReportData(PROPS));

      expect(result.current.attackAlertIds).toBe(LIVE_ALERT_IDS);
      expect(result.current.valueMetrics).toBe(LIVE_METRICS);
      expect(result.current.valueMetricsCompare).toBe(LIVE_METRICS_COMPARE);
      expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: false });
    });
  });

  describe('forceSampleData', () => {
    it('immediately returns sample data without querying when forceSampleData is true', () => {
      mockMetrics({ valueMetrics: LIVE_METRICS });
      mockHistory({ hasEverUsedAttackDiscovery: true });

      let renderCount = 0;
      const { result } = renderHook(() => {
        renderCount++;
        return useValueReportData({ ...PROPS, forceSampleData: true });
      });

      // No state transitions — the hook settled in a single render with no re-renders
      expect(renderCount).toBe(1);
      expect(result.current.isSample).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasEverUsedAttackDiscovery).toBe(false);
      expect(result.current.valueMetrics).toBe(SAMPLE_VALUE_METRICS);
      expect(result.current.valueMetricsCompare).toBe(SAMPLE_VALUE_METRICS_COMPARE);
      expect(result.current.attackAlertIds).toEqual([]);
      expect(mockUseValueMetrics).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
      expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: false });
    });
  });

  describe('loading behavior', () => {
    it('suppresses sample mode while metrics are loading so the report does not flash sample data during fetch', () => {
      mockMetrics({ isLoading: true, valueMetrics: EMPTY_LIVE_METRICS });
      mockHistory({ isLoading: true, hasEverUsedAttackDiscovery: false });

      const { result } = renderHook(() => useValueReportData(PROPS));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isSample).toBe(false);
      expect(result.current.from).toBe(PROPS.from);
      expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: false });
    });

    it('waits on history loading only when the current range has zero discoveries', () => {
      mockMetrics({ isLoading: false, valueMetrics: EMPTY_LIVE_METRICS });
      mockHistory({ isLoading: true, hasEverUsedAttackDiscovery: false });

      const { result } = renderHook(() => useValueReportData(PROPS));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isSample).toBe(false);
      expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: true });
    });

    it('does not wait on history loading when the current range already has discoveries', () => {
      mockMetrics({ valueMetrics: LIVE_METRICS });
      mockHistory({ isLoading: true, hasEverUsedAttackDiscovery: false });

      const { result } = renderHook(() => useValueReportData(PROPS));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSample).toBe(false);
      expect(mockUseHasEverUsedAttackDiscovery).toHaveBeenCalledWith({ enabled: false });
    });
  });
});
