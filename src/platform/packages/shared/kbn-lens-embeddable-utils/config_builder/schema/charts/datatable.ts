/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { DEFAULT_HEADER_ROW_HEIGHT_LINES, DEFAULT_ROW_HEIGHT_LINES } from '@kbn/lens-common';
import { esqlColumnWithFormatSchema } from '../metric_ops';
import {
  applyColorToSchema,
  colorByValueSchema,
  colorMappingSchema,
  autoColorSchema,
  AUTO_COLOR,
} from '../color';
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import {
  collapseBySchema,
  dslOnlyPanelInfoSchema,
  layerSettingsSchema,
  sharedPanelInfoSchema,
} from '../shared';
import {
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
  getBucketsWithChartDimensionSchema,
} from './shared';
import { horizontalAlignmentSchema } from '../alignments';
import { bucketOperationDefinitionSchema } from '../bucket_ops';
import { directionSchema } from '../enums';

/**
 * Datatable supports an additional "badge" mode (render colored values as badges),
 * so it uses a datatable-specific schema rather than the shared applyColorToSchema.
 */
const applyColorToDatatableSchema = z.union([applyColorToSchema, z.literal('badge')]).meta({
  description:
    'Column color target: `value` for cell text, `background` for cell background, or `badge` for a badge overlay.',
});

/**
 * Sorting configuration for the datatable. Only one column can be sorted at a time.
 */
const sortingSchema = z
  .union([
    z
      .object({
        column_type: z
          .union([z.literal('metric'), z.literal('row')])
          .meta({ description: 'Type of column to sort by.' }),
        index: z
          .number()
          .min(0)
          .meta({ description: 'Index of the column or row to sort by (0-based).' }),
        direction: directionSchema.meta({ description: 'Sort direction.' }),
      })
      .strict()
      .meta({ description: 'Sort by a metric or row column' }),
    z
      .object({
        column_type: z.literal('pivoted_metric'),
        index: z.number().min(0).meta({
          description:
            '0-based index into the "metrics" array for the metric to sort; use "values" to identify the pivoted column',
        }),
        values: z.array(z.string()).min(1).max(20).meta({
          description: 'Array of pivot values, one for each split_metrics_by column in order',
        }),
        direction: directionSchema.meta({ description: 'Sort direction.' }),
      })
      .strict()
      .meta({
        description:
          'Sort by a pivoted metric column (created when metrics are pivoted by split_metrics_by)',
      }),
  ])
  .meta({
    description:
      'Sorting configuration. Only one column can be sorted at a time. Use "column_type" to specify the column type.',
  });

const datatableStylingSchema = z
  .object({
    /**
     * Density  configuration
     */
    density: z
      .object({
        /**
         * Density mode
         */
        mode: z
          .union([z.literal('compact'), z.literal('default'), z.literal('expanded')])
          .default('default')
          .optional()
          .meta({ description: 'Display density mode.' }),
        /**
         * Height configuration
         */
        height: z
          .object({
            header: z
              .union([
                z.object({ type: z.literal('auto') }).strict(),
                z
                  .object({
                    type: z.literal('custom'),
                    max_lines: z.number().min(1).max(5).default(DEFAULT_HEADER_ROW_HEIGHT_LINES),
                  })
                  .strict(),
              ])
              .optional()
              .meta({
                description: 'Number of lines before the header is truncated.',
              }),
            value: z
              .union([
                z.object({ type: z.literal('auto') }).strict(),
                z
                  .object({
                    type: z.literal('custom'),
                    lines: z.number().min(1).max(20).default(DEFAULT_ROW_HEIGHT_LINES),
                  })
                  .strict(),
              ])
              .optional()
              .meta({
                description: 'Number of lines to display per table body cell.',
              }),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional()
      .meta({
        id: 'visDatatableDensity',
        description: 'Density configuration for the datatable.',
      }),
    /**
     * Paging configuration
     */
    paging: z
      .union([z.literal(10), z.literal(20), z.literal(30), z.literal(50), z.literal(100)])
      .optional()
      .meta({
        description:
          'Rows per page. When set, pagination is enabled with the specified number of rows.',
      }),
    /**
     * Sorting configuration
     */
    sort_by: sortingSchema.optional(),
    /**
     * Show row numbers
     */
    row_numbers: z
      .object({
        visible: z.boolean().meta({ description: 'When `true`, displays row numbers.' }),
      })
      .strict()
      .optional()
      .meta({
        description: 'Configuration for row numbers',
      }),
  })
  .strict()
  .meta({
    id: 'visDatatableStyling',
    title: 'Datatable styling',
    description: 'Visual chart styling options',
  });

const datatableConfigCommonOptionsSchema = z
  .object({
    /**
     * Where to apply the color (background, value or badge)
     */
    apply_color_to: applyColorToDatatableSchema.optional(),
    /**
     * Show the column
     */
    visible: z
      .boolean()
      .default(true)
      .optional()
      .meta({ description: 'When `false`, hides the column from the datatable.' }),
    /**
     * Column width in pixels
     */
    width: z.number().min(0).optional().meta({ description: 'Column width in pixels.' }),
  })
  .strict();

const datatableConfigRowsOptionsNoESQLSchema = datatableConfigCommonOptionsSchema.extend({
  /**
   * Alignment of the rows
   */
  alignment: horizontalAlignmentSchema.default('left').optional().meta({
    description: 'Alignment of the rows.',
  }),
  /**
   * Color configuration
   */
  color: z.union([colorMappingSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
  /**
   * Whether to enable the one click filter
   */
  click_filter: z
    .boolean()
    .default(false)
    .optional()
    .meta({ description: 'When `true`, enables one-click filtering on cell values.' }),
  /**
   * Collapse by function. This parameter is used to collapse the
   * metric chart when the number of columns is bigger than the
   * number of columns specified in the columns parameter.
   */
  collapse_by: collapseBySchema.optional(),
});

const datatableConfigRowsOptionsESQLSchema = datatableConfigRowsOptionsNoESQLSchema.extend({
  /**
   * Color configuration
   */
  color: z
    .union([colorByValueSchema, colorMappingSchema, autoColorSchema])
    .default(AUTO_COLOR)
    .optional()
    .meta({
      description:
        'Color configuration for ESQL datatable rows. Use dynamic coloring for numeric data and categorical/gradient mode for categorical data.',
    }),
});

const datatableConfigMetricsOptionsSchema = datatableConfigCommonOptionsSchema.extend({
  /**
   * Color configuration
   */
  color: z
    .union([colorByValueSchema, colorMappingSchema, autoColorSchema])
    .default(AUTO_COLOR)
    .optional()
    .meta({
      description:
        'Color configuration for datatable metrics. Use dynamic coloring for numeric data and categorical/gradient mode for categorical data.',
    }),
  /**
   * Alignment of the columns
   */
  alignment: horizontalAlignmentSchema.default('right').optional().meta({
    description: 'Alignment of the columns.',
  }),
  /**
   * Summary configuration
   */
  summary: z
    .object({
      type: z
        .union([
          z.literal('sum'),
          z.literal('avg'),
          z.literal('count'),
          z.literal('min'),
          z.literal('max'),
        ])
        .meta({ description: 'Type of summary function to apply to the column.' }),
      label: z.string().optional().meta({ description: 'Summary row label.' }),
    })
    .strict()
    .optional()
    .meta({ description: 'Summary row configuration' }),
});

interface SortByValidationInput {
  metrics?: Array<{}>;
  rows?: Array<{}>;
  split_metrics_by?: Array<{}>;
  styling?: {
    sort_by?: {
      column_type: 'metric' | 'row' | 'pivoted_metric';
      index?: number;
      values?: string[];
    };
  };
}

function validateSortBy({
  metrics,
  rows,
  split_metrics_by,
  styling,
}: SortByValidationInput): string | undefined {
  if (!styling?.sort_by) {
    return;
  }

  const { column_type, index, values } = styling.sort_by;

  const numberOfMetrics = metrics?.length ?? 0;

  if (column_type === 'metric') {
    if (index == null || index >= numberOfMetrics) {
      return `The 'sort_by.index' (${index}) is out of bounds. The 'metrics' array has ${numberOfMetrics} item(s).`;
    }
  }

  if (column_type === 'row') {
    if (!rows || rows.length === 0) {
      return `Cannot sort by 'row' when no rows are defined.`;
    }

    if (index == null || index >= rows.length) {
      return `The 'sort_by.index' (${index}) is out of bounds. The 'rows' array has ${rows.length} item(s).`;
    }
  }

  if (column_type === 'pivoted_metric') {
    if (!split_metrics_by || split_metrics_by.length === 0) {
      return `Cannot sort by 'pivoted_metric' when no split_metrics_by columns are defined.`;
    }

    if (index == null || index >= numberOfMetrics) {
      return `The 'sort_by.index' (${index}) is out of bounds. The 'metrics' array has ${numberOfMetrics} item(s).`;
    }

    if (values == null || values.length !== split_metrics_by.length) {
      return `The 'sort_by.values' length (${values?.length}) must match the 'split_metrics_by' length (${split_metrics_by.length}).`;
    }
  }
}

export const datatableConfigSchemaNoESQL = z
  .object({
    type: z.literal('data_table'),
    ...sharedPanelInfoSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    styling: datatableStylingSchema.optional(),
    /**
     * Metric columns configuration, must define operation.
     */
    metrics: z
      .array(
        getMetricsWithChartDimensionSchemaWithRefBasedOps('datatableMetric').and(
          datatableConfigMetricsOptionsSchema
        )
      )
      .min(1)
      .max(1000)
      .meta({ description: 'Array of metrics to display as columns in the datatable' }),
    /**
     * Row configuration, optional bucket operations.
     */
    rows: z
      .array(
        getBucketsWithChartDimensionSchema('datatableRow').and(
          datatableConfigRowsOptionsNoESQLSchema
        )
      )
      .min(1)
      .max(50)
      .optional()
      .meta({ description: 'Array of operations to split the datatable rows by' }),
    /**
     * Split metrics by configuration, optional bucket operations.
     */
    split_metrics_by: z
      .array(bucketOperationDefinitionSchema)
      .min(1)
      .max(20)
      .optional()
      .meta({ description: 'Array of operations to split the metric columns by' }),
  })
  .superRefine((data, ctx) => {
    const msg = validateSortBy(data);
    if (msg) {
      ctx.addIssue({ code: 'custom', message: msg });
    }
  })
  .meta({
    id: 'visDatatableNoESQL',
    title: 'Datatable (DSL)',
    description: 'Datatable state configuration for standard queries',
  });

export const datatableConfigSchemaESQL = z
  .object({
    type: z.literal('data_table'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    styling: datatableStylingSchema.optional(),
    /**
     * Metric columns configuration, must define operation.
     */
    metrics: z
      .array(
        esqlColumnWithFormatSchema.extend(datatableConfigMetricsOptionsSchema.shape).meta({
          id: 'visDatatableESQLMetric',
          title: 'Datatable Metric (ES|QL)',
        })
      )
      .min(1)
      .max(1000)
      .optional()
      .meta({ description: 'Array of metrics to display as columns in the datatable' }),
    /**
     * Row configuration, optional operations.
     */
    rows: z
      .array(esqlColumnWithFormatSchema.extend(datatableConfigRowsOptionsESQLSchema.shape))
      .min(1)
      .max(50)
      .optional()
      .meta({ description: 'Array of operations to split the datatable rows by' }),
    /**
     * Split metrics by configuration, optional operations.
     */
    split_metrics_by: z
      .array(esqlColumnWithFormatSchema)
      .min(1)
      .max(20)
      .optional()
      .meta({ description: 'Array of operations to split the metric columns by' }),
  })
  .superRefine((data, ctx) => {
    const sortByError = validateSortBy(data);
    if (sortByError) {
      ctx.addIssue({ code: 'custom', message: sortByError });
      return;
    }

    const { metrics, rows } = data;

    if (!metrics && !rows) {
      ctx.addIssue({
        code: 'custom',
        message: 'Datatable must have at least one column',
      });
    }
  })
  .meta({
    id: 'visDatatableESQL',
    title: 'Datatable (ES|QL)',
    description: 'Datatable state configuration for ES|QL queries',
  });

export const datatableConfigSchema = z
  .union([datatableConfigSchemaNoESQL, datatableConfigSchemaESQL])
  .meta({
    id: 'visDatatableChart',
    title: 'Datatable',
    description: 'Datatable chart configuration: DSL or ES|QL query based',
  });

export type DatatableConfig = z.output<typeof datatableConfigSchema>;
export type DatatableConfigInput = z.input<typeof datatableConfigSchema>;
export type DatatableConfigNoESQL = z.output<typeof datatableConfigSchemaNoESQL>;
export type DatatableConfigESQL = z.output<typeof datatableConfigSchemaESQL>;
