/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment';
import type { TimeBucketsInterval } from '../buckets/lib/time_buckets/time_buckets';
import { UI_SETTINGS } from '../../../constants';
import type { TimeRange } from '../../../query';
import { TimeBuckets } from '../buckets/lib/time_buckets';
import { toAbsoluteDates } from './date_interval_utils';
import { autoInterval } from '../buckets/_interval_options';

export function getCalculateAutoTimeExpression(getConfig: (key: string) => unknown) {
  const getNumberConfig = (key: string): number => {
    const value = getConfig(key);
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    throw new Error(`Expected a numeric value for config key "${key}", got ${typeof value}`);
  };
  const getStringConfig = (key: string): string => {
    const value = getConfig(key);
    if (typeof value === 'string') {
      return value;
    }
    if (value == null) {
      return '';
    }
    return String(value);
  };
  const getScaledDateFormatsConfig = (key: string): string[][] => {
    const value = getConfig(key);
    return Array.isArray(value) ? (value as string[][]) : [];
  };
  function calculateAutoTimeExpression(range: TimeRange): string | undefined;
  function calculateAutoTimeExpression(
    range: TimeRange,
    interval: string,
    asExpression?: true
  ): string | undefined;
  function calculateAutoTimeExpression(
    range: TimeRange,
    interval: string,
    asExpression: false
  ): TimeBucketsInterval | undefined;
  function calculateAutoTimeExpression(
    range: TimeRange,
    interval?: string,
    asExpression?: boolean
  ): string | TimeBucketsInterval | undefined;

  function calculateAutoTimeExpression(
    range: TimeRange,
    interval: string = autoInterval,
    asExpression: boolean = true
  ): string | TimeBucketsInterval | undefined {
    const dates = toAbsoluteDates(range);
    if (!dates) {
      return;
    }

    const buckets = new TimeBuckets({
      'histogram:maxBars': getNumberConfig(UI_SETTINGS.HISTOGRAM_MAX_BARS),
      'histogram:barTarget': getNumberConfig(UI_SETTINGS.HISTOGRAM_BAR_TARGET),
      dateFormat: getStringConfig('dateFormat'),
      'dateFormat:scaled': getScaledDateFormatsConfig('dateFormat:scaled'),
    });

    buckets.setInterval(interval);
    buckets.setBounds({
      min: moment(dates.from),
      max: moment(dates.to),
    });

    const intervalResult = buckets.getInterval();
    if (asExpression) {
      return intervalResult.expression;
    }
    return intervalResult;
  }

  return calculateAutoTimeExpression;
}
