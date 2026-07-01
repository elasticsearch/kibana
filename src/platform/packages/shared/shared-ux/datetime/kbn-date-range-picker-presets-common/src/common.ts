/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const DATE_RANGE_PICKER_PRESETS_KEY = 'data:dateRangePicker:presets';
export const MAX_PRESETS = 40;

export interface PresetItem {
  start: string;
  end: string;
  label?: string;
}

export interface StoredPresetsV1 {
  version: 1;
  presets: PresetItem[] | null;
}

export type StoredPresets = StoredPresetsV1;

export const DEFAULT_STORED_PRESETS: StoredPresets = {
  version: 1,
  presets: null,
};

export const normalize = (storedPresets?: StoredPresets): StoredPresets => {
  if (storedPresets?.version === 1) {
    return storedPresets;
  }

  return DEFAULT_STORED_PRESETS;
};
