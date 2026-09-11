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
  esqlColumnWithFormatSchema,
  esqlColumnSchema,
  fieldMetricOrStaticOrFormulaOperationDefinitionSchema,
} from '../metric_ops';
import { colorByValueSchema, noColorSchema, autoColorSchema, AUTO_COLOR } from '../color';
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import { dslOnlyPanelInfoSchema, layerSettingsSchema, sharedPanelInfoSchema } from '../shared';
import { getMetricsWithChartDimensionSchema } from './shared';
import { simpleOrientationSchema } from '../enums';

const bulletShapeSchema = z
  .object({
    type: z.literal('bullet'),
    orientation: simpleOrientationSchema.default('horizontal'),
  })
  .strict()
  .meta({
    id: 'visGaugeShapeBullet',
    title: 'Shape (Bullet)',
    description: 'Bullet gauge shape.',
  });

const circularShapeSchema = z
  .object({
    type: z.enum(['circle', 'semi_circle', 'arc']),
  })
  .strict()
  .meta({
    id: 'visGaugeShapeCircular',
    title: 'Shape (Circular)',
    description: 'Circular gauge shape.',
  });

const gaugeStylingSchema = z
  .object({
    shape: z
      .union([bulletShapeSchema, circularShapeSchema])
      .default({ type: 'bullet', orientation: 'horizontal' })
      .optional(),
  })
  .strict()
  .meta({
    id: 'visGaugeStyling',
    title: 'Gauge styling',
    description: 'Visual chart styling options',
  });

const gaugeConfigMetricInnerNoESQLOpsShape = {
  /**
   * Minimum value for the gauge
   * Note: label, format and other visual options are ignored
   */
  min: fieldMetricOrStaticOrFormulaOperationDefinitionSchema.optional(),
  /**
   * Maximum value for the gauge
   * Note: label, format and other visual options are ignored
   */
  max: fieldMetricOrStaticOrFormulaOperationDefinitionSchema.optional(),
  /**
   * Goal value for the gauge
   * Note: label, format and other visual options are ignored
   */
  goal: fieldMetricOrStaticOrFormulaOperationDefinitionSchema.optional(),
};

const gaugeConfigMetricInnerESQLOpsShape = {
  /**
   * Minimum value for the gauge
   */
  min: esqlColumnSchema.optional(),
  /**
   * Maximum value for the gauge
   */
  max: esqlColumnSchema.optional(),
  /**
   * Goal value for the gauge
   */
  goal: esqlColumnSchema.optional(),
};

const gaugeConfigMetricOptionsShape = {
  /**
   * Title configuration
   */
  title: z
    .object({
      visible: z
        .boolean()
        .default(true)
        .optional()
        .meta({ description: 'When `true`, displays the title.' }),
      text: z.string().optional().meta({ description: 'Title text.' }),
    })
    .strict()
    .optional()
    .meta({ description: 'Title configuration' }),
  /**
   * Subtitle
   */
  subtitle: z.string().optional().meta({ description: 'Subtitle below the gauge value.' }),
  /**
   * Color configuration
   */
  color: z
    .union([colorByValueSchema, noColorSchema, autoColorSchema])

    .default(AUTO_COLOR)
    .optional()
    .meta({ description: 'Color configuration for the gauge fill.' }),
  /**
   * Tick marks configuration
   */
  ticks: z
    .object({
      visible: z
        .boolean()

        .default(true)
        .optional()
        .meta({ description: 'When `true`, displays tick marks on the gauge.' }),
      mode: z
        .union([z.literal('auto'), z.literal('bands')])

        .default('bands')
        .optional()
        .meta({ description: 'Tick placement mode.' }),
    })
    .strict()

    .optional()
    .meta({ description: 'Ticks configuration' }),
};

export const gaugeConfigSchemaNoESQL = z
  .object({
    type: z.literal('gauge'),
    ...sharedPanelInfoSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    styling: gaugeStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation.
     */
    metric: getMetricsWithChartDimensionSchema('gaugeMetric').and(
      z.object({
        ...gaugeConfigMetricOptionsShape,
        ...gaugeConfigMetricInnerNoESQLOpsShape,
      })
    ),
  })
  .meta({
    id: 'visGaugeNoESQL',
    title: 'Gauge Chart (DSL)',
    description: 'Gauge configuration using a data view.',
  });

export const gaugeConfigSchemaESQL = z
  .object({
    type: z.literal('gauge'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    styling: gaugeStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation.
     */
    metric: esqlColumnWithFormatSchema
      .extend({
        ...gaugeConfigMetricOptionsShape,
        ...gaugeConfigMetricInnerESQLOpsShape,
      })
      .strict(),
  })
  .meta({
    id: 'visGaugeESQL',
    title: 'Gauge Chart (ES|QL)',
    description: 'Gauge configuration using an ES|QL query.',
  });

export const gaugeConfigSchema = z.union([gaugeConfigSchemaNoESQL, gaugeConfigSchemaESQL]).meta({
  id: 'visGaugeChart',
  title: 'Gauge Chart',
  description:
    'A gauge chart with a metric value and optional minimum, maximum, and goal markers, in bullet or circular shape.',
});

export type GaugeConfig = z.output<typeof gaugeConfigSchema>;
export type GaugeConfigInput = z.input<typeof gaugeConfigSchema>;
export type GaugeConfigNoESQL = z.output<typeof gaugeConfigSchemaNoESQL>;
export type GaugeConfigESQL = z.output<typeof gaugeConfigSchemaESQL>;
