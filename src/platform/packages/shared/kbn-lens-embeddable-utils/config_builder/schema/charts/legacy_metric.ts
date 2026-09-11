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
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import { layerSettingsSchema, sharedPanelInfoSchema, dslOnlyPanelInfoSchema } from '../shared';
import {
  applyColorToSchema,
  AUTO_COLOR,
  colorByValueAbsoluteSchema,
  colorByValuePaletteSchema,
  legacyColorByValueAbsoluteSchema,
  autoColorSchema,
} from '../color';
import { horizontalAlignmentSchema, verticalAlignmentSchema } from '../alignments';
import { getMetricsWithChartDimensionSchema } from './shared';

const legacyMetricConfigMetricOptionsShape = {
  /**
   * Font scale for the legacy metric label and value.
   */
  size: z
    .union([
      z.literal('xs'),
      z.literal('s'),
      z.literal('m'),
      z.literal('l'),
      z.literal('xl'),
      z.literal('xxl'),
    ])
    .default('m')
    .optional()
    .meta({ description: 'Font size for the label and value' }),
  labels: z
    .object({
      /**
       * Alignment for labels. Possible values:
       * - 'top': Align label to the top of the value (default)
       * - 'bottom': Align label to the bottom of the value
       */
      alignment: verticalAlignmentSchema.default('top').optional().meta({
        description: 'Label alignment',
      }),
    })
    .strict()
    .optional()
    .meta({ description: 'Labels configuration' }),
  values: z
    .object({
      /**
       * Alignment for values. Possible values:
       * - 'left': Align value to the left (default)
       * - 'center': Align value to the center
       * - 'right': Align value to the right
       */
      alignment: horizontalAlignmentSchema.default('left').optional().meta({
        description: 'Value alignment',
      }),
    })
    .strict()
    .optional()
    .meta({ description: 'Values configuration' }),
  /**
   * Where to apply the color (background or value)
   */
  apply_color_to: applyColorToSchema.optional(),
  /**
   * Color configuration
   */
  color: z
    .union([
      colorByValueAbsoluteSchema,
      colorByValuePaletteSchema,
      legacyColorByValueAbsoluteSchema,
      autoColorSchema,
    ])
    .default(AUTO_COLOR)
    .optional()
    .meta({ description: 'Color configuration based on the metric value.' }),
};

export const legacyMetricConfigSchemaNoESQL = z
  .object({
    type: z.literal('legacy_metric'),
    ...sharedPanelInfoSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    /**
     * Metric configuration, must define operation.
     */
    metric: getMetricsWithChartDimensionSchema('legacyMetric').and(
      z.object(legacyMetricConfigMetricOptionsShape)
    ),
  })
  .meta({
    id: 'visLegacyMetricNoESQL',
    title: 'Legacy Metric Chart (DSL)',
    description:
      'Legacy Metric configuration using a data view. Superseded by the Metric chart type.',
  });

const esqlLegacyMetricConfig = z
  .object({
    type: z.literal('legacy_metric'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    /**
     * Metric configuration, must define operation.
     */
    metric: esqlColumnWithFormatSchema.extend(legacyMetricConfigMetricOptionsShape),
  })
  .strict()
  .meta({ id: 'visLegacyMetricESQL', title: 'Legacy Metric Chart (ES|QL)' });

// Legacy metric is not currently supported for ES|QL datasets
export const legacyMetricConfigSchema = legacyMetricConfigSchemaNoESQL.meta({
  id: 'visLegacyMetricChart',
  title: 'Legacy Metric Chart',
  description:
    'A single metric value with optional coloring and formatting. Superseded by the Metric chart type.',
});

export type LegacyMetricConfig = z.output<typeof legacyMetricConfigSchema>;
export type LegacyMetricConfigInput = z.input<typeof legacyMetricConfigSchema>;
export type LegacyMetricConfigNoESQL = z.output<typeof legacyMetricConfigSchemaNoESQL>;
export type LegacyMetricConfigESQL = z.output<typeof esqlLegacyMetricConfig>;
