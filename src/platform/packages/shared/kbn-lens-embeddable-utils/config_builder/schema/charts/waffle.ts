/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { esqlColumnWithFormatSchema } from '../metric_ops';
import { colorMappingSchema, staticColorSchema, autoColorSchema, AUTO_COLOR } from '../color';
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import {
  collapseBySchema,
  dslOnlyPanelInfoSchema,
  layerSettingsSchema,
  sharedPanelInfoSchema,
  legendTruncateAfterLinesSchema,
  legendPositionSchema,
} from '../shared';
import { validateMultipleMetricsCriteria, valueDisplaySchema } from './partition_shared';
import {
  legendSizeSchema,
  legendVisibilitySchemaWithAuto,
  getBucketsWithChartDimensionSchema,
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
} from './shared';

const waffleConfigSharedShape = {
  legend: z
    .object({
      values: z
        .array(
          z.literal('absolute').meta({
            description: 'Legend value display mode: absolute (show raw metric values in legend)',
          })
        )
        .min(1)
        .max(1)
        .optional(),
      truncate_after_lines: legendTruncateAfterLinesSchema,
      visibility: legendVisibilitySchemaWithAuto,
      size: legendSizeSchema,
      position: legendPositionSchema,
    })
    .strict()
    .optional()
    .meta({
      id: 'visWaffleLegend',
      title: 'Legend',
      description: 'Legend configuration for waffle chart',
    }),
};

const waffleStylingSchema = z
  .object({
    values: valueDisplaySchema,
  })
  .strict()

  .meta({
    id: 'visWaffleStyling',
    title: 'Waffle styling',
    description: 'Visual chart styling options',
  });

/**
 * Color configuration for primary metric in waffle chart
 */
const partitionConfigPrimaryMetricOptionsShape = {
  /**
   * Color configuration
   */
  color: z.union([staticColorSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
};

/**
 * Breakdown configuration including color mapping and collapse behavior
 */
const partitionConfigBreakdownByOptionsShape = {
  color: colorMappingSchema.optional(),
  collapse_by: collapseBySchema.optional(),
};

/**
 * Waffle chart configuration for standard (non-ES|QL) queries
 */
export const waffleConfigSchemaNoESQL = z
  .object({
    type: z.literal('waffle'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...waffleConfigSharedShape,
    styling: waffleStylingSchema.optional(),
    metrics: z
      .array(
        getMetricsWithChartDimensionSchemaWithRefBasedOps('waffleMetric').and(
          z.object(partitionConfigPrimaryMetricOptionsShape)
        )
      )
      .min(1)
      .max(100)
      .meta({ description: 'Array of metric configurations (minimum 1)' }),
    group_by: z
      .array(
        getBucketsWithChartDimensionSchema('waffleGroupBy').and(
          z.object(partitionConfigBreakdownByOptionsShape)
        )
      )
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of breakdown dimensions (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateMultipleMetricsCriteria(data);
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visWaffleNoESQL',
    title: 'Waffle Chart (DSL)',
    description: 'Waffle chart configuration for standard queries',
  });

/**
 * Waffle chart configuration for ES|QL queries
 */
export const waffleConfigSchemaESQL = z
  .object({
    type: z.literal('waffle'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    ...waffleConfigSharedShape,
    styling: waffleStylingSchema.optional(),
    metrics: z
      .array(esqlColumnWithFormatSchema.extend(partitionConfigPrimaryMetricOptionsShape))
      .min(1)
      .max(100)
      .meta({ description: 'Array of metric configurations (minimum 1)' }),
    group_by: z
      .array(esqlColumnWithFormatSchema.extend(partitionConfigBreakdownByOptionsShape))
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of ES|QL breakdown columns (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateMultipleMetricsCriteria(data);
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visWaffleESQL',
    title: 'Waffle Chart (ES|QL)',
    description: 'Waffle chart configuration for ES|QL queries',
  });

/**
 * Complete waffle chart configuration supporting both standard and ES|QL queries
 */
export const waffleConfigSchema = z.union([waffleConfigSchemaNoESQL, waffleConfigSchemaESQL]).meta({
  id: 'visWaffleChart',
  title: 'Waffle Chart',
  description: 'Waffle chart configuration: DSL or ES|QL query based',
});

export type WaffleConfig = z.output<typeof waffleConfigSchema>;
export type WaffleConfigInput = z.input<typeof waffleConfigSchema>;
export type WaffleConfigNoESQL = z.output<typeof waffleConfigSchemaNoESQL>;
export type WaffleConfigESQL = z.output<typeof waffleConfigSchemaESQL>;
