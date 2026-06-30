/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import datemath from '@kbn/datemath';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Default activity window shared by the alert and signal rule overviews. */
export const DEFAULT_ACTIVITY_TIME_RANGE = { from: 'now-7d', to: 'now' };

/**
 * Resolves a datemath time range to absolute epoch-ms bounds, falling back to a
 * 7-day window when either bound cannot be parsed.
 */
export const resolveGteLte = (
  from: string,
  to: string
): { windowStartMs: number; windowEndMs: number } => {
  const fromMs = datemath.parse(from)?.valueOf();
  const toMs = datemath.parse(to, { roundUp: true })?.valueOf();
  const now = Date.now();
  return {
    windowStartMs: Number.isFinite(fromMs) ? (fromMs as number) : now - 7 * DAY_MS,
    windowEndMs: Number.isFinite(toMs) ? (toMs as number) : now,
  };
};
