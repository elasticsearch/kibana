/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { ChangePointType } from '@kbn/es-types/src';
import type { GetSLOParams, GetSLOResponse } from '@kbn/slo-schema';
import type { Transaction } from '@kbn/apm-types';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';

interface TimeseriesChangePoint {
  change_point?: number | undefined;
  r_value?: number | undefined;
  trend?: string | undefined;
  p_value?: number;
  date: string | undefined;
  type: ChangePointType;
}

interface ChangePointGrouping {
  title: string;
  grouping: string;
  changes: TimeseriesChangePoint[];
}

interface ServiceSummary {
  'service.name': string;
  'service.environment': string[];
  'agent.name'?: string;
  'service.version'?: string[];
  'language.name'?: string;
  'service.framework'?: string;
  instances: number;
  anomalies: unknown;
  alerts: Array<{ type?: string; started: string }>;
  deployments: Array<{ '@timestamp': string }>;
}

interface APMErrorSample {
  processor?: {
    event?: string;
  };
  error?: {
    id?: string;
    culprit?: string;
    grouping_key?: string;
    exception?: Array<{ type?: string }>;
  };
  trace?: {
    id?: string;
  };
}

interface APMTransaction {
  transaction?: {
    id?: string;
    name?: string;
    type?: string;
  };
  trace?: {
    id?: string;
  };
  service?: {
    name?: string;
  };
}

export interface ServicesItemsItem {
  serviceName: string;
  transactionType?: string;
  environments?: string[];
  agentName?: string;
  latency?: number | null;
  transactionErrorRate?: number;
  throughput?: number;
  anomalyScore?: number;
  anomalySeverity?: ML_ANOMALY_SEVERITY;
  alertsCount?: number;
}

interface ServicesItemsResponse {
  items: ServicesItemsItem[];
  maxCountExceeded: boolean;
  serviceOverflowCount: number;
}

// Infra host types
type InfraEntityMetricType =
  | 'cpu'
  | 'cpuV2'
  | 'normalizedLoad1m'
  | 'diskSpaceUsage'
  | 'memory'
  | 'memoryFree'
  | 'rx'
  | 'tx'
  | 'rxV2'
  | 'txV2';

type InfraEntityMetadataType = 'cloud.provider' | 'host.ip' | 'host.os.name';

interface InfraEntityMetrics {
  name: InfraEntityMetricType;
  value: number | null;
}

interface InfraEntityMetadata {
  name: InfraEntityMetadataType;
  value: string | number | null;
}

export interface InfraEntityMetricsItem {
  name: string;
  metrics: InfraEntityMetrics[];
  metadata: InfraEntityMetadata[];
  hasSystemMetrics: boolean;
  alertsCount?: number;
}

interface InfraHostsResponse {
  nodes: InfraEntityMetricsItem[];
}

export interface ExitSpanSample {
  serviceName: string;
  agentName?: string;
  spanDestinationServiceResource: string;
  spanType: string;
  spanSubtype: string;
  destinationService?: {
    serviceName: string;
    agentName?: string;
  };
}

export interface ConnectionStatsItem {
  from: { serviceName: string };
  to: {
    dependencyName: string;
    spanType: string;
    spanSubtype: string;
  };
  value: {
    latency_count: number;
    latency_sum: number;
    error_count: number;
    success_count: number;
  };
}

export interface TraceMetrics {
  latencyUs: number | null;
  throughputPerMin: number | null;
  errorRate: number | null;
}

export type ApmConnectionStatsEntry =
  | { type: 'service'; serviceName: string; metrics: TraceMetrics }
  | {
      type: 'dependency';
      dependencyName: string;
      spanType: string;
      spanSubtype: string;
      metrics: TraceMetrics;
    };

export interface ApmTransactionDetailsResponse {
  transaction?: Transaction;
  transactionId?: string;
  traceId?: string;
}

export interface SyntheticsMonitorDetailsResponse {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  schedule: { number: string; unit: string };
  locations: Array<{ id: string; label: string }>;
  tags?: string[];
  [key: string]: unknown;
}

// APM agent-builder attachment data shapes. Units are aligned with the
// `observability.apm-timeseries` / `observability.apm-metrics` attachment schemas:
// latency in ms, failedTransactionRate as percentage (0–100), throughput in rpm.
export type ApmAttachmentMetric = 'latency' | 'failedTransactionRate' | 'throughput';
export type ApmLatencyType = 'avg' | 'p95' | 'p99';

interface ApmMetricSnapshot {
  latencyMs?: number;
  errorRate?: number;
  throughputRpm?: number;
}

export interface ApmTimeseriesResult {
  serviceName: string;
  metric: ApmAttachmentMetric;
  unit: 'ms' | '%' | 'rpm';
  dataPoints: Array<{ timestamp: number; value: number | null }>;
}

export interface ApmMetricsResult {
  serviceName: string;
  environment?: string;
  current: ApmMetricSnapshot;
  baseline?: ApmMetricSnapshot;
}

/** Per-service alert/SLO badge data, keyed by `service.name`. */
export type ServiceNodeMetadataMap = Record<
  string,
  { alertsCount?: number; sloStatus?: string; sloCount?: number }
>;

export interface ObservabilityAgentBuilderDataRegistryTypes {
  apmErrorDetails: (params: {
    request: KibanaRequest;
    errorId: string;
    serviceName: string;
    serviceEnvironment: string;
    start: string;
    end: string;
    kuery?: string;
  }) => Promise<{ error?: APMErrorSample; transaction?: APMTransaction } | undefined>;

  apmServiceSummary: (params: {
    request: KibanaRequest;
    serviceName: string;
    serviceEnvironment: string;
    start: string;
    end: string;
    transactionType?: string;
  }) => Promise<ServiceSummary>;

  apmExitSpanChangePoints: (params: {
    request: KibanaRequest;
    serviceName: string;
    serviceEnvironment: string;
    start: string;
    end: string;
  }) => Promise<ChangePointGrouping[]>;

  apmServiceChangePoints: (params: {
    request: KibanaRequest;
    serviceName: string;
    serviceEnvironment: string;
    transactionType?: string;
    transactionName?: string;
    start: string;
    end: string;
  }) => Promise<ChangePointGrouping[]>;

  servicesItems: (params: {
    request: KibanaRequest;
    environment?: string;
    kuery?: string;
    start: string;
    end: string;
    searchQuery?: string;
  }) => Promise<ServicesItemsResponse>;

  infraHosts: (params: {
    request: KibanaRequest;
    from: string;
    to: string;
    limit: number;
    query: Record<string, unknown> | undefined;
    hostNames?: string[];
  }) => Promise<InfraHostsResponse>;

  sloDetails: (params: {
    request: KibanaRequest;
    sloId: string;
    sloInstanceId?: GetSLOParams['instanceId'];
    remoteName?: GetSLOParams['remoteName'];
  }) => Promise<GetSLOResponse>;

  apmTraceSampleIds: (params: {
    request: KibanaRequest;
    serviceName: string;
    start: number;
    end: number;
  }) => Promise<{ traceIds: string[] }>;

  apmExitSpanSamples: (params: {
    request: KibanaRequest;
    traceIds: string[];
    start: number;
    end: number;
  }) => Promise<ExitSpanSample[]>;

  apmConnectionStatsItems: (params: {
    request: KibanaRequest;
    start: number;
    end: number;
    filter: QueryDslQueryContainer[];
  }) => Promise<ConnectionStatsItem[]>;

  apmConnectionStats: (params: {
    request: KibanaRequest;
    start: number;
    end: number;
    filter: QueryDslQueryContainer[];
  }) => Promise<ApmConnectionStatsEntry[]>;

  apmTransactionDetails: (params: {
    request: KibanaRequest;
    serviceName: string;
    transactionName: string;
    transactionId?: string;
    traceId?: string;
    start: string;
    end: string;
  }) => Promise<ApmTransactionDetailsResponse>;

  syntheticsMonitorDetails: (params: {
    request: KibanaRequest;
    configId: string;
  }) => Promise<SyntheticsMonitorDetailsResponse>;

  apmTimeseries: (params: {
    request: KibanaRequest;
    serviceName: string;
    environment?: string;
    kqlFilter?: string;
    metric: ApmAttachmentMetric;
    latencyType?: ApmLatencyType;
    start: string;
    end: string;
  }) => Promise<ApmTimeseriesResult>;

  apmMetrics: (params: {
    request: KibanaRequest;
    serviceName: string;
    environment?: string;
    kqlFilter?: string;
    latencyType?: ApmLatencyType;
    currentStart: string;
    currentEnd: string;
    baselineStart?: string;
    baselineEnd?: string;
  }) => Promise<ApmMetricsResult>;

  servicesAlertsAndSlo: (params: {
    request: KibanaRequest;
    serviceNames: string[];
    environment?: string;
    kuery?: string;
    start: string;
    end: string;
  }) => Promise<ServiceNodeMetadataMap>;
}
