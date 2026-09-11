/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const PLUGIN_ID = 'expressionXy';
export const PLUGIN_NAME = 'expressionXy';

export {
  LayerTypes,
  XYCurveTypes,
  FillStyles,
  FittingFunctions,
  PointVisibilityOptions,
  AreaFillOptions,
} from './constants';

export type {
  AllowedXYOverrides,
  XYArgs,
  EndValue,
  XYRender,
  LayerType,
  LineStyle,
  FillStyle,
  SeriesType,
  YScaleType,
  XScaleType,
  AxisMode,
  AxisConfig,
  YAxisConfig,
  ValidLayer,
  XYLayerArgs,
  XYCurveType,
  XYChartProps,
  LegendConfig,
  IconPosition,
  DataLayerArgs,
  ValueLabelMode,
  AxisExtentMode,
  DataLayerConfig,
  FittingFunction,
  AxisExtentConfig,
  MergedAnnotation,
  LegendConfigResult,
  AxesSettingsConfig,
  XAxisConfigResult,
  YAxisConfigResult,
  CommonXYLayerConfig,
  DataDecorationConfig,
  AnnotationLayerArgs,
  DataLayerConfigResult,
  AxisExtentConfigResult,
  ReferenceLineLayerArgs,
  CommonXYDataLayerConfig,
  ReferenceLineLayerConfig,
  DataDecorationConfigResult,
  AvailableReferenceLineIcon,
  XYExtendedLayerConfigResult,
  CommonXYAnnotationLayerConfig,
  ExtendedDataLayerConfigResult,
  CommonXYDataLayerConfigResult,
  ReferenceLineLayerConfigResult,
  ReferenceLineDecorationConfig,
  CommonXYReferenceLineLayerConfig,
  ReferenceLineDecorationConfigResult,
  CommonXYReferenceLineLayerConfigResult,
  ReferenceLineDecorationConfigFn,
  DataDecorationConfigFn,
  ExtendedDataLayerFn,
  ExtendedAnnotationLayerConfigResult,
  ExtendedAnnotationLayerFn,
  ReferenceLineLayerFn,
  PointsLayerFn,
  PointsLayerArgs,
  PointsLayerConfigResult,
  YAxisConfigFn,
  XAxisConfigFn,
  LegendConfigFn,
  EventAnnotationResultFn,
  LayeredXyVisFn,
  PointVisibility,
  AreaFillOption,
} from './types';
