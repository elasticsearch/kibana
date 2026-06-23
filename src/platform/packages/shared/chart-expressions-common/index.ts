/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export {
  extractContainerType,
  extractVisualizationType,
  getOverridesFor,
  isOnAggBasedEditor,
} from './utils';
export {
  findAccessor,
  findAccessorOrFail,
  getAccessorByDimension,
  validateAccessor,
  getColumnByAccessor,
  isVisDimension,
  getAccessor,
  getFormatByAccessor,
} from './accessors';
export { getColorCategories, getLegacyColorCategories } from './color_categories';
export {
  LegendSize,
  LegendLayout,
  LegendSizeToPixels,
  DEFAULT_LEGEND_SIZE,
  getLegendLayout,
} from './legend';

export { getComputedColumnWarningForColumns } from './computed_column_warning';
export { ChartTooltipFooterMessage } from './components/chart_tooltip_footer_message';
export type { Simplify, MakeOverridesSerializable, ChartSizeSpec, ChartSizeEvent } from './types';
export { isChartSizeEvent } from './types';
export type { ExpressionValueVisDimension } from './expression_value_dimension';
export type { XYLegendValue } from './legend';
export type {
  HistogramParams,
  DateHistogramParams,
  FakeParams,
  ExpressionValueXYDimension,
} from './expression_xy_value_dimension';
