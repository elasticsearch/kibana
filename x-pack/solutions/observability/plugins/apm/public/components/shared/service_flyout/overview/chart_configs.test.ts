/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LensConfig, LensESQLDataset, LensSeriesLayer } from '@kbn/lens-embeddable-utils';
import { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import {
  ENVIRONMENT_ALL,
  ENVIRONMENT_NOT_DEFINED,
} from '../../../../../common/environment_filter_values';
import { ChartType } from '../../charts/helper/get_timeseries_color';
import { getChartDefinitions, getLatencyChartType } from './chart_configs';

const INDEXES = 'traces-apm*,metrics-apm*';
const INDEX_PATTERNS = ['traces-apm*', 'metrics-apm*'];

type XYLensConfig = Extract<LensConfig, { chartType: 'xy' }>;

function seriesLayerOf(config: LensConfig | undefined): LensSeriesLayer {
  if (!config) {
    throw new Error('Expected a built Lens config');
  }
  return (config as XYLensConfig).layers[0] as LensSeriesLayer;
}

function buildDefinitions(
  overrides: Partial<Parameters<typeof getChartDefinitions>[0]> = {}
): ReturnType<typeof getChartDefinitions> {
  return getChartDefinitions({
    indexes: INDEXES,
    serviceName: 'opbeans-java',
    environment: 'production',
    kuery: '',
    transactionType: 'request',
    latencyAggregationType: LatencyAggregationType.avg,
    ...overrides,
  });
}

function esqlOf(config: LensConfig | undefined): string {
  if (!config) {
    throw new Error('Expected a built Lens config');
  }
  return ((config as XYLensConfig).dataset as LensESQLDataset).esql;
}

describe('service flyout chart_configs', () => {
  describe('getLatencyChartType', () => {
    it('maps the aggregation type to the matching chart type', () => {
      expect(getLatencyChartType(LatencyAggregationType.p95)).toBe(ChartType.LATENCY_P95);
      expect(getLatencyChartType(LatencyAggregationType.p99)).toBe(ChartType.LATENCY_P99);
      expect(getLatencyChartType(LatencyAggregationType.avg)).toBe(ChartType.LATENCY_AVG);
    });
  });

  describe('getChartDefinitions', () => {
    it('returns the RED key metrics and infrastructure metrics', () => {
      const { keyMetrics, infrastructureMetrics } = buildDefinitions();

      expect(keyMetrics.map((chart) => chart.id)).toEqual([
        'latency',
        'throughput',
        'failedTransactionRate',
      ]);
      expect(infrastructureMetrics.map((chart) => chart.id)).toEqual(['cpuUsage', 'memoryUsage']);
    });

    it('buckets every chart by a `timestamp` TBUCKET aliased to the date histogram x-axis', () => {
      const { keyMetrics, infrastructureMetrics } = buildDefinitions();

      [...keyMetrics, ...infrastructureMetrics].forEach(({ config }) => {
        const esql = esqlOf(config);

        INDEX_PATTERNS.forEach((index) => expect(esql).toContain(index));
        expect(esql).toContain('BY timestamp = TBUCKET(100)');
        // the x-axis field must match the bucket column so Lens can resolve it
        expect(seriesLayerOf(config).xAxis).toEqual({ field: 'timestamp', type: 'dateHistogram' });
      });
    });

    it('returns the chart layout without a config until the index pattern resolves', () => {
      const { keyMetrics, infrastructureMetrics } = buildDefinitions({
        indexes: undefined,
        latencyTitleAction: 'latency-action',
      });

      // the layout (ids, titles, latency title action) is still produced so the
      // sections render with loading placeholders instead of appearing empty
      expect(keyMetrics.map((chart) => chart.id)).toEqual([
        'latency',
        'throughput',
        'failedTransactionRate',
      ]);
      expect(infrastructureMetrics.map((chart) => chart.id)).toEqual(['cpuUsage', 'memoryUsage']);
      [...keyMetrics, ...infrastructureMetrics].forEach((chart) => {
        expect(chart.title).toEqual(expect.any(String));
        expect(chart.config).toBeUndefined();
      });
      expect(keyMetrics[0].titleAction).toBe('latency-action');
    });

    it('omits the transaction type clause when transactionType is empty string', () => {
      const { keyMetrics } = buildDefinitions({ transactionType: '' });

      keyMetrics.forEach(({ config }) => {
        expect(esqlOf(config)).not.toContain('transaction.type');
      });
    });

    it('filters by the literal sentinel and missing field when environment is ENVIRONMENT_NOT_DEFINED', () => {
      const { keyMetrics } = buildDefinitions({ environment: ENVIRONMENT_NOT_DEFINED.value });

      expect(esqlOf(keyMetrics[0].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | WHERE `service.environment` == "ENVIRONMENT_NOT_DEFINED" OR `service.environment` IS NULL | EVAL duration_ms = TO_DOUBLE(transaction.duration.us) / 1000 | STATS AVG(duration_ms) BY timestamp = TBUCKET(100)'
      );
    });

    it('omits the environment clause when environment is ENVIRONMENT_ALL', () => {
      const { keyMetrics } = buildDefinitions({ environment: ENVIRONMENT_ALL.value });

      expect(esqlOf(keyMetrics[0].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | EVAL duration_ms = TO_DOUBLE(transaction.duration.us) / 1000 | STATS AVG(duration_ms) BY timestamp = TBUCKET(100)'
      );
    });

    it('wraps the kuery in an ES|QL KQL() clause', () => {
      const { keyMetrics } = buildDefinitions({ kuery: 'host.name: "app-1"' });

      expect(esqlOf(keyMetrics[0].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | WHERE `service.environment` == "production" | WHERE KQL("host.name: \\"app-1\\"") | EVAL duration_ms = TO_DOUBLE(transaction.duration.us) / 1000 | STATS AVG(duration_ms) BY timestamp = TBUCKET(100)'
      );
    });

    it('builds the latency series from the average aggregation by default', () => {
      const { keyMetrics } = buildDefinitions();
      const latency = keyMetrics[0].config as XYLensConfig;

      expect(esqlOf(keyMetrics[0].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | WHERE `service.environment` == "production" | EVAL duration_ms = TO_DOUBLE(transaction.duration.us) / 1000 | STATS AVG(duration_ms) BY timestamp = TBUCKET(100)'
      );
      // the y-axis value must match the STATS output column so Lens can resolve it
      expect(latency.layers[0].yAxis[0].value).toBe('AVG(duration_ms)');
    });

    it('uses the percentile aggregation for p95 / p99 latency', () => {
      const p95 = buildDefinitions({ latencyAggregationType: LatencyAggregationType.p95 });
      const p99 = buildDefinitions({ latencyAggregationType: LatencyAggregationType.p99 });

      expect(esqlOf(p95.keyMetrics[0].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | WHERE `service.environment` == "production" | EVAL duration_ms = TO_DOUBLE(transaction.duration.us) / 1000 | STATS PERCENTILE(duration_ms, 95) BY timestamp = TBUCKET(100)'
      );
      expect((p95.keyMetrics[0].config as XYLensConfig).layers[0].yAxis[0].value).toBe(
        'PERCENTILE(duration_ms, 95)'
      );
      expect(esqlOf(p99.keyMetrics[0].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | WHERE `service.environment` == "production" | EVAL duration_ms = TO_DOUBLE(transaction.duration.us) / 1000 | STATS PERCENTILE(duration_ms, 99) BY timestamp = TBUCKET(100)'
      );
      expect((p99.keyMetrics[0].config as XYLensConfig).layers[0].yAxis[0].value).toBe(
        'PERCENTILE(duration_ms, 99)'
      );
    });

    it('builds throughput from a raw count per bucket', () => {
      const { keyMetrics } = buildDefinitions();
      const throughput = keyMetrics[1].config as XYLensConfig;

      expect(esqlOf(keyMetrics[1].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | WHERE `service.environment` == "production" | STATS COUNT(*) BY timestamp = TBUCKET(100)'
      );
      expect(throughput.layers[0].yAxis[0].value).toBe('COUNT(*)');
    });

    it('builds failed transaction rate from the event.outcome failure ratio', () => {
      const { keyMetrics } = buildDefinitions();
      const failedRate = keyMetrics[2].config as XYLensConfig;

      expect(esqlOf(keyMetrics[2].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "transaction" | WHERE `service.name` == "opbeans-java" | WHERE `transaction.type` == "request" | WHERE `service.environment` == "production" | STATS failure = COUNT(*) WHERE TO_STRING(event.outcome) == "failure", all = COUNT(*) WHERE (TO_STRING(event.outcome) IN ("failure", "success")) BY timestamp = TBUCKET(100) | EVAL failed_transaction_rate = CASE(all > 0, TO_DOUBLE(failure) / all, NULL) | KEEP timestamp, failed_transaction_rate | SORT timestamp'
      );
      expect(failedRate.layers[0].yAxis[0].value).toBe('failed_transaction_rate');
      expect(failedRate.yBounds).toEqual({ mode: 'custom', lowerBound: 0, upperBound: 1 });
    });

    it('scopes infrastructure charts to the metric processor event without a transaction type', () => {
      const { infrastructureMetrics } = buildDefinitions();
      const cpuEsql = esqlOf(infrastructureMetrics[0].config);
      const memoryEsql = esqlOf(infrastructureMetrics[1].config);

      [cpuEsql, memoryEsql].forEach((esql) => {
        expect(esql).toContain('`processor.event` == "metric"');
        expect(esql).not.toContain('transaction.type');
      });
    });

    it('builds the CPU usage series from the casted system cpu percent average', () => {
      const { infrastructureMetrics } = buildDefinitions();
      const cpu = infrastructureMetrics[0].config as XYLensConfig;

      expect(esqlOf(infrastructureMetrics[0].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "metric" | WHERE `service.name` == "opbeans-java" | WHERE `service.environment` == "production" | WHERE TO_DOUBLE(system.cpu.total.norm.pct) IS NOT NULL | STATS AVG(TO_DOUBLE(system.cpu.total.norm.pct)) BY timestamp = TBUCKET(100)'
      );
      expect(cpu.layers[0].yAxis[0].value).toBe('AVG(TO_DOUBLE(system.cpu.total.norm.pct))');
    });

    it('builds the memory usage series from casted free / total memory', () => {
      const { infrastructureMetrics } = buildDefinitions();
      const memory = infrastructureMetrics[1].config as XYLensConfig;

      expect(esqlOf(infrastructureMetrics[1].config)).toEqual(
        'FROM traces-apm*, metrics-apm* | WHERE `processor.event` == "metric" | WHERE `service.name` == "opbeans-java" | WHERE `service.environment` == "production" | EVAL cgroup_usage = TO_DOUBLE(system.process.cgroup.memory.mem.usage.bytes) | EVAL cgroup_limit = TO_DOUBLE(system.process.cgroup.memory.mem.`limit`.bytes) | EVAL sys_free = TO_DOUBLE(system.memory.actual.free) | EVAL sys_total = TO_DOUBLE(system.memory.total) | WHERE cgroup_usage IS NOT NULL OR sys_free IS NOT NULL AND sys_total IS NOT NULL | EVAL effective_total = CASE(cgroup_limit > 0 AND cgroup_limit != 9223372036854772000, cgroup_limit, sys_total) | EVAL memory_usage = CASE(cgroup_usage IS NOT NULL AND effective_total > 0, cgroup_usage / effective_total, sys_total > 0 AND sys_free IS NOT NULL, 1 - sys_free / sys_total, NULL) | STATS memory_usage = AVG(memory_usage) BY timestamp = TBUCKET(100) | KEEP timestamp, memory_usage | SORT timestamp'
      );
      expect(memory.layers[0].yAxis[0].value).toBe('memory_usage');
    });

    it('attaches the latency title action to the latency chart only', () => {
      const titleAction = 'latency-action';
      const { keyMetrics } = buildDefinitions({ latencyTitleAction: titleAction });

      expect(keyMetrics[0].titleAction).toBe(titleAction);
      expect(keyMetrics[1].titleAction).toBeUndefined();
    });
  });
});
