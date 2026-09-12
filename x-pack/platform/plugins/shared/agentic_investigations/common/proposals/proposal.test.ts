/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MAX_CHARTS_SUMMARY_BUCKETS } from './constants';
import { proposalChartsSummaryQuerySchema } from './proposal';

describe('proposalChartsSummaryQuerySchema', () => {
  it('should default to a 24h window at 30 minute granularity', () => {
    expect(proposalChartsSummaryQuerySchema.parse({})).toEqual({
      windowHours: 24,
      bucketMinutes: 30,
    });
  });

  it('should coerce the query string values a route hands it', () => {
    expect(
      proposalChartsSummaryQuerySchema.parse({ windowHours: '6', bucketMinutes: '15' })
    ).toEqual({ windowHours: 6, bucketMinutes: 15 });
  });

  /**
   * Each bound is individually valid; together they resolve to ~2 000 buckets,
   * which crosses the ES|QL result ceiling. Truncation drops the tail of the
   * sort — the most recent buckets — without erroring, so rejecting the request
   * is the only honest answer.
   */
  it('should reject a window and granularity that exceed the bucket ceiling', () => {
    const result = proposalChartsSummaryQuerySchema.safeParse({
      windowHours: 168,
      bucketMinutes: 5,
    });

    expect(result.success).toBe(false);
  });

  it('should accept the widest window at a granularity that stays under the ceiling', () => {
    const windowHours = 168;
    const bucketMinutes = 15;
    expect((windowHours * 60) / bucketMinutes).toBeLessThanOrEqual(MAX_CHARTS_SUMMARY_BUCKETS);

    expect(proposalChartsSummaryQuerySchema.safeParse({ windowHours, bucketMinutes }).success).toBe(
      true
    );
  });
});
