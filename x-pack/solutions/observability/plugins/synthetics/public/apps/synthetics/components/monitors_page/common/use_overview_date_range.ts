/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useLocation } from 'react-router-dom';
import { parse } from 'query-string';
import { useAbsoluteDate } from '../../../hooks';
import { CLIENT_DEFAULTS_SYNTHETICS } from '../../../../../../common/constants/synthetics/client_defaults';

const { OVERVIEW_DATE_RANGE_START, DATE_RANGE_END } = CLIENT_DEFAULTS_SYNTHETICS;

const firstValue = (value: string | string[] | null): string | undefined =>
  (Array.isArray(value) ? value[0] : value) ?? undefined;

/**
 * The overview's date range, read straight from the raw URL.
 *
 * Reading the raw URL (rather than `useGetUrlParams`, which injects the app-wide
 * `now-24h`) lets an absent range fall back to the overview's own, narrower
 * default window — keeping the picker, status query, and the errors/alerts
 * panels on a single source of truth.
 */
export function useOverviewDateRange() {
  const { search } = useLocation();
  const params = parse(search[0] === '?' ? search.slice(1) : search);

  return {
    dateRangeStart: firstValue(params.dateRangeStart) || OVERVIEW_DATE_RANGE_START,
    dateRangeEnd: firstValue(params.dateRangeEnd) || DATE_RANGE_END,
  };
}

/**
 * Refreshing absolute (ISO) bounds for panels that need them (errors/alerts).
 * Re-parses on each app refresh via `useAbsoluteDate`.
 */
export function useOverviewRefreshedRange() {
  const { dateRangeStart, dateRangeEnd } = useOverviewDateRange();
  return useAbsoluteDate({ from: dateRangeStart, to: dateRangeEnd });
}
