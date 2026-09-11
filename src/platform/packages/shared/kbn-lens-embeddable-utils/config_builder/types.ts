/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  FormulaPublicApi,
  TermsIndexPatternColumn,
  TypedLensByValueInput,
} from '@kbn/lens-common';
import type { AggregateQuery, Filter, Query } from '@kbn/es-query';
import type { Datatable } from '@kbn/expressions-plugin/common';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import type { XYLegendValue } from '@kbn/chart-expressions-common';

export type DataViewsCommon = Pick<DataViewsService, 'get' | 'create'>;

export type LensAttributes = TypedLensByValueInput['attributes'];
export type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

type Identity<T> = T extends object
  ? {
      [P in keyof T]: T[P];
    }
  : T;

export type ChartType =
  | 'xy'
  | 'pie'
  | 'heatmap'
  | 'metric'
  | 'gauge'
  | 'donut'
  | 'mosaic'
  | 'regionmap'
  | 'table'
  | 'tagcloud'
  | 'treemap';

export interface TimeRange {
  from: string;
  to: string;
  type: 'relative' | 'absolute';
}

export type LensLayerQuery = string;
export interface LensDataviewDataset {
  index: string;
  timeFieldName?: string;
}

export type LensDatatableDataset = Datatable;

export interface LensESQLDataset {
  esql: string;
}

export type LensDataset = LensDataviewDataset | LensDatatableDataset | LensESQLDataset;

export interface LensBaseConfig {
  title: string;
  description?: string;
  /** default data view id or index pattern to use, it can be overriden on each query */
  dataset?: LensDataset;
}

export interface LensBaseLayer {
  label?: string;
  filter?: string;
  format?: 'bits' | 'bytes' | 'currency' | 'duration' | 'number' | 'percent' | 'string';
  decimals?: number;
  normalizeByUnit?: 's' | 'm' | 'h' | 'd';
  suffix?: string;
  fromUnit?: string;
  toUnit?: string;
  compactValues?: boolean;
  randomSampling?: number;
  useGlobalFilter?: boolean;
  seriesColor?: string;
  value: LensLayerQuery;
}

export interface LensBaseXYLayer {
  dataset?: LensDataset;
  yAxis: LensBaseLayer[];
}

export type LensConfig =
  | LensMetricConfig
  | LensGaugeConfig
  | LensPieConfig
  | LensHeatmapConfig
  | LensMosaicConfig
  | LensRegionMapConfig
  | LensTableConfig
  | LensTagCloudConfig
  | LensTreeMapConfig
  | LensXYConfig;

export interface LensConfigOptions {
  /** if true the output will be embeddable input, else lens attributes */
  embeddable?: boolean;
  /** optional time range override */
  timeRange?: TimeRange;
  filters?: Filter[];
  query?: Query | AggregateQuery;
}

export interface LensAxisTitleVisibilityConfig {
  showXAxisTitle?: boolean;
  showYAxisTitle?: boolean;
  showYRightAxisTitle?: boolean;
}

export interface LensYBoundsConfig {
  mode: 'full' | 'custom' | 'dataBounds';
  lowerBound?: number;
  upperBound?: number;
}
export interface LensLegendConfig {
  show?: boolean;
  position?: 'top' | 'left' | 'bottom' | 'right';
  legendStats?: XYLegendValue[];
}

export interface LensBreakdownDateHistogramConfig {
  type: 'dateHistogram';
  field: string;
  minimumInterval?: string;
}

export interface LensBreakdownFiltersConfig {
  type: 'filters';
  filters: Array<{
    label?: string;
    filter: string;
  }>;
}

export interface LensBreakdownIntervalsConfig {
  type: 'intervals';
  field: string;
  granularity?: number;
}

export interface LensBreakdownTopValuesConfig {
  type: 'topValues';
  field: string;
  size?: number;
  secondaryFields?: string[];
  accuracyMode?: boolean;
  orderBy?: Pick<TermsIndexPatternColumn['params'], 'orderDirection' | 'orderBy' | 'orderAgg'>;
}

export type LensBreakdownConfig =
  | string
  | Identity<
      (
        | LensBreakdownTopValuesConfig
        | LensBreakdownIntervalsConfig
        | LensBreakdownFiltersConfig
        | LensBreakdownDateHistogramConfig
      ) & { colorPalette?: string }
    >;

export interface LensMetricConfigBase {
  chartType: 'metric';
  querySecondaryMetric?: LensLayerQuery;
  queryMaxValue?: LensLayerQuery;
  /** field name to apply breakdown based on field type or full breakdown configuration */
  breakdown?: LensBreakdownConfig;
  trendLine?: boolean;
  subtitle?: string;
}

export type LensMetricConfig = Identity<LensBaseConfig & LensBaseLayer & LensMetricConfigBase>;

export interface LensGaugeConfigBase {
  chartType: 'gauge';
  queryMinValue?: LensLayerQuery;
  queryMaxValue?: LensLayerQuery;
  queryGoalValue?: LensLayerQuery;
  shape?: 'arc' | 'circle' | 'horizontalBullet' | 'verticalBullet';
}

export type LensGaugeConfig = Identity<LensBaseConfig & LensBaseLayer & LensGaugeConfigBase>;

export interface LensPieConfigBase {
  chartType: 'pie' | 'donut';
  breakdown: LensBreakdownConfig[];
  legend?: Identity<LensLegendConfig>;
}

export type LensPieConfig = Identity<LensBaseConfig & LensBaseLayer & LensPieConfigBase>;

export interface LensTreeMapConfigBase {
  chartType: 'treemap';
  /** field name to apply breakdown based on field type or full breakdown configuration */
  breakdown: LensBreakdownConfig[];
}

export type LensTreeMapConfig = Identity<LensBaseConfig & LensBaseLayer & LensTreeMapConfigBase>;

export interface LensTagCloudConfigBase {
  chartType: 'tagcloud';
  /** field name to apply breakdown based on field type or full breakdown configuration */
  breakdown: LensBreakdownConfig;
}

export type LensTagCloudConfig = Identity<LensBaseConfig & LensBaseLayer & LensTagCloudConfigBase>;
export interface LensRegionMapConfigBase {
  chartType: 'regionmap';
  /** field name to apply breakdown based on field type or full breakdown configuration */
  breakdown: LensBreakdownConfig;
}

export type LensRegionMapConfig = Identity<
  LensBaseConfig & LensBaseLayer & LensRegionMapConfigBase
>;

export interface LensMosaicConfigBase {
  chartType: 'mosaic';
  /** field name to apply breakdown based on field type or full breakdown configuration */
  breakdown: LensBreakdownConfig[];
  /** field name to apply breakdown based on field type or full breakdown configuration */
  xAxis?: LensBreakdownConfig;
}

export type LensMosaicConfig = Identity<LensBaseConfig & LensBaseLayer & LensMosaicConfigBase>;

export interface LensTableConfigBase {
  chartType: 'table';
  /** field name to breakdown based on field type or full breakdown configuration */
  splitBy?: LensBreakdownConfig[];
  /** field name to breakdown based on field type or full breakdown configuration */
  breakdown?: LensBreakdownConfig[];
}

export type LensTableConfig = Identity<LensBaseConfig & LensBaseLayer & LensTableConfigBase>;

export interface LensHeatmapConfigBase {
  chartType: 'heatmap';
  /** field name to apply breakdown based on field type or full breakdown configuration */
  breakdown?: LensBreakdownConfig;
  xAxis: LensBreakdownConfig;
  legend?: Identity<LensLegendConfig>;
}

export type LensHeatmapConfig = Identity<LensBaseConfig & LensBaseLayer & LensHeatmapConfigBase>;

export interface LensReferenceLineLayerBase {
  type: 'reference';
  yAxis: Array<
    LensBaseLayer & {
      lineThickness?: number;
      color?: string;
      fill?: 'none' | 'above' | 'below';
      value?: string;
    }
  >;
}

export type LensReferenceLineLayer = LensReferenceLineLayerBase & LensBaseXYLayer;

export interface LensAnnotationLayerBaseProps {
  name: string;
  color?: string;
  icon?: string;
}

export type LensAnnotationLayer = Identity<
  LensBaseXYLayer & {
    type: 'annotation';
    events: Array<
      | Identity<
          LensAnnotationLayerBaseProps & {
            datetime: string;
          }
        >
      | Identity<
          LensAnnotationLayerBaseProps & {
            field: string;
            filter: string;
          }
        >
    >;
  }
>;

export type LensSeriesLayer = Identity<
  LensBaseXYLayer & {
    type: 'series';
    breakdown?: LensBreakdownConfig | LensBreakdownConfig[];
    xAxis?: LensBreakdownConfig;
    seriesType: 'line' | 'bar' | 'area';
  }
>;

export interface LensXYConfigBase {
  chartType: 'xy';
  layers: Array<LensSeriesLayer | LensAnnotationLayer | LensReferenceLineLayer>;
  legend?: Identity<LensLegendConfig>;
  axisTitleVisibility?: Identity<LensAxisTitleVisibilityConfig>;
  xTitle?: string;
  yTitle?: string;
  emphasizeFitting?: boolean;
  fittingFunction?: 'None' | 'Zero' | 'Linear' | 'Carry' | 'Lookahead' | 'Average' | 'Nearest';
  yBounds?: LensYBoundsConfig;
  valueLabels?: 'hide' | 'show';
  areaFill?: 'solid' | 'gradient';
}
export interface BuildDependencies {
  dataViewsAPI: DataViewsCommon;
}

export type LensXYConfig = Identity<LensBaseConfig & LensXYConfigBase>;

type LensFormula = Parameters<FormulaPublicApi['insertOrReplaceFormulaColumn']>[1];

export type FormulaValueConfig = LensFormula & {
  color?: string;
};

interface ChartTypeLensMap {
  gauge: LensGaugeConfig;
  metric: LensMetricConfig;
  pie: LensPieConfig;
  donut: LensPieConfig;
  treemap: LensTreeMapConfig;
  tagcloud: LensTagCloudConfig;
  regionmap: LensRegionMapConfig;
  mosaic: LensMosaicConfig;
  table: LensTableConfig;
  heatmap: LensHeatmapConfig;
  xy: LensXYConfig;
}

export type ChartTypeLensConfig<T extends ChartType> = T extends keyof ChartTypeLensMap
  ? ChartTypeLensMap[T]
  : never;
