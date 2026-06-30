/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LatencyAggregationType } from '../../../common/latency_aggregation_types';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { getApmTimeseries, ApmTimeseriesType } from './get_change_points/get_apm_timeseries';

/**
 * Metric identifiers used by the agent-builder APM attachments. These map onto
 * the lower-level {@link ApmTimeseriesType} series and carry a stable display unit.
 *
 * Units are deliberately aligned with the `observability.apm-timeseries` and
 * `observability.apm-metrics` attachment schemas:
 * - latency               → ms
 * - failedTransactionRate → percentage (0–100)
 * - throughput            → requests per minute
 */
export type ApmAttachmentMetric = 'latency' | 'failedTransactionRate' | 'throughput';

/** Latency aggregation accepted as a plain string from the tool layer. */
export type ApmLatencyType = 'avg' | 'p95' | 'p99';

const METRIC_UNIT: Record<ApmAttachmentMetric, 'ms' | '%' | 'rpm'> = {
  latency: 'ms',
  failedTransactionRate: '%',
  throughput: 'rpm',
};

const LATENCY_TYPE_MAP: Record<ApmLatencyType, LatencyAggregationType> = {
  avg: LatencyAggregationType.avg,
  p95: LatencyAggregationType.p95,
  p99: LatencyAggregationType.p99,
};

/** A single entry of the `stats` array accepted by {@link getApmTimeseries}. */
type ApmTimeseriesStat = Parameters<typeof getApmTimeseries>[0]['arguments']['stats'][number];

function buildTimeseriesStat({
  serviceName,
  environment,
  kqlFilter,
  metric,
  latencyType,
}: {
  serviceName: string;
  environment?: string;
  kqlFilter?: string;
  metric: ApmAttachmentMetric;
  latencyType: LatencyAggregationType;
}): ApmTimeseriesStat {
  const base = {
    'service.name': serviceName,
    title: metric,
    ...(kqlFilter ? { filter: kqlFilter } : {}),
    ...(environment ? { 'service.environment': environment } : {}),
  };

  switch (metric) {
    case 'latency':
      return {
        ...base,
        timeseries: { name: ApmTimeseriesType.transactionLatency, function: latencyType },
      };
    case 'failedTransactionRate':
      return {
        ...base,
        timeseries: { name: ApmTimeseriesType.transactionFailureRate },
      };
    case 'throughput':
      return {
        ...base,
        timeseries: { name: ApmTimeseriesType.transactionThroughput },
      };
  }
}

/**
 * Returns time-bucketed data points for a single service + metric, shaped for the
 * `observability.apm-timeseries` attachment.
 */
export async function getApmTimeseriesForAttachment({
  apmEventClient,
  serviceName,
  environment,
  kqlFilter,
  metric,
  latencyType = 'avg',
  start,
  end,
}: {
  apmEventClient: APMEventClient;
  serviceName: string;
  environment?: string;
  kqlFilter?: string;
  metric: ApmAttachmentMetric;
  latencyType?: ApmLatencyType;
  start: string;
  end: string;
}): Promise<{
  serviceName: string;
  metric: ApmAttachmentMetric;
  unit: 'ms' | '%' | 'rpm';
  dataPoints: Array<{ timestamp: number; value: number | null }>;
}> {
  const series = await getApmTimeseries({
    apmEventClient,
    arguments: {
      start,
      end,
      stats: [
        buildTimeseriesStat({
          serviceName,
          environment,
          kqlFilter,
          metric,
          latencyType: LATENCY_TYPE_MAP[latencyType],
        }),
      ],
    },
  });

  // A single service + metric request yields at most one series.
  const dataPoints = (series[0]?.data ?? []).map((point) => ({
    timestamp: point.x,
    value: point.y,
  }));

  return { serviceName, metric, unit: METRIC_UNIT[metric], dataPoints };
}

interface MetricSnapshot {
  latencyMs?: number;
  errorRate?: number;
  throughputRpm?: number;
}

async function getSnapshot({
  apmEventClient,
  serviceName,
  environment,
  kqlFilter,
  latencyType,
  start,
  end,
}: {
  apmEventClient: APMEventClient;
  serviceName: string;
  environment?: string;
  kqlFilter?: string;
  latencyType: ApmLatencyType;
  start: string;
  end: string;
}): Promise<MetricSnapshot> {
  const metrics: ApmAttachmentMetric[] = ['latency', 'failedTransactionRate', 'throughput'];

  const series = await getApmTimeseries({
    apmEventClient,
    arguments: {
      start,
      end,
      stats: metrics.map((metric) =>
        buildTimeseriesStat({
          serviceName,
          environment,
          kqlFilter,
          metric,
          latencyType: LATENCY_TYPE_MAP[latencyType],
        })
      ),
    },
  });

  // Each series' `title` is the metric name we set in buildTimeseriesStat, so we
  // can map results back to metrics regardless of ordering.
  const byMetric = new Map(series.map((s) => [s.stat.title as ApmAttachmentMetric, s.value]));

  const snapshot: MetricSnapshot = {};
  const latency = byMetric.get('latency');
  const errorRate = byMetric.get('failedTransactionRate');
  const throughput = byMetric.get('throughput');
  if (latency != null) snapshot.latencyMs = latency;
  if (errorRate != null) snapshot.errorRate = errorRate;
  if (throughput != null) snapshot.throughputRpm = throughput;
  return snapshot;
}

/**
 * Returns current-vs-baseline metric snapshots for a service, shaped for the
 * `observability.apm-metrics` attachment. Error rate is a percentage (0–100),
 * latency is in ms, throughput is in requests per minute.
 */
export async function getApmMetricsForAttachment({
  apmEventClient,
  serviceName,
  environment,
  kqlFilter,
  latencyType = 'avg',
  currentStart,
  currentEnd,
  baselineStart,
  baselineEnd,
}: {
  apmEventClient: APMEventClient;
  serviceName: string;
  environment?: string;
  kqlFilter?: string;
  latencyType?: ApmLatencyType;
  currentStart: string;
  currentEnd: string;
  baselineStart?: string;
  baselineEnd?: string;
}): Promise<{
  serviceName: string;
  environment?: string;
  current: MetricSnapshot;
  baseline?: MetricSnapshot;
}> {
  const hasBaseline = baselineStart != null && baselineEnd != null;

  const [current, baseline] = await Promise.all([
    getSnapshot({
      apmEventClient,
      serviceName,
      environment,
      kqlFilter,
      latencyType,
      start: currentStart,
      end: currentEnd,
    }),
    hasBaseline
      ? getSnapshot({
          apmEventClient,
          serviceName,
          environment,
          kqlFilter,
          latencyType,
          start: baselineStart,
          end: baselineEnd,
        })
      : Promise.resolve(undefined),
  ]);

  return {
    serviceName,
    ...(environment ? { environment } : {}),
    current,
    ...(baseline ? { baseline } : {}),
  };
}
