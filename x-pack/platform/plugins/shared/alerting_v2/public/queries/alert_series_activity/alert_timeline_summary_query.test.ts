/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildAlertTimelineSummaryQuery,
  parseAlertTimelineSummaryRow,
  type AlertTimelineSummaryEsqlRow,
} from './alert_timeline_summary_query';

const RULE_ID = 'rule-abc';
const WINDOW_START_MS = Date.parse('2026-04-01T00:00:00Z');
const WINDOW_END_MS = Date.parse('2026-04-08T00:00:00Z');

describe('buildAlertTimelineSummaryQuery', () => {
  const queryString = buildAlertTimelineSummaryQuery({
    ruleId: RULE_ID,
    windowStartMs: WINDOW_START_MS,
    windowEndMs: WINDOW_END_MS,
  }).print('basic');

  it('scopes to alert type and the given rule id', () => {
    expect(queryString).toContain('type == "alert"');
    expect(queryString).toContain('rule.id');
    expect(queryString).toContain(RULE_ID);
  });

  it('scopes to the given time window', () => {
    expect(queryString).toContain('2026-04-01T00:00:00.000Z');
    expect(queryString).toContain('2026-04-08T00:00:00.000Z');
  });

  it('aggregates episodes_started and recovered', () => {
    expect(queryString).toContain('episodes_started = COUNT(*)');
    expect(queryString).toContain('recovered = SUM(is_recovered_int)');
  });

  it('computes still_open as episodes_started minus recovered', () => {
    expect(queryString).toContain('still_open = episodes_started - recovered');
  });

  it('computes median duration only for recovered episodes', () => {
    expect(queryString).toContain('CASE(last_status == "inactive", duration_ms, NULL)');
    expect(queryString).toContain('PERCENTILE(recovered_duration_ms, 50)');
  });

  it('keeps only the four summary fields', () => {
    expect(queryString).toContain('episodes_started');
    expect(queryString).toContain('recovered');
    expect(queryString).toContain('still_open');
    expect(queryString).toContain('median_duration_ms');
  });
});

describe('parseAlertTimelineSummaryRow', () => {
  it('maps a full row to the AlertTimelineSummary shape', () => {
    const row: AlertTimelineSummaryEsqlRow = {
      episodes_started: 10,
      recovered: 7,
      still_open: 3,
      median_duration_ms: 120_000,
    };

    expect(parseAlertTimelineSummaryRow(row)).toEqual({
      episodesStarted: 10,
      recovered: 7,
      stillOpen: 3,
      medianDurationMs: 120_000,
    });
  });

  it('returns zeroed defaults when the row is undefined', () => {
    expect(parseAlertTimelineSummaryRow(undefined)).toEqual({
      episodesStarted: 0,
      recovered: 0,
      stillOpen: 0,
      medianDurationMs: 0,
    });
  });

  it('coerces null median_duration_ms to 0', () => {
    const row: AlertTimelineSummaryEsqlRow = {
      episodes_started: 1,
      recovered: 0,
      still_open: 1,
      median_duration_ms: null,
    };

    expect(parseAlertTimelineSummaryRow(row).medianDurationMs).toBe(0);
  });
});
