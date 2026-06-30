/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  getAllowedRegressionDeltaBytes,
  isMemoryRegression,
  MAX_RSS_REGRESSION_THRESHOLD_POLICY,
  TAIL_HEAP_USED_REGRESSION_THRESHOLD_POLICY,
  MIN_MAX_RSS_REGRESSION_DELTA_BYTES,
  MIN_TAIL_HEAP_USED_REGRESSION_DELTA_BYTES,
  MIN_TAIL_RSS_REGRESSION_DELTA_BYTES,
} from './memory_regression_threshold';

describe('getAllowedRegressionDeltaBytes', () => {
  it('uses the fixed 50 MiB floor for small baselines', () => {
    const baselineMedianRssBytes = 500 * 1024 * 1024;

    expect(getAllowedRegressionDeltaBytes(baselineMedianRssBytes)).toBe(
      MIN_TAIL_RSS_REGRESSION_DELTA_BYTES
    );
  });

  it('uses 0.05% of the baseline median when that exceeds 50 MiB', () => {
    const baselineMedianRssBytes = 200 * 1024 * 1024 * 1024;

    expect(getAllowedRegressionDeltaBytes(baselineMedianRssBytes)).toBe(
      baselineMedianRssBytes * 0.05
    );
  });

  it('supports the Max RSS threshold policy', () => {
    const baselineMedianRssBytes = 500 * 1024 * 1024;

    expect(
      getAllowedRegressionDeltaBytes(baselineMedianRssBytes, MAX_RSS_REGRESSION_THRESHOLD_POLICY)
    ).toBe(MIN_MAX_RSS_REGRESSION_DELTA_BYTES);
  });

  it('supports the Tail heap used threshold policy', () => {
    const baselineMedianHeapUsedBytes = 500 * 1024 * 1024;

    expect(
      getAllowedRegressionDeltaBytes(
        baselineMedianHeapUsedBytes,
        TAIL_HEAP_USED_REGRESSION_THRESHOLD_POLICY
      )
    ).toBe(MIN_TAIL_HEAP_USED_REGRESSION_DELTA_BYTES);
  });
});

describe('isMemoryRegression', () => {
  it('returns false when the target delta is within the allowed threshold', () => {
    const baselineMedianRssBytes = 2 * 1024 * 1024 * 1024;
    const allowedDeltaBytes = getAllowedRegressionDeltaBytes(baselineMedianRssBytes);

    expect(
      isMemoryRegression(baselineMedianRssBytes, baselineMedianRssBytes + allowedDeltaBytes - 1)
    ).toBe(false);
  });

  it('returns true when the target delta exceeds the allowed threshold', () => {
    const baselineMedianRssBytes = 2 * 1024 * 1024 * 1024;
    const allowedDeltaBytes = getAllowedRegressionDeltaBytes(baselineMedianRssBytes);

    expect(
      isMemoryRegression(baselineMedianRssBytes, baselineMedianRssBytes + allowedDeltaBytes + 1)
    ).toBe(true);
  });
});
