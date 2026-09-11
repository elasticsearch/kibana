/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import {
  fieldMetricOrFormulaOperationDefinitionSchema,
  esqlColumnSchema,
  esqlColumnWithFormatSchema,
} from '../metric_ops';
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import { dslOnlyPanelInfoSchema, layerSettingsSchema, sharedPanelInfoSchema } from '../shared';
import { getBucketsWithChartDimensionSchema } from './shared';

const regionMapConfigRegionOptionsShape = {
  ems: z
    .object({
      boundaries: z.string().meta({ description: 'EMS boundaries' }),
      join: z.string().meta({ description: 'EMS join field' }),
    })
    .strict()
    .optional(),
};

export const regionMapConfigSchemaNoESQL = z
  .object({
    type: z.literal('region_map'),
    ...sharedPanelInfoSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    /**
     * Metric configuration
     */
    metric: fieldMetricOrFormulaOperationDefinitionSchema,
    /**
     * Configure how to break down to regions
     */
    region: getBucketsWithChartDimensionSchema('regionMapRegion').and(
      z.object(regionMapConfigRegionOptionsShape)
    ),
  })
  .meta({
    id: 'visRegionMapNoESQL',
    title: 'Region Map (DSL)',
    description:
      'Region Map configuration using a data view, mapping metric values to geographic regions by color.',
  });

export const regionMapConfigSchemaESQL = z
  .object({
    type: z.literal('region_map'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    /**
     * Metric configuration
     */
    metric: esqlColumnWithFormatSchema,
    /**
     * Configure how to break down to regions
     */
    region: esqlColumnSchema.extend(regionMapConfigRegionOptionsShape),
  })
  .meta({
    id: 'visRegionMapESQL',
    title: 'Region Map (ES|QL)',
    description:
      'Region Map configuration using an ES|QL query, mapping metric values to geographic regions by color.',
  });

export const regionMapConfigSchema = z
  .union([regionMapConfigSchemaNoESQL, regionMapConfigSchemaESQL])
  .meta({
    id: 'visRegionMapChart',
    title: 'Region Map',
    description: 'A choropleth map with geographic regions colored by the aggregated metric value.',
  });

export type RegionMapConfig = z.output<typeof regionMapConfigSchema>;
export type RegionMapConfigInput = z.input<typeof regionMapConfigSchema>;
export type RegionMapConfigNoESQL = z.output<typeof regionMapConfigSchemaNoESQL>;
export type RegionMapConfigESQL = z.output<typeof regionMapConfigSchemaESQL>;
