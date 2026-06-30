/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { Location } from '@kbn/esql-language';

export const aliasTable: Record<string, string[]> = {
  to_version: ['to_ver'],
  to_unsigned_long: ['to_ul', 'to_ulong'],
  to_boolean: ['to_bool'],
  to_string: ['to_str'],
  to_datetime: ['to_dt'],
  to_double: ['to_dbl'],
  to_integer: ['to_int'],
};

export const aliases = new Set(Object.values(aliasTable).flat());
// --- Locations ---
export const defaultScalarFunctionLocations: Location[] = [
  Location.EVAL,
  Location.ROW,
  Location.SORT,
  Location.WHERE,
  Location.STATS,
  Location.STATS_BY,
  Location.LIMIT_BY,
  Location.CHANGE_POINT_BY,
  Location.STATS_WHERE,
  Location.STATS_TIMESERIES,
  Location.COMPLETION,
  Location.MMR,
  Location.RERANK,
  Location.JOIN,
];

export const defaultAggFunctionLocations: Location[] = [Location.STATS];

// --- Dates ---
export const dateDiffSuggestions = [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
  'millisecond',
  'microsecond',
  'nanosecond',
];

export const dateExtractOptions = [
  'ALIGNED_DAY_OF_WEEK_IN_MONTH',
  'ALIGNED_DAY_OF_WEEK_IN_YEAR',
  'ALIGNED_WEEK_OF_MONTH',
  'ALIGNED_WEEK_OF_YEAR',
  'AMPM_OF_DAY',
  'CLOCK_HOUR_OF_AMPM',
  'CLOCK_HOUR_OF_DAY',
  'DAY_OF_MONTH',
  'DAY_OF_WEEK',
  'DAY_OF_YEAR',
  'EPOCH_DAY',
  'ERA',
  'HOUR_OF_AMPM',
  'HOUR_OF_DAY',
  'INSTANT_SECONDS',
  'MICRO_OF_DAY',
  'MICRO_OF_SECOND',
  'MILLI_OF_DAY',
  'MILLI_OF_SECOND',
  'MINUTE_OF_DAY',
  'MINUTE_OF_HOUR',
  'MONTH_OF_YEAR',
  'NANO_OF_DAY',
  'NANO_OF_SECOND',
  'OFFSET_SECONDS',
  'PROLEPTIC_MONTH',
  'SECOND_OF_DAY',
  'SECOND_OF_MINUTE',
  'YEAR',
  'YEAR_OF_ERA',
];

// --- Operators ---
export const MATH_OPERATORS = ['add', 'sub', 'div', 'mod', 'mul'];

export const COMPARISON_OPERATORS = [
  'equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'not_equals',
];

export const mathOperatorsExtraSignatures = [
  {
    params: [
      { name: 'left', type: 'time_duration' as const },
      { name: 'right', type: 'date' as const },
    ],
    returnType: 'date' as const,
  },
  {
    params: [
      { name: 'left', type: 'date' as const },
      { name: 'right', type: 'time_duration' as const },
    ],
    returnType: 'date' as const,
  },
];

const constantHint = { kind: 'constant' as const };

export const comparisonOperatorSignatures = (['ip', 'version'] as const).flatMap((type) => [
  {
    params: [
      { name: 'left', type },
      { name: 'right', type: 'text' as const, hint: constantHint },
    ],
    returnType: 'boolean' as const,
  },
  {
    params: [
      { name: 'left', type: 'text' as const, hint: constantHint },
      { name: 'right', type },
    ],
    returnType: 'boolean' as const,
  },
]);
