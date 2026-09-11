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
import type { PartitionMetric } from './partition_shared';
import {
  legendNestedSchema,
  validateColoringAssignments,
  valueDisplaySchema,
} from './partition_shared';
import {
  legendSizeSchema,
  legendVisibilitySchemaWithAuto,
  getBucketsWithChartDimensionSchema,
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
} from './shared';
import { groupIsNotCollapsed } from '../../utils';

const treemapSharedConfigShape = {
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
      id: 'visTreemapLegend',
      title: 'Legend',
      description: 'Configuration for the treemap chart legend appearance and behavior',
    }),
};

const treemapStylingSchema = z
  .object({
    values: valueDisplaySchema,
    /**
     * Labels configuration
     */
    labels: z
      .object({
        visible: z.boolean().optional().meta({ description: 'Show category labels' }),
      })
      .strict()
      .optional()
      .meta({ description: 'Labels configuration' }),
  })
  .strict()
  .meta({
    id: 'visTreemapStyling',
    title: 'Treemap styling',
    description: 'Visual chart styling options',
  });

const partitionConfigPrimaryMetricOptionsShape = {
  /**
   * Color configuration
   */
  color: z.union([staticColorSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
};

const partitionConfigBreakdownByOptionsShape = {
  /**
   * Color configuration: color mapping only
   */
  color: colorMappingSchema.optional(),
  /**
   * Collapse by function. This parameter is used to collapse the
   * metric chart when the number of columns is bigger than the
   * number of columns specified in the columns parameter.
   * Possible values:
   * - 'avg': Collapse by average
   * - 'sum': Collapse by sum
   * - 'max': Collapse by max
   * - 'min': Collapse by min
   * - 'none': Do not collapse
   */
  collapse_by: collapseBySchema.optional(),
};

function validateForMultipleMetrics({
  metrics,
  group_by,
}: {
  metrics: Array<PartitionMetric>;
  group_by?: Array<{ collapse_by?: string }>;
}) {
  const groupByDimensionNumber = (group_by && group_by.filter(groupIsNotCollapsed).length) || 0;
  if (metrics.length === 1) {
    if (groupByDimensionNumber > 2) {
      return 'The number of non-collapsed group_by dimensions must not exceed 2';
    }
  } else {
    if (groupByDimensionNumber > 1) {
      return 'When multiple metrics are defined, the number of non-collapsed group_by dimensions must not exceed 1';
    }
  }
  return validateColoringAssignments({ metrics, group_by });
}

export const treemapConfigSchemaNoESQL = z
  .object({
    type: z.literal('treemap'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...treemapSharedConfigShape,
    styling: treemapStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation. Supports field-based operations (count, unique count, metrics, sum, last value, percentile, percentile ranks), reference-based operations (differences, moving average, cumulative sum, counter rate), and formula-like operations (static value, formula).
     */
    metrics: z
      .array(
        getMetricsWithChartDimensionSchemaWithRefBasedOps('treemapMetric').and(
          z.object(partitionConfigPrimaryMetricOptionsShape)
        )
      )
      .min(1)
      .max(100)
      .meta({ description: 'Array of metric configurations (minimum 1)' }),
    /**
     * Configure how to break down the metric (e.g. show one metric per term). Supports date histogram, terms, histogram, ranges, and filters operations.
     */
    group_by: z
      .array(
        getBucketsWithChartDimensionSchema('treemapGroupBy').and(
          z.object(partitionConfigBreakdownByOptionsShape)
        )
      )
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of breakdown dimensions (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateForMultipleMetrics({
      metrics: data.metrics as PartitionMetric[],
      group_by: data.group_by,
    });
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visTreemapNoESQL',
    title: 'Treemap Chart (DSL)',
    description:
      'Treemap chart configuration schema for data source queries (non-ES|QL mode), defining metrics and breakdown dimensions',
  });

export const treemapConfigSchemaESQL = z
  .object({
    type: z.literal('treemap'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    ...treemapSharedConfigShape,
    styling: treemapStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation. In ES|QL mode, uses column-based configuration.
     */
    metrics: z
      .array(esqlColumnWithFormatSchema.extend(partitionConfigPrimaryMetricOptionsShape))
      .min(1)
      .max(100)
      .meta({ description: 'Array of metric configurations (minimum 1)' }),
    /**
     * Configure how to break down the metric (e.g. show one metric per term). In ES|QL mode, uses column-based configuration.
     */
    group_by: z
      .array(esqlColumnWithFormatSchema.extend(partitionConfigBreakdownByOptionsShape))
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of breakdown dimensions (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateForMultipleMetrics({
      metrics: data.metrics as PartitionMetric[],
      group_by: data.group_by,
    });
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visTreemapESQL',
    title: 'Treemap Chart (ES|QL)',
    description:
      'Treemap chart configuration schema for ES|QL queries, defining metrics and breakdown dimensions using column-based configuration',
  });

export const treemapConfigSchema = z
  .union([treemapConfigSchemaNoESQL, treemapConfigSchemaESQL])
  .meta({
    id: 'visTreemapChart',
    title: 'Treemap Chart',
    description:
      'Treemap chart configuration schema supporting both data source queries (non-ES|QL) and ES|QL query modes',
  });

export type TreemapConfig = z.output<typeof treemapConfigSchema>;
export type TreemapConfigInput = z.input<typeof treemapConfigSchema>;
export type TreemapConfigNoESQL = z.output<typeof treemapConfigSchemaNoESQL>;
export type TreemapConfigESQL = z.output<typeof treemapConfigSchemaESQL>;
