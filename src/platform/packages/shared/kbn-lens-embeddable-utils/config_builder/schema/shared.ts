/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { asCodeFilterSchema } from '@kbn/as-code-filters-schema';
import {
  LENS_SAMPLING_MIN_VALUE,
  LENS_SAMPLING_MAX_VALUE,
  LENS_SAMPLING_DEFAULT_VALUE,
  LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE,
} from './constants';
import { filterSchema } from './filter';
import { positionSchema } from './alignments';

export const labelSharedSchema = z
  .object({
    /**
     * Label for the operation
     */
    label: z.string().optional().meta({
      description: 'Label for the operation',
    }),
  })
  .strict();

export const sharedPanelInfoSchema = z
  .object({
    /**
     * The title of the chart displayed in the panel.
     *
     * Optional. If not provided, the chart will not have a title.
     *
     * Possible values: Any string value, or undefined if omitted.
     */
    title: z.string().optional().meta({
      description:
        'The title of the chart displayed in the panel. Optional. Any string value or undefined.',
    }),
    /**
     * The description of the chart, providing additional context or information.
     *
     * Optional. If not provided, the chart will not have a description.
     *
     * Possible values: Any string value, or undefined if omitted.
     */
    description: z.string().optional().meta({
      description: 'The description of the chart. Optional. Any string value or undefined.',
    }),
    filters: z.array(asCodeFilterSchema).max(100).optional().meta({
      id: 'visPanelFilters',
      description: 'Filters applied to the panel',
    }),
  })
  .strict();

export const dslOnlyPanelInfoSchema = z
  .object({
    // ES|QL chart should not have the ability to define a KQL/Lucene query
    query: filterSchema.optional(),
  })
  .strict();

const ignoringGlobalFiltersShape = {
  /**
   * Whether to ignore global filters when fetching data for this layer.
   *
   * If true, global filters (such as those set in the dashboard or application context) will be ignored for this layer.
   * If false, global filters will be applied.
   *
   * Default: false
   * Possible values: boolean (true or false)
   */
  ignore_global_filters: z.boolean().default(LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE).meta({
    description:
      'When `true`, ignores global filters when fetching data for this layer. Defaults to `false`.',
  }),
};

export const ignoringGlobalFiltersSchema = z.object(ignoringGlobalFiltersShape).strict();

export const layerSettingsSchema = z
  .object({
    /**
     * The sampling factor for the data source.
     *
     * Determines the proportion of the data source to be used. Must be a number between 0 and 1 (inclusive).
     * - 0: No sampling (use none of the data)
     * - 1: Full sampling (use all data)
     * - Any value between 0 and 1: Use that proportion of the data
     *
     * Default: 1
     * Possible values: number (0 <= value <= 1)
     */
    sampling: z
      .number()
      .min(LENS_SAMPLING_MIN_VALUE)
      .max(LENS_SAMPLING_MAX_VALUE)
      .default(LENS_SAMPLING_DEFAULT_VALUE)
      .meta({
        description: 'Sampling factor between 0 (no sampling) and 1 (full sampling).',
      }),
    ...ignoringGlobalFiltersShape,
  })
  .strict();

export const collapseBySchema = z
  .union([
    /**
     * Average collapsed by average function
     */
    z.literal('avg'),
    /**
     * Sum collapsed by sum function
     */
    z.literal('sum'),
    /**
     * Max collapsed by max function
     */
    z.literal('max'),
    /**
     * Min collapsed by min function
     */
    z.literal('min'),
  ])
  .meta({
    id: 'visCollapseBy',
    description: 'Aggregation function used to collapse a breakdown dimension into a single value.',
  });

export type CollapseBySchema = z.output<typeof collapseBySchema>;

export type LayerSettingsSchema = z.output<typeof layerSettingsSchema>;

export const axisTitleSchema = z
  .object({
    text: z.string().optional().meta({ description: 'Axis title text.' }),
    visible: z.boolean().optional().meta({ description: 'When `true`, displays the title.' }),
  })
  .strict();

export const legendTruncateAfterLinesSchema = z.number().min(1).max(10).default(1).optional().meta({
  description: 'Number of lines before legend items are truncated.',
  id: 'visLegendTruncateAfterLines',
});

export const legendPositionSchema = positionSchema.default('right').optional().meta({
  id: 'visLegendPosition',
  title: 'Legend Position',
  description: 'Legend Position.',
});
