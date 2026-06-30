/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const CLIENT_DEFAULTS_SYNTHETICS = {
  /**
   * The beginning of the default date range is 24h ago.
   */
  DATE_RANGE_START: 'now-24h',
  /**
   * The end of the default date range is now.
   */
  DATE_RANGE_END: 'now',

  /**
   * The overview's default status window. Narrower than the app-wide
   * `DATE_RANGE_START` (now-24h): the overview only needs each monitor's latest
   * run (max schedule is 4h), so a wider window scans far more data for ~no
   * extra coverage (~24h ≈ 2x the ES cost of 12h with identical results).
   */
  OVERVIEW_DATE_RANGE_START: 'now-12h',

  /**
   * The application auto refreshes every 60s by default.
   */
  AUTOREFRESH_INTERVAL_SECONDS: 60,
  /**
   * The application's autorefresh feature is disabled by default.
   */
  AUTOREFRESH_IS_PAUSED: true,
};
