/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Type } from '@kbn/config-schema';
import type {
  ObjectResultType,
  ObjectType,
  Props,
  TypeOptions,
} from '@kbn/config-schema/src/types';
import type { ObjectUnionExtendOptions, ObjectUnionType } from './charts/utils/object_union';
import { objectUnion } from './charts/utils/object_union';
import type { MetricConfig, MetricConfigESQL, MetricConfigNoESQL } from './charts/metric';
import {
  metricConfigSchema,
  metricConfigSchemaESQL,
  metricConfigSchemaNoESQL,
} from './charts/metric';
import type { LegacyMetricConfig, LegacyMetricConfigNoESQL } from './charts/legacy_metric';
import { legacyMetricConfigSchema, legacyMetricConfigSchemaNoESQL } from './charts/legacy_metric';
import type { GaugeConfig, GaugeConfigESQL, GaugeConfigNoESQL } from './charts/gauge';
import { gaugeConfigSchema, gaugeConfigSchemaESQL, gaugeConfigSchemaNoESQL } from './charts/gauge';
import type { HeatmapConfig, HeatmapConfigESQL, HeatmapConfigNoESQL } from './charts/heatmap';
import {
  heatmapConfigSchema,
  heatmapConfigSchemaESQL,
  heatmapConfigSchemaNoESQL,
} from './charts/heatmap';
import type { TagcloudConfig, TagcloudConfigESQL, TagcloudConfigNoESQL } from './charts/tagcloud';
import {
  tagcloudConfigSchema,
  tagcloudConfigSchemaESQL,
  tagcloudConfigSchemaNoESQL,
} from './charts/tagcloud';
import type {
  XYConfig,
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
import type { MosaicConfig, MosaicConfigESQL, MosaicConfigNoESQL } from './charts/mosaic';
import {
  mosaicConfigSchema,
  mosaicConfigSchemaESQL,
  mosaicConfigSchemaNoESQL,
} from './charts/mosaic';
import type { TreemapConfig, TreemapConfigESQL, TreemapConfigNoESQL } from './charts/treemap';
import {
  treemapConfigSchema,
  treemapConfigSchemaESQL,
  treemapConfigSchemaNoESQL,
} from './charts/treemap';
import type { WaffleConfig, WaffleConfigESQL, WaffleConfigNoESQL } from './charts/waffle';
import {
  waffleConfigSchema,
  waffleConfigSchemaESQL,
  waffleConfigSchemaNoESQL,
} from './charts/waffle';
import type { PieConfig, PieConfigESQL, PieConfigNoESQL } from './charts/pie';
import { pieConfigSchema, pieConfigSchemaESQL, pieConfigSchemaNoESQL } from './charts/pie';

/**
 * We need to break the type inference here to avoid exceeding the ts compiler serialization limit.
 *
 * This requires:
 *  - Casting the schema as any
 *  - Defining the `LensApiConfig` type from the schema types
 *  - Exporting this value as `Type<LensApiConfig>`
 */
export const _lensApiConfigSchema: any = objectUnion(
  [
    ...metricConfigSchema.getUnionTypes(),
    ...legacyMetricConfigSchema.getUnionTypes(),
    ...xyConfigSchema.getUnionTypes(),
    ...gaugeConfigSchema.getUnionTypes(),
    ...heatmapConfigSchema.getUnionTypes(),
    ...tagcloudConfigSchema.getUnionTypes(),
    ...regionMapConfigSchema.getUnionTypes(),
    ...datatableConfigSchema.getUnionTypes(),
    ...pieConfigSchema.getUnionTypes(),
    ...mosaicConfigSchema.getUnionTypes(),
    ...treemapConfigSchema.getUnionTypes(),
    ...waffleConfigSchema.getUnionTypes(),
  ],
  {
    meta: {
      id: 'lensApiConfig',
      title: 'Visualizations',
      description:
        'Visualization configuration. Use the `type` field to specify the chart type. Each chart type has its own set of required and optional fields.',
    },
  }
);

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

export const lensApiConfigSchema: Type<LensApiConfig> = _lensApiConfigSchema;

/**
 * We need to break the type inference here to avoid exceeding the ts compiler serialization limit.
 *
 * This requires:
 *  - Casting the schema as any
 *  - Defining the `LensApiConfig` type from the schema types
 *  - Exporting this value as `Type<LensApiConfig>`
 */
export const _lensApiConfigSchemaNoESQL: any = objectUnion(
  [
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
  ],
  { meta: { id: 'lensApiConfigNoESQL', title: 'Visualizations (DSL)' } }
);

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

export const lensApiConfigSchemaNoESQL: Type<LensApiConfigNoESQL> = _lensApiConfigSchemaNoESQL;

/**
 * We need to break the type inference here to avoid exceeding the ts compiler serialization limit.
 *
 * This requires:
 *  - Casting the schema as any
 *  - Defining the `LensApiConfig` type from the schema types
 *  - Exporting this value as `Type<LensApiConfig>`
 */
export const _lensApiConfigSchemaESQL: any = objectUnion(
  [
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
  ],
  { meta: { id: 'lensApiConfigESQL', title: 'Visualizations (ES|QL)' } }
);

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

export const lensApiConfigSchemaESQL: Type<LensApiConfigESQL> = _lensApiConfigSchemaESQL;

const byValuePanelBranchMeta: ObjectUnionExtendOptions<LensApiConfig>['extendedBranchMeta'] = ({
  description,
  id,
  meta,
}) => {
  const title = typeof meta.title === 'string' ? meta.title : 'Lens visualization';

  return {
    ...meta,
    ...(id ? { id: `${id}ByValuePanel` } : {}),
    title: `${title} by-value panel`,
    description: description
      ? `${description} Panel configuration stored inline.`
      : 'Panel configuration stored inline.',
  };
};

/**
 * Extends `lensApiConfigSchema` with extra props and options.
 *
 * This type will be be union of all `LensApiConfig` intersected with the new props.
 */
export function extendLensApiConfigSchema<T extends Props>(
  props: T,
  options?: TypeOptions<LensApiConfig & T>
): Type<LensApiConfig & ObjectResultType<T>> {
  // these types are a bit of a hack mainly due to the tsc compiler limit
  // but baseSchema can extend with any props correctly and return the correct `Type` wrapper
  const baseSchema = _lensApiConfigSchema as ObjectUnionType<[ObjectType<any>], LensApiConfig & T>;
  const extendOptions = {
    ...(options as TypeOptions<any> | undefined),
    extendedBranchMeta: byValuePanelBranchMeta,
  } as ObjectUnionExtendOptions<any>;
  return baseSchema.extends(props, extendOptions).toType();
}

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
