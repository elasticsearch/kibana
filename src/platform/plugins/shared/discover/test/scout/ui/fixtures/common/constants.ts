/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Standard `kbn_archiver/discover` archive. Loads the `logstash-*` data view
 * and the other saved objects most Discover specs rely on.
 */
export const DISCOVER_KBN_ARCHIVE = 'src/platform/test/functional/fixtures/kbn_archiver/discover';

export const DEFAULT_DATA_VIEW = 'logstash-*';

export const SAVED_SEARCH_TITLE = 'A Saved Search';

/**
 * Default time range that covers the `logstash_functional` fixture data.
 * Matches the FTR `timePicker.setDefaultAbsoluteRangeViaUiSettings()` values.
 *
 * ISO format, for the `uiSettings.setDefaultTime()` API. The date-picker UI
 * (`datePicker.setAbsoluteRange()`) needs the same instants in the picker's
 * display format instead, see {@link DEFAULT_TIME_RANGE_DISPLAY}.
 */
export const DEFAULT_TIME_RANGE = {
  from: '2015-09-19T06:31:44.000Z',
  to: '2015-09-23T18:31:44.000Z',
};

/**
 * {@link DEFAULT_TIME_RANGE} expressed in the date-picker display format, for
 * driving the time-picker UI (e.g. resetting a tab's range via the picker).
 */
export const DEFAULT_TIME_RANGE_DISPLAY = {
  from: 'Sep 19, 2015 @ 06:31:44.000',
  to: 'Sep 23, 2015 @ 18:31:44.000',
};

export const DEFAULT_ROWS_PER_PAGE = 100;

export const DEFAULT_SAMPLE_SIZE = 500;
