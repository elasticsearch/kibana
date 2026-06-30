/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildSignalFiringsHistogramQuery,
  buildSignalFiringsSummaryQuery,
} from './signal_firings_histogram_query';

const RULE_ID = 'rule-1';
const GTE = Date.parse('2026-06-01T00:00:00.000Z');
const LTE = Date.parse('2026-06-02T00:00:00.000Z');

describe('buildSignalFiringsHistogramQuery', () => {
  const print = (interval: string) =>
    buildSignalFiringsHistogramQuery({ ruleId: RULE_ID, gteMs: GTE, lteMs: LTE, interval }).print(
      'basic'
    );

  it('filters to signal firings for the rule within the window', () => {
    const q = print('1h');
    expect(q).toContain('FROM .rule-events');
    expect(q).toContain('type == "signal"');
    expect(q).toContain('rule.id == "rule-1"');
    expect(q).toContain('"2026-06-01T00:00:00.000Z"::DATETIME');
    expect(q).toContain('"2026-06-02T00:00:00.000Z"::DATETIME');
  });

  it('buckets by COUNT and sorts ascending', () => {
    const q = print('1h');
    expect(q).toContain('STATS count = COUNT(*) BY');
    expect(q).toContain('BUCKET(@timestamp, 1 hour)');
    expect(q).toMatch(/SORT `?ts`? ASC/);
  });

  it('maps each interval to its ES|QL span literal (not a quoted string)', () => {
    expect(print('1m')).toContain('BUCKET(@timestamp, 1 minute)');
    expect(print('6h')).toContain('BUCKET(@timestamp, 6 hours)');
    expect(print('1d')).toContain('BUCKET(@timestamp, 1 day)');
    expect(print('1w')).toContain('BUCKET(@timestamp, 1 week)');
    // Guard against the duration accidentally becoming a string parameter.
    expect(print('6h')).not.toContain('"6 hours"');
  });

  it('falls back to an hourly span for an unknown interval', () => {
    expect(print('bogus')).toContain('BUCKET(@timestamp, 1 hour)');
  });
});

describe('buildSignalFiringsSummaryQuery', () => {
  it('aggregates the most recent firing timestamp', () => {
    const q = buildSignalFiringsSummaryQuery({ ruleId: RULE_ID, gteMs: GTE, lteMs: LTE }).print(
      'basic'
    );
    expect(q).toContain('type == "signal"');
    expect(q).toContain('rule.id == "rule-1"');
    expect(q).toContain('STATS last_firing = MAX(@timestamp)');
  });
});
