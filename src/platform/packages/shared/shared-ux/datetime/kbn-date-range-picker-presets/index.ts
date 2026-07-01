/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export {
  DATE_RANGE_PICKER_PRESETS_KEY,
  DEFAULT_STORED_PRESETS,
  MAX_PRESETS,
  normalize,
} from '@kbn/date-range-picker-presets-common';
export type {
  PresetItem,
  StoredPresets,
  StoredPresetsV1,
} from '@kbn/date-range-picker-presets-common';
export { mapQuickRanges } from './src/quick_ranges';
export type { QuickRange } from './src/quick_ranges';
export { useDateRangePickerPresets } from './src/use_date_range_picker_presets';
export type {
  UseDateRangePickerPresetsArgs,
  UseDateRangePickerPresetsResult,
} from './src/use_date_range_picker_presets';
