/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { escapeQuotes } from '@kbn/es-query';

export const CLIENT_DEFAULTS = {
  ABSOLUTE_DATE_RANGE_START: 0,
  // 15 minutes
  ABSOLUTE_DATE_RANGE_END: 1000 * 60 * 15,
  /**
   * The application auto refreshes every 60s by default.
   */
  AUTOREFRESH_INTERVAL: 60 * 1000,
  /**
   * The application's autorefresh feature is enabled.
   */
  AUTOREFRESH_IS_PAUSED: false,

  COMMONLY_USED_DATE_RANGES: [
    { start: 'now/d', end: 'now', label: 'Today' },
    { start: 'now/w', end: 'now', label: 'Week to date' },
    { start: 'now/M', end: 'now', label: 'Month to date' },
    { start: 'now/y', end: 'now', label: 'Year to date' },
  ],
  /**
   * The beginning of the default date range is 15m ago.
   */
  DATE_RANGE_START: 'now-15m',
  /**
   * The end of the default date range is now.
   */
  DATE_RANGE_END: 'now',
  FOCUS_CONNECTOR_FIELD: false,
  FILTERS: '',
  MONITOR_LIST_PAGE_INDEX: 0,
  MONITOR_LIST_PAGE_SIZE: 20,
  MONITOR_LIST_SORT_DIRECTION: 'asc',
  MONITOR_LIST_SORT_FIELD: 'monitor_id',
  SEARCH: '',
  STATUS_FILTER: '',
};

export const EXCLUDE_RUN_ONCE_FILTER = { bool: { must_not: { exists: { field: 'run_once' } } } };
export const FINAL_SUMMARY_FILTER = {
  bool: {
    filter: [
      {
        exists: {
          field: 'summary',
        },
      },
      {
        term: {
          'summary.final_attempt': true,
        },
      },
    ],
  },
};

export const getRangeFilter = ({ from, to }: { from: string; to: string }) => ({
  range: {
    '@timestamp': {
      gte: from,
      lte: to,
    },
  },
});

export const getTimespanFilter = ({ from, to }: { from: string; to: string }) => ({
  range: {
    'monitor.timespan': {
      gte: from,
      lte: to,
    },
  },
});

/**
 * All documents of a single Synthetics check run (summary, steps, screenshots,
 * network events) are written at essentially the same instant. Queries that
 * target a specific `monitor.check_group` therefore only need to look at a
 * narrow window around the run's `@timestamp`.
 *
 * Bounding such queries lets Elasticsearch prune shards during the `can_match`
 * phase — including slow, throttled frozen-tier searchable snapshots — instead
 * of fanning out across every backing index. The buffer is intentionally far
 * larger than any realistic journey duration so it can never drop a run's
 * documents.
 */
export const CHECK_GROUP_TIME_RANGE_BUFFER_MS = 60 * 60 * 1000; // 1 hour

export const getCheckGroupTimeRangeFilter = (timestamp: string): QueryDslQueryContainer => {
  const runTime = new Date(timestamp).getTime();
  if (Number.isNaN(runTime)) {
    // These routes are client-callable and validate `timestamp` only by length,
    // so an unparseable value would make the `toISOString()` calls below throw a
    // RangeError (HTTP 500). Fall back to no bound instead of crashing.
    return { match_all: {} };
  }
  return {
    range: {
      '@timestamp': {
        gte: new Date(runTime - CHECK_GROUP_TIME_RANGE_BUFFER_MS).toISOString(),
        lte: new Date(runTime + CHECK_GROUP_TIME_RANGE_BUFFER_MS).toISOString(),
      },
    },
  };
};

export const SUMMARY_FILTER = { exists: { field: 'summary' } };

export const getLocationFilter = ({
  locationName,
  locationId,
}: {
  locationName: string;
  locationId: string;
}) => ({
  minimum_should_match: 1,
  should: [
    {
      term: {
        'observer.name': locationId,
      },
    },
    {
      term: {
        'observer.geo.name': locationName,
      },
    },
  ],
});

export const getTimeSpanFilter = () => ({
  range: {
    'monitor.timespan': {
      lte: moment().toISOString(),
      gte: moment().subtract(20, 'minutes').toISOString(),
    },
  },
});

export const getQueryFilters = (query: string) => ({
  query_string: {
    query: `"${escapeQuotes(query)}"`,
    // Free-text fields the search box should match against. Status codes
    // are filtered precisely via a separate `terms` query on
    // `http.response.status_code` (driven by the status-code chips in the
    // Error Insights panel) so we deliberately do NOT include it here:
    // searching for "200" in this multi-field query string would also
    // match e.g. URL ports or substrings of other ids.
    fields: [
      'monitor.name.text',
      'tags',
      'observer.geo.name',
      'observer.name',
      'urls',
      'hosts',
      'monitor.project.id',
      'error.message',
      'url.domain',
    ],
  },
});
