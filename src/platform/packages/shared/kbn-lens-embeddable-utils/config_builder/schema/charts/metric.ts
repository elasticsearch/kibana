/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { LENS_METRIC_BREAKDOWN_DEFAULT_MAX_COLUMNS } from '@kbn/lens-common';
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_PRIMARY_LABELS_ALIGNMENT,
  DEFAULT_PRIMARY_VALUE_ALIGNMENT,
  DEFAULT_PRIMARY_VALUE_SIZING,
  DEFAULT_PRIMARY_ICON_ALIGNMENT,
  DEFAULT_DENSITY,
  DEFAULT_SECONDARY_LABEL_VISIBLE,
  DEFAULT_SECONDARY_LABEL_PLACEMENT,
  DEFAULT_SECONDARY_VALUE_ALIGNMENT,
  DEFAULT_SECONDARY_COMPARE_TO_PALETTE,
} from '../../transforms/charts/metric/defaults';
import {
  metricOperationDefinitionSchema,
  esqlColumnSchema,
  esqlColumnWithFormatSchema,
} from '../metric_ops';
import {
  staticColorSchema,
  applyColorToSchema,
  colorByValueSchema,
  autoColorSchema,
  AUTO_COLOR,
  NO_COLOR,
  noColorSchema,
} from '../color';
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import {
  collapseBySchema,
  layerSettingsSchema,
  sharedPanelInfoSchema,
  dslOnlyPanelInfoSchema,
} from '../shared';
import {
  getBucketsWithChartDimensionSchema,
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
} from './shared';
import {
  horizontalAlignmentSchema,
  metricValuePositionSchema,
  leftRightAlignmentSchema,
  placementSchema,
} from '../alignments';
import { simpleOrientationSchema } from '../enums';

const compareToSchemaShared = z
  .object({
    palette: z.string().default(DEFAULT_SECONDARY_COMPARE_TO_PALETTE).optional().meta({
      description:
        "Color palette name. Accepted values: 'default', 'elastic_line_optimized', 'severity', 'eui_amsterdam', 'kibana_v7_legacy', 'elastic_brand_2023'. Defaults to `default`.",
    }),
    icon: z
      .boolean()
      .default(true)
      .optional()
      .meta({ description: 'When `true`, displays the icon for the secondary value.' }),
    value: z
      .boolean()
      .default(true)
      .optional()
      .meta({ description: 'When `true`, displays the secondary value.' }),
  })
  .strict()
  .meta({
    id: 'visMetricChartCompareToShared',
    title: 'Compare To Shared',
    description: 'Shared configuration for compare-to options (palette, icon, value visibility).',
  });

const barBackgroundChartSchema = z
  .object({
    type: z.literal('bar'),
    /**
     * Direction of the bar. Possible values:
     * - 'vertical': Bar is oriented vertically
     * - 'horizontal': Bar is oriented horizontally
     */
    orientation: simpleOrientationSchema.optional(),
  })
  .strict()
  .meta({
    id: 'visMetricBarBackgroundChart',
    title: 'Bar Background Chart',
    description: 'Bar chart shown as background context behind the primary metric value.',
  });

export const complementaryVizSchemaNoESQL = z
  .union([
    barBackgroundChartSchema.extend({
      /**
       * Max value
       */
      max_value: metricOperationDefinitionSchema,
    }),
    z
      .object({
        type: z.literal('trend'),
      })
      .strict(),
  ])
  .meta({
    id: 'visMetricComplementaryViz',
    title: 'Complementary Visualization',
    description:
      'Secondary visualization displayed behind the primary metric value, either a bar chart (with optional max value) or a trend line.',
  });

export const complementaryVizSchemaESQL = z
  .union([
    barBackgroundChartSchema
      .extend({
        /**
         * Max value
         */
        max_value: esqlColumnSchema,
      })
      .meta({ id: 'visMetricComplementaryBar', title: 'Complementary Bar' }),
    z
      .object({
        type: z.literal('trend'),
      })
      .meta({ id: 'visMetricComplementaryTrend', title: 'Complementary Trend' }),
  ])
  .meta({
    id: 'visMetricComplementaryVizESQL',
    title: 'Complementary Visualization',
    description: 'Bar chart or trendline shown behind the primary metric value.',
  });

const metricConfigBackgroundChartShapeNoESQL = {
  /**
   * Complementary visualization
   */
  background_chart: complementaryVizSchemaNoESQL.optional(),
};

const metricConfigBackgroundChartShapeESQL = {
  /**
   * Complementary visualization
   */
  background_chart: complementaryVizSchemaESQL.optional(),
};

const metricStylingSchema = z
  .object({
    /**
     * Density preset for metric elements.
     * Possible values:
     * - 'compact': Compact density (original implementation)
     * - 'default': Default density with increased spacing, paddings, and sizing
     */
    density: z
      .union([z.literal('compact'), z.literal('default')])
      .default(DEFAULT_DENSITY)
      .optional()
      .meta({
        description:
          'Density preset for the metric chart layout. Use `compact` for a compact layout, or `default` for increased padding, element spacing, and font size.',
      }),
    /**
     * Icon configuration
     */
    icon: z
      .object({
        /**
         * Icon name
         */
        name: z
          .union([
            z.literal('alert'),
            z.literal('asterisk'),
            z.literal('bell'),
            z.literal('bolt'),
            z.literal('bug'),
            z.literal('compute'),
            z.literal('editor_comment'),
            z.literal('flag'),
            z.literal('globe'),
            z.literal('heart'),
            z.literal('map_marker'),
            z.literal('pin'),
            z.literal('sort_down'),
            z.literal('sort_up'),
            z.literal('star_empty'),
            z.literal('tag'),
            z.literal('temperature'),
          ])
          .meta({ description: 'Icon name' }),
        /**
         * Icon alignment. Possible values:
         * - 'right': Icon is aligned to the right
         * - 'left': Icon is aligned to the left
         */
        alignment: leftRightAlignmentSchema
          .default(DEFAULT_PRIMARY_ICON_ALIGNMENT)
          .optional()
          .meta({
            description: 'Icon alignment. Accepted values: `left`, `right`. Defaults to `right`.',
          }),
      })
      .strict()
      .optional()
      .meta({
        id: 'visMetricIconConfig',
        title: 'Icon Configuration',
        description: 'Icon configuration for the metric chart',
      }),
    primary: z
      .object({
        /**
         * Position of the primary metric value. Possible values:
         * - 'top': Value appears above the labels
         * - 'middle': Value appears between the labels
         * - 'bottom': Value appears below the labels
         */
        position: metricValuePositionSchema.default(DEFAULT_PRIMARY_POSITION).optional().meta({
          description: 'Position of the primary metric value (top, middle, or bottom).',
        }),
        /**
         * Title and subtitle text configuration for the primary metric.
         */
        labels: z
          .object({
            /**
             * Horizontal alignment for the title and subtitle text. Possible values:
             * - 'left': Align to the left
             * - 'center': Align to the center
             * - 'right': Align to the right
             */
            alignment: horizontalAlignmentSchema
              .default(DEFAULT_PRIMARY_LABELS_ALIGNMENT)
              .optional()
              .meta({
                description:
                  'Horizontal alignment for the title and subtitle text. Accepted values: `left`, `center`, `right`. Defaults to `left`.',
              }),
          })
          .strict()
          .optional()
          .meta({ description: 'Labels (title and subtitle) configuration' }),
        /**
         * Values configuration
         */
        value: z
          .object({
            /**
             * Alignment for values. Possible values:
             * - 'left': Align value to the left
             * - 'center': Align value to the center
             * - 'right': Align value to the right
             */
            alignment: horizontalAlignmentSchema
              .default(DEFAULT_PRIMARY_VALUE_ALIGNMENT)
              .optional()
              .meta({
                description:
                  'Alignment for the primary metric value. Accepted values: `left`, `center`, `right`. Defaults to `right`.',
              }),
            /**
             * Controls how the primary value text is sized within the panel.
             * - 'auto': selects a font size from predefined breakpoints based on panel height,
             *   then shrinks if the text overflows horizontally.
             * - 'fill': scales the text to be as large as possible, filling all available space.
             */
            sizing: z
              .union([z.literal('auto'), z.literal('fill')])
              .default(DEFAULT_PRIMARY_VALUE_SIZING)
              .optional()
              .meta({
                description:
                  "Controls how the primary value text is sized within the panel. 'auto' selects a font size from predefined breakpoints based on panel height, then shrinks if the text overflows horizontally. 'fill' scales the text to be as large as possible, filling all available space.",
              }),
          })
          .strict()
          .optional()
          .meta({ description: 'Primary metric value configuration' }),
      })
      .strict()
      .optional(),
    secondary: z
      .object({
        /**
         * Label configuration. The label text is the secondary metric operation name.
         */
        label: z
          .object({
            /**
             * Whether to display the label
             */
            visible: z.boolean().default(DEFAULT_SECONDARY_LABEL_VISIBLE).optional().meta({
              description: 'When `true`, displays the secondary metric name as its label.',
            }),
            /**
             * Label placement relative to the secondary metric value. Possible values:
             * - 'before': Label appears before the value
             * - 'after': Label appears after the value
             */
            placement: placementSchema.default(DEFAULT_SECONDARY_LABEL_PLACEMENT).optional().meta({
              description:
                'Label placement relative to the secondary metric value (before or after). Ignored when the label is not visible.',
            }),
          })
          .strict()
          .optional(),
        value: z
          .object({
            /**
             * Alignment for secondary values. Possible values:
             * - 'left': Align value to the left
             * - 'center': Align value to the center
             * - 'right': Align value to the right
             */
            alignment: horizontalAlignmentSchema
              .default(DEFAULT_SECONDARY_VALUE_ALIGNMENT)
              .optional()
              .meta({
                description:
                  'Alignment for secondary values. Accepted values: `left`, `center`, `right`. Defaults to `right`.',
              }),
          })
          .strict()
          .optional()
          .meta({ description: 'Secondary metric value configuration' }),
      })
      .strict()
      .optional(),
  })
  .strict()
  .meta({
    id: 'visMetricStyling',
    description: 'Visual chart styling options',
  });

const metricConfigPrimaryMetricOptionsShape = {
  // this is used to differentiate primary and secondary metrics
  // unfortunately given the lack of tuple schema support we need to have some way
  // to avoid default injection in the wrong type
  type: z.literal('primary'),
  /**
   * Subtitle
   */
  subtitle: z.string().optional().meta({ description: 'Subtitle below the primary metric value.' }),
  /**
   * Color configuration
   */
  color: z
    .union([colorByValueSchema, staticColorSchema, autoColorSchema])
    .default(AUTO_COLOR)
    .optional()
    .meta({ description: 'Color configuration for the primary metric value or background.' }),
  /**
   * Where to apply the color (background or value)
   */
  apply_color_to: applyColorToSchema.optional(),
};

const metricConfigSecondaryMetricOptionsShape = {
  // this is used to differentiate primary and secondary metrics
  // unfortunately given the lack of tuple schema support we need to have some way
  // to avoid default injection in the wrong type
  type: z.literal('secondary'),
  /**
   * Compare to
   */
  compare: z
    .union([
      compareToSchemaShared
        .extend({
          to: z.literal('baseline'),
          baseline: z.number().default(0).meta({ description: 'Baseline value.' }),
        })
        .meta({ id: 'visMetricCompareToBaseline', title: 'Compare To Baseline' }),
      compareToSchemaShared
        .extend({
          to: z.literal('primary'),
        })
        .meta({ id: 'visMetricCompareToPrimary', title: 'Compare To Primary' }),
    ])
    .optional()
    .meta({
      description: 'Compare the secondary metric to a baseline value or to the primary metric.',
    }),
  /**
   * Color configuration
   */
  color: z.union([staticColorSchema, noColorSchema]).default(NO_COLOR).optional(),
};

const metricConfigBreakdownByOptionsShape = {
  /**
   * Number of columns
   */
  columns: z
    .number()
    .default(LENS_METRIC_BREAKDOWN_DEFAULT_MAX_COLUMNS)
    .meta({ description: 'Number of columns.' }),
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

function isSecondaryMetric(
  metric: PrimaryMetricType | SecondaryMetricType
): metric is SecondaryMetricType {
  return metric.type === 'secondary';
}

function isPrimaryMetric(
  metric: PrimaryMetricType | SecondaryMetricType
): metric is PrimaryMetricType {
  return metric.type === 'primary';
}

function validateMetrics(metrics: (PrimaryMetricType | SecondaryMetricType)[]) {
  const [firstMetric, secondMetric] = metrics;
  if (secondMetric) {
    const isFirstSecondary = isSecondaryMetric(firstMetric);
    const isSecondPrimary = isPrimaryMetric(secondMetric);
    if (isFirstSecondary || isSecondPrimary) {
      return 'When two metrics are defined, the primary metric must be the first item and the secondary metric the second item.';
    }
  }
  const isFirstSecondary = isSecondaryMetric(firstMetric);
  if (isFirstSecondary) {
    return 'The first metric must be the primary metric.';
  }
}

export const primaryMetricSchemaNoESQL = getMetricsWithChartDimensionSchemaWithRefBasedOps(
  'metricPrimary'
).and(
  z.object({
    ...metricConfigPrimaryMetricOptionsShape,
    ...metricConfigBackgroundChartShapeNoESQL,
  })
);

const secondaryMetricSchemaNoESQL = getMetricsWithChartDimensionSchemaWithRefBasedOps(
  'metricSecondary'
).and(z.object(metricConfigSecondaryMetricOptionsShape));

export const metricConfigSchemaNoESQL = z
  .object({
    type: z.literal('metric'),
    ...sharedPanelInfoSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    styling: metricStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation.
     */
    metrics: z
      .array(z.union([primaryMetricSchemaNoESQL, secondaryMetricSchemaNoESQL]))
      .min(1)
      .max(2)
      .superRefine((metrics, ctx) => {
        const msg = validateMetrics(metrics);
        if (msg) {
          ctx.addIssue({ code: 'custom', message: msg });
        }
      })
      .meta({
        description:
          'Metric dimensions to display. The first must be a primary metric; an optional second must be a secondary metric.',
      }),
    /**
     * Configure how to break down the metric (e.g. show one metric per term).
     */
    breakdown_by: getBucketsWithChartDimensionSchema('metricBreakdown')
      .and(z.object(metricConfigBreakdownByOptionsShape))
      .optional(),
  })
  .superRefine(({ metrics, breakdown_by }, ctx) => {
    const primaryMetric = metrics.find((metric) => isPrimaryMetric(metric));

    if (primaryMetric?.color?.type === 'dynamic' && primaryMetric.color.range === 'percentage') {
      if (!breakdown_by && !(primaryMetric.background_chart?.type === 'bar')) {
        ctx.addIssue({
          code: 'custom',
          message:
            'When using percentage-based dynamic coloring, a breakdown dimension or max must be defined.',
        });
      }
    }
  })
  .meta({
    id: 'visMetricNoESQL',
    title: 'Metric Chart (DSL)',
    description: 'Metric chart configuration for standard queries',
  });

const primaryMetricESQL = esqlColumnWithFormatSchema
  .extend(metricConfigPrimaryMetricOptionsShape)
  .extend(metricConfigBackgroundChartShapeESQL);

const secondaryMetricESQL = esqlColumnWithFormatSchema.extend(
  metricConfigSecondaryMetricOptionsShape
);

export const metricConfigSchemaESQL = z
  .object({
    type: z.literal('metric'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    styling: metricStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation.
     */
    metrics: z
      .array(z.union([primaryMetricESQL, secondaryMetricESQL]))
      .min(1)
      .max(2)
      .superRefine((metrics, ctx) => {
        const msg = validateMetrics(metrics);
        if (msg) {
          ctx.addIssue({ code: 'custom', message: msg });
        }
      })
      .meta({
        description:
          'Metric dimensions to display. The first must be a primary metric; an optional second must be a secondary metric.',
      }),
    /**
     * Configure how to break down the metric (e.g. show one metric per term).
     */
    breakdown_by: esqlColumnWithFormatSchema
      .extend(metricConfigBreakdownByOptionsShape)
      .strict()
      .optional(),
  })
  .superRefine(({ metrics, breakdown_by }, ctx) => {
    const primaryMetric = metrics.find((metric) => isPrimaryMetric(metric));

    if (primaryMetric?.color?.type === 'dynamic' && primaryMetric.color.range === 'percentage') {
      if (!breakdown_by && !(primaryMetric.background_chart?.type === 'bar')) {
        ctx.addIssue({
          code: 'custom',
          message:
            'When using percentage-based dynamic coloring, a breakdown dimension or max must be defined.',
        });
      }
    }
  })
  .meta({
    id: 'visMetricESQL',
    title: 'Metric Chart (ES|QL)',
    description: 'Metric chart configuration for ES|QL queries',
  });

export const metricConfigSchema = z.union([metricConfigSchemaNoESQL, metricConfigSchemaESQL]).meta({
  id: 'visMetricChart',
  title: 'Metric Chart',
  description:
    'One or two metric values with optional color coding, trend line, and breakdown by dimension.',
});

export type MetricConfig = z.output<typeof metricConfigSchema>;
export type MetricConfigInput = z.input<typeof metricConfigSchema>;
export type MetricConfigNoESQL = z.output<typeof metricConfigSchemaNoESQL>;
export type MetricConfigESQL = z.output<typeof metricConfigSchemaESQL>;

export type PrimaryMetricType =
  | z.output<typeof primaryMetricSchemaNoESQL>
  | z.output<typeof primaryMetricESQL>;
export type SecondaryMetricType =
  | z.output<typeof secondaryMetricSchemaNoESQL>
  | z.output<typeof secondaryMetricESQL>;
