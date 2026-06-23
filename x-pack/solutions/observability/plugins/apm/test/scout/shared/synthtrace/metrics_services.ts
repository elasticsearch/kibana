/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { EsClient } from '@kbn/scout-oblt';
import type { ApmFields, SynthtraceGenerator } from '@kbn/synthtrace-client';
import { timerange } from '@kbn/synthtrace-client';
import {
  APM_METRICS_DASHBOARD_SERVICES,
  APM_METRICS_NON_DASHBOARD_SERVICES,
  APM_METRICS_SERVICE_NAMES,
  createMetricsServiceInstance,
  generateAppMetrics,
} from '@kbn/synthtrace';
import {
  METRICS_ENVIRONMENT,
  SERVICE_METRICS_MIGRATION_OVERLAP,
  SERVICE_METRICS_MIGRATION_SEQUENTIAL,
  METRICS_MIGRATION_CLASSIC_START_DATE,
  METRICS_MIGRATION_SEQUENTIAL_CLASSIC_END_DATE,
  METRICS_MIGRATION_SEQUENTIAL_OTEL_START_DATE,
  METRICS_MIGRATION_OVERLAP_OTEL_START_DATE,
  METRICS_MIGRATION_OVERLAP_CLASSIC_END_DATE,
  METRICS_MIGRATION_OTEL_END_DATE,
} from '../constants';

// We seed every dashboard service plus every non-dashboard service so that
// both the dashboard-catalog tests and the non-dashboard variations
// (JRuby JVM table, Go classic generic CPU chart, Ruby classic generic
// metrics) have the underlying app-metric documents they need.
const METRIC_SERVICES = [...APM_METRICS_DASHBOARD_SERVICES, ...APM_METRICS_NON_DASHBOARD_SERVICES];

export function metricsServices({
  from,
  to,
}: {
  from: number;
  to: number;
}): SynthtraceGenerator<ApmFields> {
  const range = timerange(from, to);

  const instances = METRIC_SERVICES.map((config) =>
    createMetricsServiceInstance(config, METRICS_ENVIRONMENT)
  );

  return range
    .interval('30s')
    .rate(1)
    .generator((timestamp) =>
      instances.flatMap(({ instance, config }) => [
        instance
          .transaction({ transactionName: 'GET /api/metrics' })
          .timestamp(timestamp)
          .duration(200)
          .success(),
        ...generateAppMetrics(instance, config, timestamp),
      ])
    );
}

export const OTEL_NATIVE_JAVA_TEMPLATE_NAME = 'metrics-otel_native_java-scout';
const APM_INTERNAL_METRICS_INDEX = 'metrics-apm.internal-default';
const APM_TRACES_INDEX = 'traces-apm-default';
const DOC_INTERVAL_MS = 30_000;

interface IndexedDoc {
  index: string;
  doc: Record<string, unknown>;
}

interface OtelNativeJavaServiceConfig {
  serviceName: string;
  agentName: string;
  indexName: string;
  extraMetrics: Record<string, unknown>;
}

const OTEL_NATIVE_JAVA_SERVICES: OtelNativeJavaServiceConfig[] = [
  {
    serviceName: APM_METRICS_SERVICE_NAMES.OTEL_NATIVE_EDOT_JAVA,
    agentName: 'opentelemetry/java/elastic',
    indexName: `metrics-otel_native.${APM_METRICS_SERVICE_NAMES.OTEL_NATIVE_EDOT_JAVA}.otel-default`,
    extraMetrics: {
      'jvm.system.cpu.utilization': 0.5,
      'jvm.memory.used_after_last_gc': 250_000_000,
      'jvm.class.count': 8500,
      'jvm.gc.action': 'end of major GC',
      'jvm.gc.name': 'G1 Old Generation',
      'attributes.jvm.gc.action': 'end of major GC',
      'attributes.jvm.gc.name': 'G1 Old Generation',
    },
  },
  {
    serviceName: APM_METRICS_SERVICE_NAMES.OTEL_NATIVE_OTEL_JAVA,
    agentName: 'opentelemetry/java',
    indexName: `metrics-otel_native.${APM_METRICS_SERVICE_NAMES.OTEL_NATIVE_OTEL_JAVA}.otel-default`,
    extraMetrics: {
      'jvm.memory.used_after_last_gc': 250_000_000,
      'jvm.class.count': 8500,
    },
  },
];

const getOtelMigrationIndexName = (serviceName: string) =>
  `metrics-otel_native.${serviceName}.otel-default`;

function generateTimestampedDocs(
  startMs: number,
  endMs: number,
  createDocs: (timestamp: number) => IndexedDoc[]
): IndexedDoc[] {
  const docs: IndexedDoc[] = [];
  for (let timestamp = startMs; timestamp <= endMs; timestamp += DOC_INTERVAL_MS) {
    docs.push(...createDocs(timestamp));
  }
  return docs;
}

function generateOtelNativeJavaDocs(
  config: OtelNativeJavaServiceConfig,
  startMs: number,
  endMs: number
): IndexedDoc[] {
  return generateTimestampedDocs(startMs, endMs, (ts) => {
    const timestamp = new Date(ts).toISOString();

    const baseFields = {
      '@timestamp': timestamp,
      'processor.event': 'metric',
      'metricset.name': 'app',
      'service.name': config.serviceName,
      'service.environment': METRICS_ENVIRONMENT,
      'service.node.name': `${config.serviceName}-instance`,
      'service.instance.id': `${config.serviceName}-instance`,
      'host.name': `${config.serviceName}-host`,
      'agent.name': config.agentName,
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.language': 'java',
    };

    return [
      {
        index: config.indexName,
        doc: {
          ...baseFields,
          'jvm.cpu.recent_utilization': 0.3,
          'jvm.memory.used': 300_000_000,
          'jvm.memory.limit': 512_000_000,
          'jvm.memory.committed': 400_000_000,
          'jvm.memory.type': 'heap',
          'jvm.memory.pool.name': 'G1 Old Gen',
          'jvm.thread.count': 42,
          'jvm.thread.state': 'runnable',
          'jvm.thread.daemon': true,
          ...config.extraMetrics,
        },
      },
      {
        index: config.indexName,
        doc: {
          ...baseFields,
          'jvm.cpu.recent_utilization': 0.3,
          'jvm.memory.used': 100_000_000,
          'jvm.memory.limit': 256_000_000,
          'jvm.memory.committed': 120_000_000,
          'jvm.memory.type': 'non_heap',
          'jvm.memory.pool.name': 'Metaspace',
          'jvm.thread.count': 42,
          ...config.extraMetrics,
        },
      },
    ];
  });
}

type MigrationIngestionType = 'classicApm' | 'otelNative';

const getMigrationCommonFields = (serviceName: string, ingestionType: MigrationIngestionType) => {
  const isOtelNative = ingestionType === 'otelNative';
  return {
    'service.name': serviceName,
    'service.environment': METRICS_ENVIRONMENT,
    'service.node.name': `${serviceName}-${isOtelNative ? 'otel' : 'classic'}-instance`,
    'host.name': `${serviceName}-host`,
    ...(isOtelNative
      ? {
          'agent.name': 'opentelemetry/java/elastic',
          'telemetry.sdk.name': 'opentelemetry',
          'telemetry.sdk.language': 'java',
        }
      : {
          'agent.name': 'java',
          'agent.version': '1.50.0',
          'service.runtime.name': 'Java',
          'service.runtime.version': '17.0.1',
        }),
  };
};

const generateClassicApmMigrationMetricDocs = (
  timestamp: string,
  fields: Record<string, unknown>
): IndexedDoc[] => [
  {
    index: APM_INTERNAL_METRICS_INDEX,
    doc: {
      '@timestamp': timestamp,
      'processor.event': 'metric',
      'metricset.name': 'app',
      ...fields,
      'system.process.cpu.total.norm.pct': 0.6,
      'system.cpu.total.norm.pct': 0.4,
      'system.memory.actual.free': 2_000_000_000,
      'system.memory.total': 8_000_000_000,
      'jvm.memory.heap.used': 300_000_000,
      'jvm.memory.heap.max': 512_000_000,
      'jvm.memory.non_heap.used': 80_000_000,
      'jvm.thread.count': 42,
    },
  },
];

const generateOtelMigrationMetricDocs = (
  serviceName: string,
  timestamp: string,
  fields: Record<string, unknown>
): IndexedDoc[] => {
  const otelIndexName = getOtelMigrationIndexName(serviceName);

  return [
    {
      index: otelIndexName,
      doc: {
        '@timestamp': timestamp,
        'processor.event': 'metric',
        'metricset.name': 'app',
        ...fields,
        'service.instance.id': `${serviceName}-otel-instance`,
        'jvm.cpu.recent_utilization': 0.3,
        'jvm.system.cpu.utilization': 0.25,
        'jvm.memory.used': 300_000_000,
        'jvm.memory.limit': 512_000_000,
        'jvm.memory.committed': 400_000_000,
        'jvm.memory.used_after_last_gc': 200_000_000,
        'jvm.memory.type': 'heap',
        'jvm.memory.pool.name': 'G1 Old Gen',
        'jvm.thread.count': 42,
        'jvm.thread.state': 'runnable',
        'jvm.thread.daemon': true,
        'jvm.class.count': 8500,
        'jvm.gc.action': 'end of major GC',
        'jvm.gc.name': 'G1 Old Generation',
        'attributes.jvm.gc.action': 'end of major GC',
        'attributes.jvm.gc.name': 'G1 Old Generation',
      },
    },
    {
      index: otelIndexName,
      doc: {
        '@timestamp': timestamp,
        'processor.event': 'metric',
        'metricset.name': 'app',
        ...fields,
        'service.instance.id': `${serviceName}-otel-instance`,
        'jvm.cpu.recent_utilization': 0.3,
        'jvm.memory.used': 100_000_000,
        'jvm.memory.limit': 256_000_000,
        'jvm.memory.committed': 120_000_000,
        'jvm.memory.type': 'non_heap',
        'jvm.memory.pool.name': 'Metaspace',
        'jvm.thread.count': 42,
      },
    },
  ];
};

const generateMigrationTransactionDoc = (
  timestamp: string,
  fields: Record<string, unknown>
): IndexedDoc => ({
  index: APM_TRACES_INDEX,
  doc: {
    '@timestamp': timestamp,
    'processor.event': 'transaction',
    'transaction.name': 'GET /api/metrics-migration',
    'transaction.type': 'request',
    'transaction.result': 'HTTP 2xx',
    'transaction.duration.us': 200_000,
    'event.outcome': 'success',
    ...fields,
  },
});

const generateMigrationDocs = ({
  serviceName,
  ingestionType,
  startMs,
  endMs,
}: {
  serviceName: string;
  ingestionType: MigrationIngestionType;
  startMs: number;
  endMs: number;
}): IndexedDoc[] => {
  const fields = getMigrationCommonFields(serviceName, ingestionType);

  return generateTimestampedDocs(startMs, endMs, (ts) => {
    const timestamp = new Date(ts).toISOString();
    const metricDocs =
      ingestionType === 'otelNative'
        ? generateOtelMigrationMetricDocs(serviceName, timestamp, fields)
        : generateClassicApmMigrationMetricDocs(timestamp, fields);

    return [...metricDocs, generateMigrationTransactionDoc(timestamp, fields)];
  });
};

function generateMixedInstrumentationMigrationDocs(): IndexedDoc[] {
  const migrationRanges = [
    {
      serviceName: SERVICE_METRICS_MIGRATION_SEQUENTIAL,
      ingestionType: 'classicApm',
      start: METRICS_MIGRATION_CLASSIC_START_DATE,
      end: METRICS_MIGRATION_SEQUENTIAL_CLASSIC_END_DATE,
    },
    {
      serviceName: SERVICE_METRICS_MIGRATION_SEQUENTIAL,
      ingestionType: 'otelNative',
      start: METRICS_MIGRATION_SEQUENTIAL_OTEL_START_DATE,
      end: METRICS_MIGRATION_OTEL_END_DATE,
    },
    {
      serviceName: SERVICE_METRICS_MIGRATION_OVERLAP,
      ingestionType: 'classicApm',
      start: METRICS_MIGRATION_CLASSIC_START_DATE,
      end: METRICS_MIGRATION_OVERLAP_CLASSIC_END_DATE,
    },
    {
      serviceName: SERVICE_METRICS_MIGRATION_OVERLAP,
      ingestionType: 'otelNative',
      start: METRICS_MIGRATION_OVERLAP_OTEL_START_DATE,
      end: METRICS_MIGRATION_OTEL_END_DATE,
    },
  ] as const;

  return migrationRanges.flatMap(({ serviceName, ingestionType, start, end }) =>
    generateMigrationDocs({
      serviceName,
      ingestionType,
      startMs: new Date(start).getTime(),
      endMs: new Date(end).getTime(),
    })
  );
}

export async function setupOtelNativeJavaMetrics(
  esClient: EsClient,
  startMs: number,
  endMs: number
): Promise<void> {
  const indexPatterns = [
    ...OTEL_NATIVE_JAVA_SERVICES.map((s) => s.indexName.replace(/-default$/, '-*')),
    ...[SERVICE_METRICS_MIGRATION_SEQUENTIAL, SERVICE_METRICS_MIGRATION_OVERLAP].map(
      (serviceName) => getOtelMigrationIndexName(serviceName).replace(/-default$/, '-*')
    ),
  ];

  await esClient.indices.putIndexTemplate({
    name: OTEL_NATIVE_JAVA_TEMPLATE_NAME,
    index_patterns: indexPatterns,
    data_stream: {},
    priority: 500,
    template: {
      settings: { 'index.mapping.total_fields.limit': 2000 },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          'service.name': { type: 'keyword' },
          'service.environment': { type: 'keyword' },
          'service.node.name': { type: 'keyword' },
          'service.instance.id': { type: 'keyword' },
          'host.name': { type: 'keyword' },
          'agent.name': { type: 'keyword' },
          'telemetry.sdk.name': { type: 'keyword' },
          'telemetry.sdk.language': { type: 'keyword' },
          'processor.event': { type: 'keyword' },
          'metricset.name': { type: 'keyword' },
          'jvm.memory.type': { type: 'keyword' },
          'jvm.memory.pool.name': { type: 'keyword' },
          'jvm.thread.daemon': { type: 'boolean' },
          'jvm.thread.state': { type: 'keyword' },
          'jvm.gc.action': { type: 'keyword' },
          'jvm.gc.name': { type: 'keyword' },
          'attributes.jvm.gc.action': { type: 'keyword' },
          'attributes.jvm.gc.name': { type: 'keyword' },
          'jvm.cpu.recent_utilization': { type: 'double' },
          'jvm.system.cpu.utilization': { type: 'double' },
          'jvm.memory.used': { type: 'long' },
          'jvm.memory.limit': { type: 'long' },
          'jvm.memory.committed': { type: 'long' },
          'jvm.memory.used_after_last_gc': { type: 'long' },
          'jvm.thread.count': { type: 'integer' },
          'jvm.class.count': { type: 'integer' },
        },
      },
    },
  });

  const allDocs = [
    ...OTEL_NATIVE_JAVA_SERVICES.flatMap((config) =>
      generateOtelNativeJavaDocs(config, startMs, endMs)
    ),
    ...generateMixedInstrumentationMigrationDocs(),
  ];

  const body = allDocs.flatMap(({ index, doc }) => [{ create: { _index: index } }, doc]);
  await esClient.bulk({ body, refresh: 'wait_for' });

  await esClient.indices.refresh({
    index: [
      APM_INTERNAL_METRICS_INDEX,
      APM_TRACES_INDEX,
      getOtelMigrationIndexName(SERVICE_METRICS_MIGRATION_SEQUENTIAL),
      getOtelMigrationIndexName(SERVICE_METRICS_MIGRATION_OVERLAP),
    ].join(','),
  });
}
