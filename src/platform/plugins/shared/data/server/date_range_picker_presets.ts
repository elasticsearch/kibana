/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z, type ZodType } from '@kbn/zod/v4';
import type { UserStorageDefinition } from '@kbn/core-user-storage-common';
import {
  DATE_RANGE_PICKER_PRESETS_KEY,
  DEFAULT_STORED_PRESETS,
  MAX_PRESETS,
  type StoredPresets,
} from '@kbn/date-range-picker-presets-common';

const presetItemSchema = z.object({
  start: z.string(),
  end: z.string(),
  label: z.string().optional(),
});

const storedPresetsSchema: ZodType<StoredPresets> = z.object({
  version: z.literal(1),
  presets: z.array(presetItemSchema).max(MAX_PRESETS).nullable(),
});

export const dateRangePickerPresetsStorageDefinition: UserStorageDefinition<StoredPresets> = {
  schema: storedPresetsSchema,
  defaultValue: DEFAULT_STORED_PRESETS,
  scope: 'space',
  preload: false,
};

export const dateRangePickerPresetsUserStorageRegistration = {
  [DATE_RANGE_PICKER_PRESETS_KEY]: dateRangePickerPresetsStorageDefinition,
};
