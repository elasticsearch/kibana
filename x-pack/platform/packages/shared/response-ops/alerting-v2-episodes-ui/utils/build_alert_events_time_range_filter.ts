/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Filter, TimeRange } from '@kbn/es-query';
import { getTime } from '@kbn/data-plugin/common';
import { DEFAULT_TIME_FIELD } from '@kbn/alerting-v2-constants';

/**
 * Builds the time picker filter for the episode queries. The range only applies
 * to the alert events: it decides which episodes show up, and it keeps the scan
 * over `.rule-events` bounded. The action documents pass regardless of their
 * timestamp, so the last tag, ack, assignee and snooze of an episode are found
 * even when they predate the range. A plain range filter on both streams dropped
 * them and left those columns empty on short ranges.
 *
 * The filter is sent with the request and applied by ES at the source, like the
 * one the `esql` expression derives from `timeField`, so it stays pushed down.
 * Returns `undefined` when there is no range to apply.
 */
export const buildAlertEventsTimeRangeFilter = (
  timeRange?: TimeRange | null
): Filter | undefined => {
  const rangeFilter = timeRange
    ? getTime(undefined, timeRange, { fieldName: DEFAULT_TIME_FIELD })
    : undefined;
  if (!rangeFilter) {
    return undefined;
  }
  return {
    meta: { alias: null, disabled: false, negate: false },
    query: {
      bool: {
        should: [
          { bool: { filter: [{ term: { type: 'alert' } }, rangeFilter.query] } },
          { exists: { field: 'action_type' } },
        ],
        minimum_should_match: 1,
      },
    },
  };
};
