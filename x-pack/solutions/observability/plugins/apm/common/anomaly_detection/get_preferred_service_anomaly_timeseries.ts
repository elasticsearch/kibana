/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ENVIRONMENT_ALL } from '../environment_filter_values';
import type { Environment } from '../environment_rt';
import type { AnomalyDetectorType } from './apm_ml_detectors';
import type { ServiceAnomalyTimeseries } from './service_anomaly_timeseries';

export function getPreferredServiceAnomalyTimeseries({
  preferredEnvironment,
  detectorType,
  allAnomalyTimeseries,
  fallbackToTransactions,
}: {
  preferredEnvironment: Environment;
  detectorType: AnomalyDetectorType;
  allAnomalyTimeseries: ServiceAnomalyTimeseries[];
  fallbackToTransactions: boolean;
}): ServiceAnomalyTimeseries | undefined {
  const seriesForType = allAnomalyTimeseries.filter(
    (serie) =>
      serie.type === detectorType &&
      (fallbackToTransactions ? serie.version <= 2 : serie.version >= 3)
  );

  // When all environments are selected, combine the anomalies of every
  // environment into a single timeseries so they can all be rendered at once.
  if (preferredEnvironment === ENVIRONMENT_ALL.value) {
    return mergeAllEnvironmentsAnomalyTimeseries(seriesForType);
  }

  return seriesForType.find((serie) => serie.environment === preferredEnvironment);
}

function getMaxAnomalyScore(serie: ServiceAnomalyTimeseries): number {
  return serie.anomalies.reduce((max, { y }) => Math.max(max, y ?? 0), 0);
}

function mergeAllEnvironmentsAnomalyTimeseries(
  seriesForType: ServiceAnomalyTimeseries[]
): ServiceAnomalyTimeseries | undefined {
  if (seriesForType.length === 0) {
    return undefined;
  }

  // The "Open anomalies" link requires a single jobId. We use the job that
  // holds the highest scored anomaly across all environments so the single
  // metric viewer opens on the most relevant environment. The max score is
  // cached alongside the series to avoid recomputing it on every iteration.
  const { serie: seriesWithHighestScore } = seriesForType.reduce<{
    serie: ServiceAnomalyTimeseries;
    score: number;
  }>(
    (highest, current) => {
      const score = getMaxAnomalyScore(current);
      return score > highest.score ? { serie: current, score } : highest;
    },
    { serie: seriesForType[0], score: getMaxAnomalyScore(seriesForType[0]) }
  );

  // Tag every anomaly with the environment it belongs to so it can be surfaced
  // in the chart tooltip.
  const anomalies = seriesForType.flatMap((serie) =>
    serie.anomalies.map((anomaly) => ({
      ...anomaly,
      environment: serie.environment,
    }))
  );

  return {
    ...seriesWithHighestScore,
    environment: ENVIRONMENT_ALL.value,
    anomalies,
    // Expected bounds are independent per environment and can't be combined,
    // so they're omitted in the all environments view (the option is disabled).
    bounds: [],
  };
}
