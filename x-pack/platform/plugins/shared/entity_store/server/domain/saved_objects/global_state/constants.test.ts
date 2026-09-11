/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LogExtractionOverride, LogExtractionTypeOverride } from './constants';

describe('LogExtractionTypeOverride', () => {
  it('accepts an empty object (no fields set)', () => {
    expect(LogExtractionTypeOverride.safeParse({}).success).toBe(true);
  });

  it('accepts a single field', () => {
    expect(LogExtractionTypeOverride.safeParse({ frequency: '10m' }).success).toBe(true);
  });

  it('accepts null for a cleared field', () => {
    expect(LogExtractionTypeOverride.safeParse({ frequency: null, delay: null }).success).toBe(
      true
    );
  });

  it('accepts all overridable fields at once', () => {
    expect(
      LogExtractionTypeOverride.safeParse({
        additionalIndexPatterns: ['logs-custom-*'],
        excludedIndexPatterns: ['logs-noisy-*'],
        lookbackPeriod: '6h',
        delay: '2m',
        docsLimit: 5000,
        maxLogsPerPage: 25000,
        frequency: '10m',
        maxTimeWindowSize: '30m',
        maxLogsPerWindow: 1000000,
        maxLogsPerWindowCapBehavior: 'defer',
      }).success
    ).toBe(true);
  });

  it('strips timeout — it is not overridable at the per-type level', () => {
    const result = LogExtractionTypeOverride.safeParse({ timeout: '59s' });
    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty('timeout');
  });

  it('strips fieldHistoryLength — it is not overridable at the per-type level', () => {
    const result = LogExtractionTypeOverride.safeParse({ fieldHistoryLength: 10 });
    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty('fieldHistoryLength');
  });

  it('rejects a wrongly typed value', () => {
    expect(LogExtractionTypeOverride.safeParse({ docsLimit: 'not-a-number' }).success).toBe(false);
  });
});

describe('LogExtractionOverride', () => {
  it('accepts fieldHistoryLength, unlike LogExtractionTypeOverride', () => {
    expect(LogExtractionOverride.safeParse({ fieldHistoryLength: 10 }).success).toBe(true);
  });

  it('accepts null for fieldHistoryLength to clear it', () => {
    expect(LogExtractionOverride.safeParse({ fieldHistoryLength: null }).success).toBe(true);
  });

  it('strips timeout — it is not settable over HTTP', () => {
    const result = LogExtractionOverride.safeParse({ timeout: '59s' });
    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty('timeout');
  });

  it('accepts an empty object', () => {
    expect(LogExtractionOverride.safeParse({}).success).toBe(true);
  });
});
