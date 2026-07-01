/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { ValueMetrics } from '../components/ai_value/metrics';
import {
  SAMPLE_VALUE_METRICS,
  SAMPLE_VALUE_METRICS_COMPARE,
} from '../components/ai_value/sample_data';
import { useValueMetrics } from '../components/ai_value/hooks/use_value_metrics';
import { useHasEverUsedAttackDiscovery } from '../components/ai_value/hooks/use_has_ever_used_attack_discovery';

interface Props {
  from: string;
  to: string;
  minutesPerAlert: number;
  analystHourlyRate: number;
  forceSampleData?: boolean;
}

export interface ValueReportData {
  isLoading: boolean;
  isSample: boolean;
  hasEverUsedAttackDiscovery: boolean;
  attackAlertIds: string[];
  analystHourlyRate: number;
  minutesPerAlert: number;
  from: string;
  to: string;
  valueMetrics: ValueMetrics;
  valueMetricsCompare: ValueMetrics;
}

/**
 * Resolves the data the AI Value Report should render. Returns either live
 * metrics or the sample/onboarding dataset behind a uniform shape, so consumers
 * don't have to branch on `isSample` to read fields.
 *
 * Sample mode is only entered when the user has never used Attack Discovery
 * AND the current range has zero discoveries. In sample mode only the metrics
 * and alert IDs are swapped; `from`/`to` always reflect the actual selected
 * range so the displayed dates stay in sync with the date picker.
 */
export const useValueReportData = ({
  from,
  to,
  minutesPerAlert,
  analystHourlyRate,
  forceSampleData = false,
}: Props): ValueReportData => {
  const {
    attackAlertIds,
    hasNoCurrentDiscoveries: shouldCheckHistory,
    isLoading: isLoadingMetrics,
    valueMetrics,
    valueMetricsCompare,
  } = useValueMetrics({ from, to, minutesPerAlert, analystHourlyRate, enabled: !forceSampleData });

  const {
    hasEverUsedAttackDiscovery: hasHistoricalAttackDiscoveries,
    isLoading: isLoadingHistory,
  } = useHasEverUsedAttackDiscovery({ enabled: shouldCheckHistory && !forceSampleData });

  const isLoading =
    !forceSampleData && (isLoadingMetrics || (shouldCheckHistory && isLoadingHistory));

  // Discoveries in the selected range imply prior usage; otherwise rely on the history query.
  const hasEverUsedAttackDiscovery =
    !forceSampleData && (valueMetrics.attackDiscoveryCount > 0 || hasHistoricalAttackDiscoveries);

  const isSample =
    forceSampleData || (!isLoading && shouldCheckHistory && !hasEverUsedAttackDiscovery);

  return useMemo<ValueReportData>(
    () => ({
      isLoading,
      isSample,
      hasEverUsedAttackDiscovery,
      attackAlertIds: isSample ? [] : attackAlertIds,
      analystHourlyRate,
      minutesPerAlert,
      from,
      to,
      valueMetrics: isSample ? SAMPLE_VALUE_METRICS : valueMetrics,
      valueMetricsCompare: isSample ? SAMPLE_VALUE_METRICS_COMPARE : valueMetricsCompare,
    }),
    [
      isLoading,
      isSample,
      hasEverUsedAttackDiscovery,
      attackAlertIds,
      analystHourlyRate,
      minutesPerAlert,
      from,
      to,
      valueMetrics,
      valueMetricsCompare,
    ]
  );
};
