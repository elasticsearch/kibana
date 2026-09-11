/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ColorMappingCategoricalType } from '../../../schema/color';

/**
 * Lens-known defaults for XY chart styling.
 *
 * These are the values Lens applies at runtime when the corresponding
 * property is omitted.  We surface them explicitly in API responses
 * ("complete-out" contract) so the caller receives a fully reproducible
 * chart definition that does not depend on runtime defaults.
 */

export const DEFAULT_PARTIAL_BUCKETS_VISIBLE = false;
export const DEFAULT_CURRENT_TIME_MARKER_VISIBLE = false;
export const DEFAULT_DATA_LABELS_VISIBLE = false;
export const DEFAULT_POINTS_VISIBILITY = 'auto' as const;
export const DEFAULT_LINES_INTERPOLATION = 'linear' as const;
export const DEFAULT_BARS_MINIMUM_HEIGHT = 1;
export const DEFAULT_AREAS_FILL_OPACITY = 0.3;
export const DEFAULT_AREAS_FILL = 'gradient' as const;
export const DEFAULT_LINE_CATEGORICAL_COLOR_MAPPING: ColorMappingCategoricalType = {
  mode: 'categorical',
  palette: 'elastic_line_optimized',
  mapping: [],
};
