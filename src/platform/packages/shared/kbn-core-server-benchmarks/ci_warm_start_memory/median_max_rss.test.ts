/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getMedianMaxRssBytes, getMedianTailRssBytes, median } from './median_max_rss';
import { makeWarmStartMemoryCompareContext } from './test_helpers';

describe('median', () => {
  it('returns the middle value for odd-length arrays', () => {
    expect(median([300, 100, 200])).toBe(200);
  });

  it('returns the average of the two middle values for even-length arrays', () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });
});

describe('getMedianMaxRssBytes', () => {
  it('computes the median Max RSS from warm-start benchmark summary values', () => {
    const context = makeWarmStartMemoryCompareContext({
      baselineMaxRssValues: [100, 300, 200],
      targetMaxRssValues: [400, 500, 600],
    });

    expect(getMedianMaxRssBytes(context.leftSummary)).toBe(200);
    expect(getMedianMaxRssBytes(context.rightSummary)).toBe(500);
  });
});

describe('getMedianTailRssBytes', () => {
  it('computes the median Tail RSS from warm-start benchmark summary values', () => {
    const context = makeWarmStartMemoryCompareContext({
      baselineMaxRssValues: [1000, 1000, 1000],
      baselineTailRssValues: [100, 300, 200],
      targetMaxRssValues: [1000, 1000, 1000],
      targetTailRssValues: [400, 500, 600],
    });

    expect(getMedianTailRssBytes(context.leftSummary)).toBe(200);
    expect(getMedianTailRssBytes(context.rightSummary)).toBe(500);
  });
});
