/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import { ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-episodes-ui/constants';
import { ALERT_TIMELINE_TOP_N_DEFAULT } from '@kbn/alerting-v2-episodes-ui/alert_timeline';

export interface TopNSeriesRow {
  group_hash: string;
}

export interface BuildTopNSeriesQueryOptions {
  ruleId: string;
  windowStartMs: number;
  windowEndMs: number;
}

const toIsoUtc = (ms: number) => new Date(ms).toISOString();

/**
 * Returns the `group_hash`es of the most-recently-active series in the window,
 * capped to the number of lanes the chart renders
 * (`SORT last_event_ts DESC | LIMIT ALERT_TIMELINE_TOP_N_DEFAULT`) — there's no
 * value in pulling more series than are shown.
 */
export const buildTopNSeriesQuery = ({
  ruleId,
  windowStartMs,
  windowEndMs,
}: BuildTopNSeriesQueryOptions) => {
  const fromIso = toIsoUtc(windowStartMs);
  const toIso = toIsoUtc(windowEndMs);

  return esql.from(ALERT_EVENTS_DATA_STREAM).where`type == "alert"`.where`rule.id == ${ruleId}`
    .where`@timestamp >= ${fromIso}::DATETIME AND @timestamp <= ${toIso}::DATETIME`
    .pipe`STATS last_event_ts = MAX(@timestamp) BY group_hash`
    .sort(['last_event_ts', 'DESC'])
    .limit(ALERT_TIMELINE_TOP_N_DEFAULT)
    .keep('group_hash');
};
