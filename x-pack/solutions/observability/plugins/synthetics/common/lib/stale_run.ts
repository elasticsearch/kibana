/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';

// A monitor/location whose most recent run is older than ~2 schedule intervals
// — with a 15-minute floor — has effectively stopped reporting and its last
// status can no longer be trusted as current, so it is surfaced as `stale`
// rather than its last-known up/down. Shared by the server (live-window
// freshness guard) and the client (promoting `pending` monitors whose last run
// happened before the window) so the threshold can't drift between the two.
export const STALE_FRESHNESS_FLOOR_MINUTES = 15;

export const isRunStale = (
  timestamp: string | undefined,
  scheduleMinutes: number,
  now: moment.MomentInput = undefined
): boolean => {
  if (!timestamp) {
    return false;
  }
  const thresholdMinutes = Math.max(scheduleMinutes * 2, STALE_FRESHNESS_FLOOR_MINUTES);
  const reference = now ? moment(now) : moment();
  return reference.diff(moment(timestamp), 'minutes') > thresholdMinutes;
};
