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
import { colorMappingSchema } from '../color';
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import {
  collapseBySchema,
  dslOnlyPanelInfoSchema,
  layerSettingsSchema,
  legendTruncateAfterLinesSchema,
  sharedPanelInfoSchema,
  legendPositionSchema,
} from '../shared';
import { legendNestedSchema, valueDisplaySchema } from './partition_shared';
import {
  legendSizeSchema,
  legendVisibilitySchemaWithAuto,
  getBucketsWithChartDimensionSchema,
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
} from './shared';
import { groupIsNotCollapsed } from '../../utils';

const mosaicConfigSharedShape = {
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
      id: 'visMosaicLegend',
      title: 'Legend',
      description: 'Legend configuration for mosaic chart appearance and behavior',
    }),
};

const mosaicStylingSchema = z
  .object({
    values: valueDisplaySchema,
  })
  .strict()
  .meta({
    id: 'visMosaicStyling',
    title: 'Mosaic styling',
    description: 'Visual chart styling options',
  });

const partitionConfigBreakdownByOptionsSchema = z
  .object({
    /**
     * Color configuration: color mapping
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
  })
  .strict();

function validateMosaicGroupings({
  group_by,
  group_breakdown_by,
}: {
  group_by?: Array<{ collapse_by?: string }>;
  group_breakdown_by?: Array<{ collapse_by?: string }>;
}): string | void {
  if (
    (!group_by || group_by.length === 0) &&
    (!group_breakdown_by || group_breakdown_by.length === 0)
  ) {
    return 'Either a group_by or a group_breakdown_by dimension must be specified';
  }
  if (group_by && group_by?.filter(groupIsNotCollapsed).length > 1) {
    return 'Only a single non-collapsed dimension is allowed for group_by';
  }
  if (group_breakdown_by && group_breakdown_by?.filter(groupIsNotCollapsed).length > 1) {
    return 'Only a single non-collapsed dimension is allowed for group_breakdown_by';
  }
  return;
}

export const mosaicConfigSchemaNoESQL = z
  .object({
    type: z.literal('mosaic'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...mosaicConfigSharedShape,
    styling: mosaicStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation. Supports field-based operations (count, unique count, metrics, sum, last value, percentile, percentile ranks), reference-based operations (differences, moving average, cumulative sum, counter rate), and formula-like operations (static value, formula).
     */
    metric: getMetricsWithChartDimensionSchemaWithRefBasedOps('mosaicMetric'),
    group_by: z
      .array(
        getBucketsWithChartDimensionSchema('mosaicGroupBy').and(
          partitionConfigBreakdownByOptionsSchema
        )
      )
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of breakdown dimensions (minimum 1)' }),
    /**
     * Unfortunately due to the collapsed feature, it is necessary to distinct between primary and secondary groups
     * at the api level as well.  Secondary groups are rendered inside the primary groups.
     * If no primary group is defined then the entire set is the primary group.
     */
    group_breakdown_by: z
      .array(
        getBucketsWithChartDimensionSchema('mosaicGroupBreakdownBy').and(
          z.object({
            collapse_by: collapseBySchema.optional(),
          })
        )
      )
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of group breakdown dimensions (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateMosaicGroupings(data);
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visMosaicNoESQL',
    title: 'Mosaic Chart (DSL)',
    description:
      'Mosaic chart configuration schema for data source queries (non-ES|QL mode), defining metrics and breakdown dimensions',
  });

export const mosaicConfigSchemaESQL = z
  .object({
    type: z.literal('mosaic'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    ...mosaicConfigSharedShape,
    styling: mosaicStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation. In ES|QL mode, uses column-based configuration.
     */
    metric: esqlColumnWithFormatSchema.meta({
      description:
        'Metric configuration for ES|QL mode, combining generic options, primary metric options, and column selection',
    }),
    /**
     * Configure how to break down the metric (e.g. show one metric per term). In ES|QL mode, uses column-based configuration.
     */
    group_by: z
      .array(esqlColumnWithFormatSchema.extend(partitionConfigBreakdownByOptionsSchema.shape))
      .min(1)
      .max(100)
      .optional()
      .meta({ description: 'Array of breakdown dimensions (minimum 1)' }),
    group_breakdown_by: z
      .array(esqlColumnWithFormatSchema.extend(partitionConfigBreakdownByOptionsSchema.shape))
      .min(1)
      .max(100)

      .optional()
      .meta({ description: 'Array of group breakdown dimensions (minimum 1)' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateMosaicGroupings(data);
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visMosaicESQL',
    title: 'Mosaic Chart (ES|QL)',
    description:
      'Mosaic chart configuration schema for ES|QL queries, defining metrics and breakdown dimensions using column-based configuration',
  });

export const mosaicConfigSchema = z.union([mosaicConfigSchemaNoESQL, mosaicConfigSchemaESQL]).meta({
  id: 'visMosaicChart',
  title: 'Mosaic Chart',
  description:
    'Mosaic chart configuration schema supporting both data source queries (non-ES|QL) and ES|QL query modes',
});

export type MosaicConfig = z.output<typeof mosaicConfigSchema>;
export type MosaicConfigInput = z.input<typeof mosaicConfigSchema>;
export type MosaicConfigNoESQL = z.output<typeof mosaicConfigSchemaNoESQL>;
export type MosaicConfigESQL = z.output<typeof mosaicConfigSchemaESQL>;
