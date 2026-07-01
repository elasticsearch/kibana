/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DurationInputUnitDsl, DurationOutputUnit } from '../../schema/duration_units';
import {
  LENS_DURATION_API_INPUT_UNIT_DEFAULT,
  LENS_DURATION_API_OUTPUT_UNIT_DEFAULT,
} from '../../schema/constants';
import { getReversibleMappings } from '../charts/utils';

const inputCompat = getReversibleMappings<DurationInputUnitDsl, string>([
  ['ps', 'picoseconds'],
  ['ns', 'nanoseconds'],
  ['us', 'microseconds'],
  ['ms', 'milliseconds'],
  ['s', 'seconds'],
  ['m', 'minutes'],
  ['h', 'hours'],
  ['d', 'days'],
  ['w', 'weeks'],
  ['mo', 'months'],
  ['y', 'years'],
]);

const outputCompat = getReversibleMappings<DurationOutputUnit, string>([
  ['humanize', 'humanize'],
  ['humanizePrecise', 'humanizePrecise'],
  ['ms', 'asMilliseconds'],
  ['s', 'asSeconds'],
  ['m', 'asMinutes'],
  ['h', 'asHours'],
  ['d', 'asDays'],
  ['w', 'asWeeks'],
  ['mo', 'asMonths'],
  ['y', 'asYears'],
]);

export const durationInputUnitCompat = {
  toState: (unit: DurationInputUnitDsl) => inputCompat.toState(unit)!,
  toAPI: (unit?: string) => inputCompat.toAPI(unit) ?? LENS_DURATION_API_INPUT_UNIT_DEFAULT,
};

export const durationOutputUnitCompat = {
  toState: (unit: DurationOutputUnit) => outputCompat.toState(unit)!,
  toAPI: (unit?: string) => outputCompat.toAPI(unit) ?? LENS_DURATION_API_OUTPUT_UNIT_DEFAULT,
};
