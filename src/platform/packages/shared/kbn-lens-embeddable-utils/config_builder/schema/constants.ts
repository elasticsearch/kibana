/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// @TODO: move it to shared type/values package
export const LENS_HISTOGRAM_GRANULARITY_DEFAULT_NUMERIC_VALUE = 5;
export const LENS_HISTOGRAM_GRANULARITY_MIN = 1;
export const LENS_HISTOGRAM_GRANULARITY_MAX = 7;
export const LENS_HISTOGRAM_GRANULARITY_DEFAULT_VALUE = 'auto';
export const LENS_HISTOGRAM_EMPTY_ROWS_DEFAULT = true;

export const LENS_TERMS_LIMIT_DEFAULT = 5;
export const LENS_TERMS_MISSING_BUCKET_DEFAULT = false;

export const LENS_FORMAT_NUMBER_DECIMALS_DEFAULT = 2;
export const LENS_FORMAT_COMPACT_DEFAULT = false;

/** Default source unit in Lens as code API (`from`). */
export const LENS_DURATION_API_INPUT_UNIT_DEFAULT = 's';
/** Default display unit in Lens as code API (`to`). */
export const LENS_DURATION_API_OUTPUT_UNIT_DEFAULT = 'humanize';

export const LENS_SAMPLING_MIN_VALUE = 0;
export const LENS_SAMPLING_MAX_VALUE = 1;
export const LENS_SAMPLING_DEFAULT_VALUE = 1;
export const LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE = false;

export const LENS_PERCENTILE_DEFAULT_VALUE = 95;
export const LENS_PERCENTILE_RANK_DEFAULT_VALUE = 0;
export const LENS_DATE_HISTOGRAM_EMPTY_ROWS_DEFAULT = true;
export const LENS_DATE_HISTOGRAM_INTERVAL_DEFAULT = 'auto';
export const LENS_DATE_HISTOGRAM_IGNORE_TIME_RANGE_DEFAULT = false;

export const LENS_STATIC_VALUE_DEFAULT = 100;
export const LENS_LAST_VALUE_DEFAULT_MULTI_VALUE = false;
export const LENS_RANGE_DEFAULT_INTERVAL = 1000;
export const LENS_MOVING_AVERAGE_DEFAULT_WINDOW = 5;
