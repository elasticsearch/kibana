/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import { ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-episodes-ui/constants';

/** A single firing-frequency histogram bucket returned by the ES|QL query. */
export interface SignalFiringsBucketRow {
  ts: string;
  count: number;
}

/** Single-row aggregate carrying the exact timestamp of the most recent firing. */
export interface SignalFiringsSummaryRow {
  last_firing: string | null;
}

/**
 * Bucket intervals produced by `computeBucketInterval`, mapped to their ES|QL
 * time-duration span literals. A closed set, so the literal can be injected
 * directly into the query (no injection surface).
 */
export const BUCKET_INTERVAL_TO_ESQL_SPAN: Record<string, string> = {
  '1m': '1 minute',
  '1h': '1 hour',
  '6h': '6 hours',
  '1d': '1 day',
  '1w': '1 week',
};

const DEFAULT_ESQL_SPAN = '1 hour';

export interface BuildSignalFiringsQueryOptions {
  ruleId: string;
  gteMs: number;
  lteMs: number;
  /** Bucket interval from `computeBucketInterval` (e.g. `'1h'`). */
  interval: string;
}

export interface BuildSignalFiringsSummaryQueryOptions {
  ruleId: string;
  gteMs: number;
  lteMs: number;
}

const toIsoUtc = (ms: number) => new Date(ms).toISOString();

/**
 * Firing-frequency histogram: counts signal-rule firings into time buckets.
 * Signal firings are point events (`type == "signal"`), so a plain
 * `COUNT(*) BY BUCKET(...)` is exact — no overlap counting needed.
 */
export const buildSignalFiringsHistogramQuery = ({
  ruleId,
  gteMs,
  lteMs,
  interval,
}: BuildSignalFiringsQueryOptions) => {
  const fromIso = toIsoUtc(gteMs);
  const toIso = toIsoUtc(lteMs);
  // The span is a time-duration *literal*, not a bindable value. Use the
  // string-call form of `exp` so the source is parsed into a duration literal
  // (`BUCKET(@timestamp, 1 hour)`); the tagged-template form would interpolate
  // it as a quoted string param instead.
  const span = esql.exp(BUCKET_INTERVAL_TO_ESQL_SPAN[interval] ?? DEFAULT_ESQL_SPAN);

  // prettier-ignore
  return esql.from(ALERT_EVENTS_DATA_STREAM)
    .where`type == "signal"`
    .where`rule.id == ${ruleId}`
    .where`@timestamp >= ${fromIso}::DATETIME AND @timestamp <= ${toIso}::DATETIME`
    .pipe`STATS count = COUNT(*) BY ts = BUCKET(@timestamp, ${span})`
    .sort(['ts', 'ASC']);
};

/**
 * Exact timestamp of the most recent firing in the window. Kept separate from
 * the bucketed query because a bucket boundary would be off by up to a bucket
 * width on coarse windows.
 */
export const buildSignalFiringsSummaryQuery = ({
  ruleId,
  gteMs,
  lteMs,
}: BuildSignalFiringsSummaryQueryOptions) => {
  const fromIso = toIsoUtc(gteMs);
  const toIso = toIsoUtc(lteMs);

  // prettier-ignore
  return esql.from(ALERT_EVENTS_DATA_STREAM)
    .where`type == "signal"`
    .where`rule.id == ${ruleId}`
    .where`@timestamp >= ${fromIso}::DATETIME AND @timestamp <= ${toIso}::DATETIME`
    .pipe`STATS last_firing = MAX(@timestamp)`;
};
