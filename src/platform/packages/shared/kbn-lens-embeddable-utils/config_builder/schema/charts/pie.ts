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
  legendPositionSchema,
  legendTruncateAfterLinesSchema,
  sharedPanelInfoSchema,
} from '../shared';
import {
  legendSizeSchema,
  legendVisibilitySchemaWithAuto,
  getBucketsWithChartDimensionSchema,
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
} from './shared';
import type { PartitionMetric } from './partition_shared';
import {
  legendNestedSchema,
  validateColoringAssignments,
  valueDisplaySchema,
} from './partition_shared';
import { groupIsNotCollapsed } from '../../utils';

const pieStateSharedShape = {
  legend: z
    .object({
      nested: legendNestedSchema,
      truncate_after_lines: legendTruncateAfterLinesSchema,
      visibility: legendVisibilitySchemaWithAuto,
      size: legendSizeSchema,
      position: legendPositionSchema,
    })
    .strict()
    .optional()
    .meta({
      id: 'visPieLegend',
      title: 'Legend',
      description: 'Legend configuration for pie chart',
    }),
};

/**
 * Pie chart styling: value display, slice labels, and donut hole
 */
const pieStylingSchema = z
  .object({
    values: valueDisplaySchema,
    labels: z
      .object({
        visible: z
          .boolean()
          .optional()
          .meta({ description: 'When `true`, displays slice labels.' }),
        position: z
          .union([z.literal('inside'), z.literal('outside')])
          .optional()
          .meta({
            description: 'Slice label position: `inside` or `outside`.',
          }),
      })
      .strict()
      .optional()
      .meta({
        description: 'Label configuration for pie chart slice labels inside or outside the pie',
      }),
    donut_hole: z
      .union([z.literal('none'), z.literal('s'), z.literal('m'), z.literal('l')])
      .optional()
      .meta({
        description: 'Donut hole size. Accepted values: `none` (full pie), `s`, `m`, `l`.',
      }),
  })
  .strict()
  .meta({
    id: 'visPieStyling',
    title: 'Pie chart styling',
    description: 'Visual chart styling options',
  });

/**
 * Color configuration for primary metric in pie chart
 */
const partitionConfigPrimaryMetricOptionsShape = {
  color: z.union([staticColorSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
};

/**
 * Breakdown configuration including color mapping and collapse behavior
 */
const partitionConfigBreakdownByOptionsShape = {
  color: colorMappingSchema.optional(),
  collapse_by: collapseBySchema.optional(),
};

const pieTypeSchema = z.literal('pie');

function validateForMultipleMetrics({
  metrics,
  group_by,
}: {
  metrics: Array<PartitionMetric>;
  group_by?: Array<{ collapse_by?: string }>;
}) {
  const groupByDimensionNumber = (group_by && group_by.filter(groupIsNotCollapsed).length) || 0;
  if (metrics.length === 1) {
    if (groupByDimensionNumber > 3) {
      return 'The number of non-collapsed group_by dimensions must not exceed 3';
    }
  } else {
    if (groupByDimensionNumber > 2) {
      return 'When multiple metrics are defined, the number of non-collapsed group_by dimensions must not exceed 2';
    }
  }
  return validateColoringAssignments({ metrics, group_by });
}

/**
 * Pie chart configuration for standard (non-ES|QL) queries
 */
export const pieConfigSchemaNoESQL = z
  .object({
    type: pieTypeSchema,
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...pieStateSharedShape,
    styling: pieStylingSchema.optional(),
    metrics: z
      .array(
        getMetricsWithChartDimensionSchemaWithRefBasedOps('pieMetric').and(
          z.object(partitionConfigPrimaryMetricOptionsShape)
        )
      )
      .min(1)
      .max(100)
      .meta({ description: 'Array of metric configurations (minimum 1)' }),
    group_by: z
      .array(
        getBucketsWithChartDimensionSchema('pieGroupBy').and(
          z.object(partitionConfigBreakdownByOptionsShape)
        )
      )
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of breakdown dimensions (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateForMultipleMetrics(data);
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visPieNoESQL',
    title: 'Pie Chart (DSL)',
    description: 'Pie chart configuration for standard queries',
  });

/**
 * Pie chart configuration for ES|QL queries
 */
export const pieConfigSchemaESQL = z
  .object({
    type: pieTypeSchema,
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    ...pieStateSharedShape,
    styling: pieStylingSchema.optional(),
    metrics: z
      .array(
        esqlColumnWithFormatSchema.extend(partitionConfigPrimaryMetricOptionsShape).meta({
          description: 'ES|QL column reference for primary metric',
        })
      )
      .min(1)
      .max(100)
      .meta({ description: 'Array of metric configurations (minimum 1)' }),
    group_by: z
      .array(esqlColumnWithFormatSchema.extend(partitionConfigBreakdownByOptionsShape))
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of breakdown dimensions (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateForMultipleMetrics(data);
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visPieESQL',
    title: 'Pie Chart (ES|QL)',
    description: 'Pie chart configuration for ES|QL queries',
  });

/**
 * Complete pie chart configuration supporting both standard and ES|QL queries
 */
export const pieConfigSchema = z.union([pieConfigSchemaNoESQL, pieConfigSchemaESQL]).meta({
  id: 'visPieChart',
  title: 'Pie Chart',
  description: 'Pie chart state: standard query or ES|QL query',
});

export type PieConfig = z.output<typeof pieConfigSchema>;
export type PieConfigInput = z.input<typeof pieConfigSchema>;
export type PieConfigNoESQL = z.output<typeof pieConfigSchemaNoESQL>;
export type PieConfigESQL = z.output<typeof pieConfigSchemaESQL>;
