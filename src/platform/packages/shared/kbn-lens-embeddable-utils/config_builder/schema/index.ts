/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import type { ZodType } from '@kbn/zod';

import type {
  MetricConfig,
  MetricConfigInput,
  MetricConfigESQL,
  MetricConfigNoESQL,
} from './charts/metric';
import {
  metricConfigSchema,
  metricConfigSchemaESQL,
  metricConfigSchemaNoESQL,
} from './charts/metric';
import type {
  LegacyMetricConfig,
  LegacyMetricConfigInput,
  LegacyMetricConfigNoESQL,
} from './charts/legacy_metric';
import { legacyMetricConfigSchema, legacyMetricConfigSchemaNoESQL } from './charts/legacy_metric';
import type {
  GaugeConfig,
  GaugeConfigInput,
  GaugeConfigESQL,
  GaugeConfigNoESQL,
} from './charts/gauge';
import { gaugeConfigSchema, gaugeConfigSchemaESQL, gaugeConfigSchemaNoESQL } from './charts/gauge';
import type {
  HeatmapConfig,
  HeatmapConfigInput,
  HeatmapConfigESQL,
  HeatmapConfigNoESQL,
} from './charts/heatmap';
import {
  heatmapConfigSchema,
  heatmapConfigSchemaESQL,
  heatmapConfigSchemaNoESQL,
} from './charts/heatmap';
import type {
  TagcloudConfig,
  TagcloudConfigInput,
  TagcloudConfigESQL,
  TagcloudConfigNoESQL,
} from './charts/tagcloud';
import {
  tagcloudConfigSchema,
  tagcloudConfigSchemaESQL,
  tagcloudConfigSchemaNoESQL,
} from './charts/tagcloud';
import type {
  XYConfig,
  XYConfigInput,
  XYConfigESQL,
  XYConfigNoESQL,
  XYLegendOutsideHorizontal,
  XYLegendOutsideVertical,
  XYLegendInside,
  XYLegendStatistic,
  XYLegendSize,
} from './charts/xy';
import { xyConfigSchema, xyConfigSchemaESQL, xyConfigSchemaNoESQL } from './charts/xy';
import type {
  RegionMapConfig,
  RegionMapConfigInput,
  RegionMapConfigESQL,
  RegionMapConfigNoESQL,
} from './charts/region_map';
import {
  regionMapConfigSchema,
  regionMapConfigSchemaESQL,
  regionMapConfigSchemaNoESQL,
} from './charts/region_map';
import type {
  DatatableConfig,
  DatatableConfigInput,
  DatatableConfigESQL,
  DatatableConfigNoESQL,
} from './charts/datatable';
import {
  datatableConfigSchema,
  datatableConfigSchemaESQL,
  datatableConfigSchemaNoESQL,
} from './charts/datatable';
import type {
  LensApiAllMetricOrFormulaOperations,
  LensApiStaticValueOperation,
} from './metric_ops';
import type { LensApiBucketOperations } from './bucket_ops';
import type {
  MosaicConfig,
  MosaicConfigInput,
  MosaicConfigESQL,
  MosaicConfigNoESQL,
} from './charts/mosaic';
import {
  mosaicConfigSchema,
  mosaicConfigSchemaESQL,
  mosaicConfigSchemaNoESQL,
} from './charts/mosaic';
import type {
  TreemapConfig,
  TreemapConfigInput,
  TreemapConfigESQL,
  TreemapConfigNoESQL,
} from './charts/treemap';
import {
  treemapConfigSchema,
  treemapConfigSchemaESQL,
  treemapConfigSchemaNoESQL,
} from './charts/treemap';
import type {
  WaffleConfig,
  WaffleConfigInput,
  WaffleConfigESQL,
  WaffleConfigNoESQL,
} from './charts/waffle';
import {
  waffleConfigSchema,
  waffleConfigSchemaESQL,
  waffleConfigSchemaNoESQL,
} from './charts/waffle';
import type { PieConfig, PieConfigInput, PieConfigESQL, PieConfigNoESQL } from './charts/pie';
import { pieConfigSchema, pieConfigSchemaESQL, pieConfigSchemaNoESQL } from './charts/pie';

/*
 * We need to break the type inference here to avoid exceeding the ts compiler serialization limit.
 *
 * This requires:
 *  - Casting the schema as any
 *  - Defining the `LensApiConfig` type from the schema types
 *  - Exporting this value as `Type<LensApiConfig>`
 *
 * Applies to:
 *  - lensApiConfigSchema
 *  - lensApiConfigSchemaESQL
 *  - lensApiConfigSchemaNoESQL
 */

/**
 * Schema for Lens API configs
 */
export const lensApiConfigSchema: ZodType<LensApiConfig> = z
  // lazy needed to break the type inference limit
  .lazy(() =>
    z.union([
      metricConfigSchema,
      legacyMetricConfigSchema,
      xyConfigSchema,
      gaugeConfigSchema,
      heatmapConfigSchema,
      tagcloudConfigSchema,
      regionMapConfigSchema,
      datatableConfigSchema,
      pieConfigSchema,
      mosaicConfigSchema,
      treemapConfigSchema,
      waffleConfigSchema,
    ])
  )
  .meta({
    id: 'visApiConfig',
    title: 'Visualizations',
    description:
      'Visualization configuration. Use the `type` field to specify the chart type. Each chart type has its own set of required and optional fields.',
  });

/**
 * Lens API configs
 */
export type LensApiConfig =
  | MetricConfig
  | LegacyMetricConfig
  | GaugeConfig
  | XYConfig
  | HeatmapConfig
  | TagcloudConfig
  | RegionMapConfig
  | DatatableConfig
  | PieConfig
  | MosaicConfig
  | TreemapConfig
  | WaffleConfig;

/**
 * Lens API configs (input shape — fields with defaults are optional)
 */
export type LensApiConfigInput =
  | MetricConfigInput
  | LegacyMetricConfigInput
  | GaugeConfigInput
  | XYConfigInput
  | HeatmapConfigInput
  | TagcloudConfigInput
  | RegionMapConfigInput
  | DatatableConfigInput
  | PieConfigInput
  | MosaicConfigInput
  | TreemapConfigInput
  | WaffleConfigInput;

/**
 * Schema for Lens API configs (DSL)
 */
export const lensApiConfigSchemaNoESQL: ZodType<LensApiConfigNoESQL> = z
  // lazy needed to break the type inference limit
  .lazy(() =>
    z.union([
      metricConfigSchemaNoESQL,
      legacyMetricConfigSchemaNoESQL,
      xyConfigSchemaNoESQL,
      gaugeConfigSchemaNoESQL,
      heatmapConfigSchemaNoESQL,
      tagcloudConfigSchemaNoESQL,
      regionMapConfigSchemaNoESQL,
      datatableConfigSchemaNoESQL,
      pieConfigSchemaNoESQL,
      mosaicConfigSchemaNoESQL,
      treemapConfigSchemaNoESQL,
      waffleConfigSchemaNoESQL,
    ])
  )
  .meta({ id: 'visApiConfigNoESQL', title: 'Visualizations (DSL)' });

/**
 * Lens API configs (DSL)
 */
export type LensApiConfigNoESQL =
  | MetricConfigNoESQL
  | LegacyMetricConfigNoESQL
  | GaugeConfigNoESQL
  | XYConfigNoESQL
  | HeatmapConfigNoESQL
  | TagcloudConfigNoESQL
  | RegionMapConfigNoESQL
  | DatatableConfigNoESQL
  | PieConfigNoESQL
  | MosaicConfigNoESQL
  | TreemapConfigNoESQL
  | WaffleConfigNoESQL;

/**
 * Schema for Lens API configs (ES|QL)
 */
export const lensApiConfigSchemaESQL: ZodType<LensApiConfigESQL> = z
  // lazy needed to break the type inference limit
  .lazy(() =>
    z.union([
      metricConfigSchemaESQL,
      xyConfigSchemaESQL,
      gaugeConfigSchemaESQL,
      heatmapConfigSchemaESQL,
      tagcloudConfigSchemaESQL,
      regionMapConfigSchemaESQL,
      datatableConfigSchemaESQL,
      pieConfigSchemaESQL,
      mosaicConfigSchemaESQL,
      treemapConfigSchemaESQL,
      waffleConfigSchemaESQL,
    ])
  )
  .meta({ id: 'visApiConfigESQL', title: 'Visualizations (ES|QL)' });

/**
 * Lens API configs (ES|QL)
 */
export type LensApiConfigESQL =
  | MetricConfigESQL
  | GaugeConfigESQL
  | XYConfigESQL
  | HeatmapConfigESQL
  | TagcloudConfigESQL
  | RegionMapConfigESQL
  | DatatableConfigESQL
  | PieConfigESQL
  | MosaicConfigESQL
  | TreemapConfigESQL
  | WaffleConfigESQL;

export type {
  LensApiFieldMetricOrFormulaOperation,
  LensApiAllMetricOrFormulaOperations,
} from './metric_ops';
export type { LensApiBucketOperations } from './bucket_ops';
export type { XYLayer } from './charts/xy';

export type NarrowByType<T, U> = T extends { type?: U } ? T : never;

export type LensApiAllOperations =
  | LensApiAllMetricOrFormulaOperations
  | LensApiBucketOperations
  | LensApiStaticValueOperation;

/**
 * Supported chart types in the Lens API
 *
 * @note snake cased
 */
export type LensApiConfigChartType = LensApiConfig['type'];

/**
 * Map of Lens API state types to their corresponding config type
 */
export type LensApiConfigByType = {
  [K in LensApiConfig['type']]: Extract<LensApiConfig, { type: K }>;
};

export { durationFormatSchema } from './duration_units';

export {
  // Combined schemas
  metricConfigSchema,
  legacyMetricConfigSchema,
  gaugeConfigSchema,
  tagcloudConfigSchema,
  xyConfigSchema,
  regionMapConfigSchema,
  heatmapConfigSchema,
  datatableConfigSchema,
  pieConfigSchema,
  treemapConfigSchema,
  waffleConfigSchema,
  mosaicConfigSchema,
  // ESQL schemas
  metricConfigSchemaESQL,
  gaugeConfigSchemaESQL,
  tagcloudConfigSchemaESQL,
  xyConfigSchemaESQL,
  regionMapConfigSchemaESQL,
  heatmapConfigSchemaESQL,
  datatableConfigSchemaESQL,
  pieConfigSchemaESQL,
  treemapConfigSchemaESQL,
  waffleConfigSchemaESQL,
  mosaicConfigSchemaESQL,
  // DSL schemas
  metricConfigSchemaNoESQL,
  legacyMetricConfigSchemaNoESQL,
  gaugeConfigSchemaNoESQL,
  tagcloudConfigSchemaNoESQL,
  xyConfigSchemaNoESQL,
  regionMapConfigSchemaNoESQL,
  heatmapConfigSchemaNoESQL,
  datatableConfigSchemaNoESQL,
  pieConfigSchemaNoESQL,
  treemapConfigSchemaNoESQL,
  waffleConfigSchemaNoESQL,
  mosaicConfigSchemaNoESQL,
};

export type {
  // Combined schemas
  MetricConfig,
  LegacyMetricConfig,
  GaugeConfig,
  TagcloudConfig,
  XYConfig,
  RegionMapConfig,
  HeatmapConfig,
  DatatableConfig,
  PieConfig,
  TreemapConfig,
  WaffleConfig,
  MosaicConfig,
  // Input types (before parsing — fields with defaults are optional)
  MetricConfigInput,
  LegacyMetricConfigInput,
  GaugeConfigInput,
  TagcloudConfigInput,
  XYConfigInput,
  RegionMapConfigInput,
  HeatmapConfigInput,
  DatatableConfigInput,
  PieConfigInput,
  TreemapConfigInput,
  WaffleConfigInput,
  MosaicConfigInput,
  // ESQL schemas
  MetricConfigESQL,
  GaugeConfigESQL,
  TagcloudConfigESQL,
  XYConfigESQL,
  RegionMapConfigESQL,
  HeatmapConfigESQL,
  DatatableConfigESQL,
  PieConfigESQL,
  TreemapConfigESQL,
  WaffleConfigESQL,
  MosaicConfigESQL,
  // DSL schemas
  MetricConfigNoESQL,
  LegacyMetricConfigNoESQL,
  GaugeConfigNoESQL,
  TagcloudConfigNoESQL,
  XYConfigNoESQL,
  RegionMapConfigNoESQL,
  HeatmapConfigNoESQL,
  DatatableConfigNoESQL,
  PieConfigNoESQL,
  TreemapConfigNoESQL,
  WaffleConfigNoESQL,
  MosaicConfigNoESQL,
  // XY Legend types
  XYLegendOutsideHorizontal,
  XYLegendOutsideVertical,
  XYLegendInside,
  XYLegendStatistic,
  XYLegendSize,
};
