/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  DATE_RANGE_PICKER_PRESETS_KEY,
  DEFAULT_STORED_PRESETS,
  MAX_PRESETS,
} from '@kbn/date-range-picker-presets-common';
import {
  dateRangePickerPresetsStorageDefinition,
  dateRangePickerPresetsUserStorageRegistration,
} from './date_range_picker_presets';

describe('date range picker presets userStorage registration', () => {
  it('registers the expected key with a space-scoped lazy definition', () => {
    expect(dateRangePickerPresetsUserStorageRegistration).toEqual({
      [DATE_RANGE_PICKER_PRESETS_KEY]: dateRangePickerPresetsStorageDefinition,
    });
    expect(dateRangePickerPresetsStorageDefinition.defaultValue).toEqual(DEFAULT_STORED_PRESETS);
    expect(dateRangePickerPresetsStorageDefinition.scope).toBe('space');
    expect(dateRangePickerPresetsStorageDefinition.preload).toBe(false);
  });

  it('accepts the unseeded default value', () => {
    expect(
      dateRangePickerPresetsStorageDefinition.schema.safeParse(DEFAULT_STORED_PRESETS).success
    ).toBe(true);
  });

  it('rejects preset lists over the cap', () => {
    const oversize = {
      version: 1 as const,
      presets: Array.from({ length: MAX_PRESETS + 1 }, (_, i) => ({
        start: `now-${i}d`,
        end: 'now',
      })),
    };

    expect(dateRangePickerPresetsStorageDefinition.schema.safeParse(oversize).success).toBe(false);
  });
});
