/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const LENS_UNKNOWN_VIS = 'UNKNOWN';

export const LENS_CATEGORY_DISPLAY = {
  DEFAULT: 'default',
  INSIDE: 'inside',
  HIDE: 'hide',
} as const;

export const LENS_NUMBER_DISPLAY = {
  HIDDEN: 'hidden',
  PERCENT: 'percent',
  VALUE: 'value',
} as const;

export const LENS_LEGEND_DISPLAY = {
  DEFAULT: 'default',
  SHOW: 'show',
  HIDE: 'hide',
} as const;

export const LENS_LAYER_TYPES = {
  DATA: 'data',
  REFERENCELINE: 'referenceLine',
  ANNOTATIONS: 'annotations',
  METRIC_TRENDLINE: 'metricTrendline',
  POINTS: 'points',
} as const;

export const LEGEND_SIZE = {
  AUTO: 'auto',
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  EXTRA_LARGE: 'xlarge',
} as const;

export const LENS_LEGEND_LAYOUT = {
  Table: 'table',
  List: 'list',
} as const;

export const LENS_COLLAPSE_FUNCTIONS = ['sum', 'avg', 'min', 'max'] as const;
