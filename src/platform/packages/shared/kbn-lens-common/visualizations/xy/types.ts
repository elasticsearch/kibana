/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { $Values } from '@kbn/utility-types';
import type {
  LegendConfig,
  AxisExtentConfig,
  XYCurveType,
  FittingFunction,
  EndValue,
  YScaleType,
  XScaleType,
  LineStyle,
  IconPosition,
  FillStyle,
  YAxisConfig,
  PointVisibility,
  AreaFillOption,
} from '@kbn/expression-xy-plugin/common';
import type { ColorMapping, PaletteOutput } from '@kbn/coloring';
import type {
  EventAnnotationConfig,
  EventAnnotationGroupConfig,
} from '@kbn/event-annotation-common';
import type { YAxisModes } from './constants';
import { SeriesTypes } from './constants';
import type { ValueLabelConfig } from '../../types';
import type { AxesSettingsConfig, CollapseFunction } from '../types';

export const defaultSeriesType = SeriesTypes.BAR_STACKED;

export type YAxisMode = $Values<typeof YAxisModes>;
export type SeriesType = $Values<typeof SeriesTypes>;

export interface AxisConfig extends Omit<YAxisConfig, 'extent'> {
  extent?: AxisExtentConfig;
}

export interface LabelsOrientationConfig {
  x: number;
  yLeft: number;
  yRight: number;
}

export interface YConfig {
  forAccessor: string;
  color?: string;
  icon?: string;
  lineWidth?: number;
  lineStyle?: Exclude<LineStyle, 'dot-dashed'>;
  fill?: FillStyle;
  iconPosition?: IconPosition;
  textVisibility?: boolean;
  axisMode?: YAxisMode;
}

export interface XYDataLayerConfig {
  layerId: string;
  accessors: string[];
  layerType: 'data';
  seriesType: SeriesType;
  xAccessor?: string;
  simpleView?: boolean;
  yConfig?: YConfig[];
  splitAccessors?: string[];
  /**
   * @deprecated use `colorMapping` config
   */
  palette?: PaletteOutput;
  collapseFn?: CollapseFunction;
  xScaleType?: XScaleType;
  isHistogram?: boolean;
  columnToLabel?: string;
  colorMapping?: ColorMapping.Config;
}

export interface XYReferenceLineLayerConfig {
  layerId: string;
  accessors: string[];
  yConfig?: YConfig[];
  layerType: 'referenceLine';
}

export interface XYByValueAnnotationLayerConfig {
  layerId: string;
  layerType: 'annotations';
  annotations: EventAnnotationConfig[];
  indexPatternId: string;
  ignoreGlobalFilters: boolean;
  // populated only when the annotation has been forked from the
  // version saved in the library (persisted as XYPersistedLinkedByValueAnnotationLayerConfig)
  cachedMetadata?: {
    title: string;
    description: string;
    tags: string[];
  };
}

export type XYByReferenceAnnotationLayerConfig = XYByValueAnnotationLayerConfig & {
  annotationGroupId: string;
  __lastSaved: EventAnnotationGroupConfig;
};

export type XYAnnotationLayerConfig =
  | XYByReferenceAnnotationLayerConfig
  | XYByValueAnnotationLayerConfig;

export interface XYPointsLayerConfig {
  layerId: string;
  layerType: 'points';
  query: string;
  yAccessor: string;
}

export type XYLayerConfig =
  | XYDataLayerConfig
  | XYReferenceLineLayerConfig
  | XYAnnotationLayerConfig
  | XYPointsLayerConfig;

export interface ValidXYDataLayerConfig extends XYDataLayerConfig {
  xAccessor: NonNullable<XYDataLayerConfig['xAccessor']>;
  layerId: string;
}

export type ValidLayer = ValidXYDataLayerConfig | XYReferenceLineLayerConfig;

/**
 * Runtime state... use XYPersistedLayerConfig for persisted state (i.e. what gets saved in the saved object)
 */
export interface XYVisualizationState {
  preferredSeriesType: SeriesType;
  legend: LegendConfig;
  valueLabels?: ValueLabelConfig;
  fittingFunction?: FittingFunction;
  emphasizeFitting?: boolean;
  endValue?: EndValue;
  xExtent?: AxisExtentConfig;
  yLeftExtent?: AxisExtentConfig;
  yRightExtent?: AxisExtentConfig;
  layers: XYLayerConfig[];
  xTitle?: string;
  yTitle?: string;
  yRightTitle?: string;
  yLeftScale?: YScaleType;
  yRightScale?: YScaleType;
  axisTitlesVisibilitySettings?: AxesSettingsConfig;
  tickLabelsVisibilitySettings?: AxesSettingsConfig;
  gridlinesVisibilitySettings?: AxesSettingsConfig;
  labelsOrientation?: LabelsOrientationConfig;
  curveType?: XYCurveType;
  fillOpacity?: number;
  areaFill?: AreaFillOption;
  minBarHeight?: number;
  hideEndzones?: boolean;
  showCurrentTimeMarker?: boolean;
  pointVisibility?: PointVisibility;
}
