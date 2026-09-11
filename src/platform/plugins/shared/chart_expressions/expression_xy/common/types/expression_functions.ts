/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { HorizontalAlignment, Position, VerticalAlignment } from '@elastic/charts';
import { type AxisProps } from '@elastic/charts';
import type { $Values } from '@kbn/utility-types';
import type { PaletteOutput } from '@kbn/coloring';
import type {
  Datatable,
  DatatableColumnMeta,
  DefaultInspectorAdapters,
  ExecutionContext,
  ExpressionFunctionDefinition,
} from '@kbn/expressions-plugin/common';
import type { EventAnnotationOutput } from '@kbn/event-annotation-plugin/common';

import type {
  MakeOverridesSerializable,
  Simplify,
  ExpressionValueVisDimension,
  LegendLayout,
  LegendSize,
  XYLegendValue,
} from '@kbn/chart-expressions-common';
import type {
  AxisExtentModes,
  FillStyles,
  FittingFunctions,
  IconPositions,
  LayerTypes,
  LineStyles,
  SeriesTypes,
  ValueLabelModes,
  XScaleTypes,
  XYCurveTypes,
  YScaleTypes,
  AxisModes,
  REFERENCE_LINE,
  DATA_DECORATION_CONFIG,
  REFERENCE_LINE_DECORATION_CONFIG,
  LEGEND_CONFIG,
  DATA_LAYER,
  AXIS_EXTENT_CONFIG,
  EXTENDED_DATA_LAYER,
  REFERENCE_LINE_LAYER,
  POINTS_LAYER,
  ANNOTATION_LAYER,
  EndValues,
  X_AXIS_CONFIG,
  Y_AXIS_CONFIG,
  AvailableReferenceLineIcons,
  XY_VIS,
  LAYERED_XY_VIS,
  EXTENDED_ANNOTATION_LAYER,
  EXTENDED_REFERENCE_LINE_DECORATION_CONFIG,
  PointVisibilityOptions,
  AreaFillOptions,
} from '../constants';
import type { XYRender } from './expression_renderers';

export type EndValue = $Values<typeof EndValues>;
export type LayerType = $Values<typeof LayerTypes>;
export type LineStyle = $Values<typeof LineStyles>;
export type FillStyle = $Values<typeof FillStyles>;
export type SeriesType = $Values<typeof SeriesTypes>;
export type YScaleType = $Values<typeof YScaleTypes>;
export type XScaleType = $Values<typeof XScaleTypes>;
export type AxisMode = $Values<typeof AxisModes>;
export type XYCurveType = $Values<typeof XYCurveTypes>;
export type IconPosition = $Values<typeof IconPositions>;
export type ValueLabelMode = $Values<typeof ValueLabelModes>;
export type AxisExtentMode = $Values<typeof AxisExtentModes>;
export type FittingFunction = $Values<typeof FittingFunctions>;
export type AvailableReferenceLineIcon = $Values<typeof AvailableReferenceLineIcons>;
export type PointVisibility = $Values<typeof PointVisibilityOptions>;
export type AreaFillOption = $Values<typeof AreaFillOptions>;

export interface AxesSettingsConfig {
  yLeft: boolean;
  yRight: boolean;
}

export interface AxisExtentConfig {
  mode: AxisExtentMode;
  lowerBound?: number;
  upperBound?: number;
  enforce?: boolean;
  niceValues?: boolean;
}

export interface AxisConfig {
  title?: string;
  hide?: boolean;
  id?: string;
  position?: Position;
  labelColor?: string;
  showOverlappingLabels?: boolean;
  showDuplicates?: boolean;
  labelsOrientation?: number;
  truncate?: number;
  showLabels?: boolean;
  showTitle?: boolean;
  showGridLines?: boolean;
  extent?: AxisExtentConfigResult;
}

export interface YAxisConfig extends AxisConfig {
  mode?: AxisMode;
  boundsMargin?: number;
  scaleType?: YScaleType;
}

export interface ReferenceLineDecorationConfig extends DataDecorationConfig {
  icon?: AvailableReferenceLineIcon;
  lineWidth?: number;
  lineStyle?: LineStyle;
  fill?: FillStyle;
  iconPosition?: IconPosition;
  textVisibility?: boolean;
  position?: Position;
}

export interface DataDecorationConfig {
  forAccessor: string;
  color?: string;
  axisId?: string;
}

export interface DataLayerArgs {
  accessors: Array<ExpressionValueVisDimension | string>;
  seriesType: SeriesType;
  xAccessor?: string | ExpressionValueVisDimension;
  simpleView?: boolean;
  splitAccessors?: Array<ExpressionValueVisDimension | string>;
  markSizeAccessor?: string | ExpressionValueVisDimension;
  lineWidth?: number;
  showPoints?: boolean;
  showLines?: boolean;
  pointsRadius?: number;
  columnToLabel?: string; // Actually a JSON key-value pair
  xScaleType: XScaleType;
  isHistogram: boolean;
  isPercentage: boolean;
  isStacked: boolean;
  isHorizontal: boolean;
  palette: PaletteOutput;
  colorMapping?: string; // JSON stringified object of the color mapping
  decorations?: DataDecorationConfigResult[];
  curveType?: XYCurveType;
}

export interface ValidLayer extends DataLayerConfigResult {
  xAccessor: NonNullable<DataLayerConfigResult['xAccessor']>;
}

export interface ExtendedDataLayerArgs {
  layerId?: string;
  accessors: Array<ExpressionValueVisDimension | string>;
  seriesType: SeriesType;
  xAccessor?: string | ExpressionValueVisDimension;
  simpleView?: boolean;
  splitAccessors?: Array<ExpressionValueVisDimension | string>;
  markSizeAccessor?: string | ExpressionValueVisDimension;
  lineWidth?: number;
  showPoints?: boolean;
  showLines?: boolean;
  pointsRadius?: number;
  columnToLabel?: string; // Actually a JSON key-value pair
  xScaleType: XScaleType;
  isHistogram: boolean;
  isPercentage: boolean;
  isStacked: boolean;
  isHorizontal: boolean;
  palette: PaletteOutput;
  colorMapping?: string;
  // palette will always be set on the expression
  decorations?: DataDecorationConfigResult[];
  curveType?: XYCurveType;
}

export interface LegendConfig {
  /**
   * Flag whether the legend should be shown. If there is just a single series, it will be hidden
   */
  isVisible: boolean;
  /**
   * Position of the legend relative to the chart
   */
  position: Position;
  /**
   * Flag whether the legend should be shown even with just a single series
   */
  showSingleSeries?: boolean;
  /**
   * Flag whether the legend is inside the chart
   */
  isInside?: boolean;
  /**
   * Horizontal Alignment of the legend when it is set inside chart
   */
  horizontalAlignment?: typeof HorizontalAlignment.Right | typeof HorizontalAlignment.Left;
  /**
   * Vertical Alignment of the legend when it is set inside chart
   */
  verticalAlignment?: typeof VerticalAlignment.Top | typeof VerticalAlignment.Bottom;
  /**
   * Number of columns when legend is set inside chart
   */
  floatingColumns?: number;
  /**
   * Maximum number of lines per legend item
   */
  maxLines?: number;

  /**
   * Flag whether the legend items are truncated or not
   */
  shouldTruncate?: boolean;

  /**
   * Exact legend width (vertical) or height (horizontal)
   * Limited to max of 70% of the chart container dimension Vertical legends limited to min of 30% of computed width
   */
  legendSize?: LegendSize;
  /**
   * metrics to display in the legend
   */

  legendStats?: XYLegendValue[];
  layout?: LegendLayout;
  title?: string;
  isTitleVisible?: boolean;
}

// Arguments to XY chart expression, with computed properties
export interface XYArgs extends DataLayerArgs {
  legend: LegendConfigResult;
  endValue?: EndValue;
  emphasizeFitting?: boolean;
  valueLabels: ValueLabelMode;
  referenceLines: ReferenceLineConfigResult[];
  fittingFunction?: FittingFunction;
  fillOpacity?: number;
  areaFill?: AreaFillOption;
  hideEndzones?: boolean;
  ariaLabel?: string;
  yAxisConfigs?: YAxisConfigResult[];
  xAxisConfig?: XAxisConfigResult;
  addTimeMarker?: boolean;
  markSizeRatio?: number;
  minTimeBarInterval?: string;
  minBarHeight?: number;
  splitRowAccessor?: ExpressionValueVisDimension | string;
  splitColumnAccessor?: ExpressionValueVisDimension | string;
  detailedTooltip?: boolean;
  orderBucketsBySum?: boolean;
  showTooltip: boolean;
}

export interface ExpressionAnnotationsLayers {
  layers: AnnotationLayerConfigResult[];
  datatable: Datatable;
}
export type ExpressionAnnotationResult = ExpressionAnnotationsLayers & {
  type: 'event_annotations_result';
};

export interface EventAnnotationResultArgs {
  layers?: ExtendedAnnotationLayerConfigResult[];
  datatable: Datatable;
}

export interface EventAnnotationResultResult {
  type: 'event_annotations_result';
  layers: ExtendedAnnotationLayerConfigResult[];
  datatable: Datatable;
}

export type EventAnnotationResultFn = ExpressionFunctionDefinition<
  'event_annotations_result',
  null,
  EventAnnotationResultArgs,
  EventAnnotationResultResult
>;

export interface LayeredXYArgs {
  legend: LegendConfigResult;
  endValue?: EndValue;
  emphasizeFitting?: boolean;
  valueLabels: ValueLabelMode;
  layers?: XYExtendedLayerConfigResult[];
  annotations?: ExpressionAnnotationResult;
  fittingFunction?: FittingFunction;
  fillOpacity?: number;
  areaFill?: AreaFillOption;
  hideEndzones?: boolean;
  ariaLabel?: string;
  yAxisConfigs?: YAxisConfigResult[];
  xAxisConfig?: XAxisConfigResult;
  detailedTooltip?: boolean;
  addTimeMarker?: boolean;
  markSizeRatio?: number;
  minTimeBarInterval?: string;
  minBarHeight?: number;
  orderBucketsBySum?: boolean;
  showTooltip: boolean;
  splitRowAccessor?: ExpressionValueVisDimension | string;
  splitColumnAccessor?: ExpressionValueVisDimension | string;
  singleTable?: boolean;
  pointVisibility?: PointVisibility;
}

export interface XYProps {
  legend: LegendConfigResult;
  endValue?: EndValue;
  emphasizeFitting?: boolean;
  valueLabels: ValueLabelMode;
  layers: CommonXYLayerConfig[];
  fittingFunction?: FittingFunction;
  fillOpacity?: number;
  areaFill?: AreaFillOption;
  hideEndzones?: boolean;
  ariaLabel?: string;
  yAxisConfigs?: YAxisConfigResult[];
  xAxisConfig?: XAxisConfigResult;
  addTimeMarker?: boolean;
  markSizeRatio?: number;
  minTimeBarInterval?: string;
  minBarHeight: number;
  splitRowAccessor?: ExpressionValueVisDimension | string;
  splitColumnAccessor?: ExpressionValueVisDimension | string;
  detailedTooltip?: boolean;
  orderBucketsBySum?: boolean;
  showTooltip: boolean;
  singleTable?: boolean;
  annotations?: ExpressionAnnotationResult;
  pointVisibility?: PointVisibility;
}

export interface AnnotationLayerArgs {
  layerId: string;
  annotations: EventAnnotationOutput[];
  simpleView?: boolean;
}

export type ExtendedAnnotationLayerArgs = AnnotationLayerArgs & {
  layerId: string;
};

export type AnnotationLayerConfigResult = AnnotationLayerArgs & {
  type: typeof ANNOTATION_LAYER;
  layerType: typeof LayerTypes.ANNOTATIONS;
};

export type ExtendedAnnotationLayerConfigResult = ExtendedAnnotationLayerArgs & {
  type: typeof EXTENDED_ANNOTATION_LAYER;
  layerType: typeof LayerTypes.ANNOTATIONS;
};

export interface ReferenceLineArgs extends Omit<ReferenceLineDecorationConfig, 'fill'> {
  name?: string;
  value: number;
  fill: FillStyle;
  valueMeta?: DatatableColumnMeta;
}

export interface ReferenceLineLayerArgs {
  layerId?: string;
  accessors: string[];
  columnToLabel?: string;
  decorations?: ReferenceLineDecorationConfigResult[];
  table?: Datatable;
}

export interface PointsLayerArgs {
  layerId: string;
  query: string;
  yAccessor: string;
}

export type PointsLayerConfigResult = PointsLayerArgs & {
  type: typeof POINTS_LAYER;
  layerType: typeof LayerTypes.POINTS;
  table?: Datatable;
};

export type PointsLayerConfig = PointsLayerConfigResult & WithLayerId;

export type PointsLayerFn = ExpressionFunctionDefinition<
  typeof POINTS_LAYER,
  Datatable | null,
  PointsLayerArgs,
  PointsLayerConfigResult
>;

export type XYLayerArgs = DataLayerArgs | ReferenceLineArgs | AnnotationLayerArgs;
export type XYLayerConfig = DataLayerConfig | ReferenceLineConfig | AnnotationLayerConfig;
export type XYExtendedLayerConfig =
  | ExtendedDataLayerConfig
  | ReferenceLineLayerConfig
  | ExtendedAnnotationLayerConfig
  | ReferenceLineConfig
  | PointsLayerConfig;

export type XYExtendedLayerConfigResult =
  | ExtendedDataLayerConfigResult
  | ReferenceLineLayerConfigResult
  | ReferenceLineConfigResult
  | PointsLayerConfigResult;

export interface ExtendedReferenceLineDecorationConfig extends ReferenceLineArgs {
  type: typeof EXTENDED_REFERENCE_LINE_DECORATION_CONFIG;
}

export interface ReferenceLineConfigResult {
  type: typeof REFERENCE_LINE;
  layerType: typeof LayerTypes.REFERENCELINE;
  lineLength: number;
  columnToLabel?: string;
  decorations: [ExtendedReferenceLineDecorationConfig];
}

export type ReferenceLineLayerConfigResult = ReferenceLineLayerArgs & {
  type: typeof REFERENCE_LINE_LAYER;
  layerType: typeof LayerTypes.REFERENCELINE;
  table: Datatable;
};

export type DataLayerConfigResult = Omit<DataLayerArgs, 'palette'> & {
  type: typeof DATA_LAYER;
  layerType: typeof LayerTypes.DATA;
  palette: PaletteOutput;
  table: Datatable;
};

export interface WithLayerId {
  layerId: string;
}

export type DataLayerConfig = DataLayerConfigResult & WithLayerId;
export type ReferenceLineConfig = ReferenceLineConfigResult & WithLayerId;
export type AnnotationLayerConfig = AnnotationLayerConfigResult & WithLayerId;

export type ExtendedDataLayerConfig = ExtendedDataLayerConfigResult & WithLayerId;
export type ReferenceLineLayerConfig = ReferenceLineLayerConfigResult & WithLayerId;
export type ExtendedAnnotationLayerConfig = ExtendedAnnotationLayerConfigResult & WithLayerId;

export type ExtendedDataLayerConfigResult = Omit<ExtendedDataLayerArgs, 'palette'> & {
  type: typeof EXTENDED_DATA_LAYER;
  layerType: typeof LayerTypes.DATA;
  palette: PaletteOutput;
  table: Datatable;
};

export type DataDecorationConfigResult = DataDecorationConfig & {
  type: typeof DATA_DECORATION_CONFIG;
};
export type ReferenceLineDecorationConfigResult = ReferenceLineDecorationConfig & {
  type: typeof REFERENCE_LINE_DECORATION_CONFIG;
};

export type XAxisConfigResult = AxisConfig & { type: typeof X_AXIS_CONFIG };
export type YAxisConfigResult = YAxisConfig & { type: typeof Y_AXIS_CONFIG };

export type LegendConfigResult = LegendConfig & { type: typeof LEGEND_CONFIG };
export type AxisExtentConfigResult = AxisExtentConfig & { type: typeof AXIS_EXTENT_CONFIG };

export type CommonXYLayerConfig = XYLayerConfig | XYExtendedLayerConfig;
export type CommonXYDataLayerConfigResult = DataLayerConfigResult | ExtendedDataLayerConfigResult;
export type CommonXYReferenceLineLayerConfigResult =
  | ReferenceLineConfigResult
  | ReferenceLineLayerConfigResult;

export type CommonXYDataLayerConfig = DataLayerConfig | ExtendedDataLayerConfig;
export type CommonXYReferenceLineLayerConfig = ReferenceLineConfig | ReferenceLineLayerConfig;

export type CommonXYAnnotationLayerConfig = AnnotationLayerConfig | ExtendedAnnotationLayerConfig;

export type XyVisFn = ExpressionFunctionDefinition<
  typeof XY_VIS,
  Datatable,
  XYArgs,
  Promise<XYRender>,
  ExecutionContext<DefaultInspectorAdapters>
>;
export type LayeredXyVisFn = ExpressionFunctionDefinition<
  typeof LAYERED_XY_VIS,
  Datatable,
  LayeredXYArgs,
  Promise<XYRender>,
  ExecutionContext<DefaultInspectorAdapters>
>;

export type ExtendedDataLayerFn = ExpressionFunctionDefinition<
  typeof EXTENDED_DATA_LAYER,
  Datatable,
  ExtendedDataLayerArgs,
  Promise<ExtendedDataLayerConfigResult>
>;

export type ReferenceLineFn = ExpressionFunctionDefinition<
  typeof REFERENCE_LINE,
  Datatable | null,
  ReferenceLineArgs,
  ReferenceLineConfigResult
>;
export type ReferenceLineLayerFn = ExpressionFunctionDefinition<
  typeof REFERENCE_LINE_LAYER,
  Datatable,
  ReferenceLineLayerArgs,
  Promise<ReferenceLineLayerConfigResult>
>;

export type DataDecorationConfigFn = ExpressionFunctionDefinition<
  typeof DATA_DECORATION_CONFIG,
  null,
  DataDecorationConfig,
  DataDecorationConfigResult
>;
export type ReferenceLineDecorationConfigFn = ExpressionFunctionDefinition<
  typeof REFERENCE_LINE_DECORATION_CONFIG,
  null,
  ReferenceLineDecorationConfig,
  ReferenceLineDecorationConfigResult
>;

export type LegendConfigFn = ExpressionFunctionDefinition<
  typeof LEGEND_CONFIG,
  null,
  LegendConfig,
  Promise<LegendConfigResult>
>;

export type XAxisConfigFn = ExpressionFunctionDefinition<
  typeof X_AXIS_CONFIG,
  null,
  AxisConfig,
  XAxisConfigResult
>;

export type YAxisConfigFn = ExpressionFunctionDefinition<
  typeof Y_AXIS_CONFIG,
  null,
  YAxisConfig,
  YAxisConfigResult
>;

export type ExtendedAnnotationLayerFn = ExpressionFunctionDefinition<
  typeof EXTENDED_ANNOTATION_LAYER,
  null,
  ExtendedAnnotationLayerArgs,
  ExtendedAnnotationLayerConfigResult
>;

export type AllowedXYOverrides = Partial<
  Record<
    'axisX' | 'axisLeft' | 'axisRight',
    // id and groupId should not be overridden
    Simplify<Omit<MakeOverridesSerializable<AxisProps>, 'id' | 'groupId'>>
  >
>;
