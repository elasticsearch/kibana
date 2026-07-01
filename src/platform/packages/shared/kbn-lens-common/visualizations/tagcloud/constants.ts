/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { $Values } from '@kbn/utility-types';

export const LENS_TAGCLOUD_ID = 'lnsTagcloud';

export const TAGCLOUD_ORIENTATION = {
  SINGLE: 'single',
  RIGHT_ANGLED: 'right angled',
  MULTIPLE: 'multiple',
} as const;

export const TAGCLOUD_SCALE_OPTIONS = {
  LINEAR: 'linear',
  LOG: 'log',
  SQUARE_ROOT: 'square root',
} as const;

export const LENS_TAGCLOUD_DEFAULT_STATE = {
  maxFontSize: 72,
  minFontSize: 18,
  orientation: TAGCLOUD_ORIENTATION.SINGLE as $Values<typeof TAGCLOUD_ORIENTATION>,
  showCaption: true,
};
