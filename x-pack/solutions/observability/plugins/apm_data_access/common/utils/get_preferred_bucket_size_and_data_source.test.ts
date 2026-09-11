/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ApmDataSourceWithSummary } from '@kbn/apm-types';
import { ApmDocumentType } from '../document_type';
import { RollupInterval } from '../rollup';
import {
  getPreferredBucketSizeAndDataSource,
  intervalToSeconds,
} from './get_preferred_bucket_size_and_data_source';

const serviceTransactionMetricSources: ApmDataSourceWithSummary[] = [
  {
    documentType: ApmDocumentType.ServiceTransactionMetric,
    rollupInterval: RollupInterval.OneMinute,
    hasDurationSummaryField: true,
    hasDocs: true,
  },
  {
    documentType: ApmDocumentType.ServiceTransactionMetric,
    rollupInterval: RollupInterval.TenMinutes,
    hasDurationSummaryField: true,
    hasDocs: true,
  },
  {
    documentType: ApmDocumentType.ServiceTransactionMetric,
    rollupInterval: RollupInterval.SixtyMinutes,
    hasDurationSummaryField: true,
    hasDocs: true,
  },
];

const txMetricSources: ApmDataSourceWithSummary[] = [
  {
    documentType: ApmDocumentType.TransactionMetric,
    rollupInterval: RollupInterval.OneMinute,
    hasDurationSummaryField: true,
    hasDocs: true,
  },
  {
    documentType: ApmDocumentType.TransactionMetric,
    rollupInterval: RollupInterval.TenMinutes,
    hasDurationSummaryField: true,
    hasDocs: true,
  },
  {
    documentType: ApmDocumentType.TransactionMetric,
    rollupInterval: RollupInterval.SixtyMinutes,
    hasDurationSummaryField: true,
    hasDocs: true,
  },
];

const txEventSources: ApmDataSourceWithSummary[] = [
  {
    documentType: ApmDocumentType.TransactionEvent,
    rollupInterval: RollupInterval.None,
    hasDurationSummaryField: false,
    hasDocs: false,
  },
];

describe('getPreferredBucketSizeAndDataSource', () => {
  const tests: Array<{ in: string; out: string }> = [
    { in: '30s', out: '1m' },
    { in: '60s', out: '60s' },
    { in: '10m', out: '10m' },
    { in: '30m', out: '10m' },
    { in: '60m', out: '60m' },
    { in: '120m', out: '60m' },
  ];

  tests.forEach((test) => {
    it(`${test.in} => ${test.out}`, () => {
      const { source, bucketSizeInSeconds } = getPreferredBucketSizeAndDataSource({
        sources: [...serviceTransactionMetricSources, ...txMetricSources, ...txEventSources],
        bucketSizeInSeconds: intervalToSeconds(test.in),
      });

      expect(source.documentType).toBe(ApmDocumentType.ServiceTransactionMetric);

      expect(intervalToSeconds(source.rollupInterval)).toBe(intervalToSeconds(test.out));

      expect(bucketSizeInSeconds).toBeGreaterThanOrEqual(intervalToSeconds(test.out));
    });
  });
});
