/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { LENS_TAGCLOUD_DEFAULT_STATE } from '@kbn/lens-common';
import { esqlColumnWithFormatSchema } from '../metric_ops';
import { colorMappingSchema } from '../color';
import { dataSourceSchema, dataSourceEsqlTableSchema } from '../data_source';
import { dslOnlyPanelInfoSchema, layerSettingsSchema, sharedPanelInfoSchema } from '../shared';
import { orientationSchema } from '../enums';
import {
  getBucketsWithChartDimensionSchema,
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
} from './shared';

const tagcloudConfigTagsByOptionsShape = {
  /**
   * Color configuration
   */
  color: colorMappingSchema.optional(),
};

const tagcloudStylingSchema = z
  .object({
    orientation: orientationSchema.default('horizontal').optional().meta({
      description: 'Orientation of the tagcloud.',
    }),
    font_size: z
      .object({
        min: z
          .number()
          .min(1)
          .default(LENS_TAGCLOUD_DEFAULT_STATE.minFontSize)
          .meta({ description: 'Minimum font size.' }),
        max: z
          .number()
          .max(120)
          .default(LENS_TAGCLOUD_DEFAULT_STATE.maxFontSize)
          .meta({ description: 'Maximum font size.' }),
      })
      .strict()
      .optional()
      .meta({ description: 'Font size range for tags.' }),
    /**
     * Show the metric caption
     */
    caption: z
      .object({
        visible: z
          .boolean()
          .default(LENS_TAGCLOUD_DEFAULT_STATE.showCaption)
          .meta({ description: 'When `true`, displays the caption.' }),
      })
      .strict()
      .optional()
      .meta({
        description:
          'Caption configuration representing the metric and the tag_by operations labels',
      }),
  })
  .strict()
  .meta({
    id: 'visTagcloudStyling',
    title: 'Tag cloud styling',
    description: 'Visual chart styling options',
  });

export const tagcloudConfigSchemaNoESQL = z
  .object({
    type: z.literal('tag_cloud'),
    ...sharedPanelInfoSchema.shape,
    ...dslOnlyPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    styling: tagcloudStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation.
     */
    metric: getMetricsWithChartDimensionSchemaWithRefBasedOps('tagcloudMetric'),
    /**
     * Configure how to break down to tags
     */
    tag_by: getBucketsWithChartDimensionSchema('tagcloudTag').and(
      z.object(tagcloudConfigTagsByOptionsShape)
    ),
  })
  .meta({
    id: 'visTagcloudNoESQL',
    title: 'Tag Cloud Chart (DSL)',
    description: 'Tag Cloud configuration using a data view.',
  });

export const tagcloudConfigSchemaESQL = z
  .object({
    type: z.literal('tag_cloud'),
    ...sharedPanelInfoSchema.shape,
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    styling: tagcloudStylingSchema.optional(),
    /**
     * Primary value configuration, must define operation.
     */
    metric: esqlColumnWithFormatSchema,
    /**
     * Configure how to break down the metric (e.g. show one metric per term).
     */
    tag_by: esqlColumnWithFormatSchema.extend(tagcloudConfigTagsByOptionsShape),
  })
  .meta({
    id: 'visTagcloudESQL',
    title: 'Tag Cloud Chart (ES|QL)',
    description: 'Tag Cloud configuration using an ES|QL query.',
  });

export const tagcloudConfigSchema = z
  .union([tagcloudConfigSchemaNoESQL, tagcloudConfigSchemaESQL])
  .meta({
    id: 'visTagcloudChart',
    title: 'Tag Cloud Chart',
    description: 'A word cloud with terms sized by metric value.',
  });

export type TagcloudConfig = z.output<typeof tagcloudConfigSchema>;
export type TagcloudConfigInput = z.input<typeof tagcloudConfigSchema>;
export type TagcloudConfigNoESQL = z.output<typeof tagcloudConfigSchemaNoESQL>;
export type TagcloudConfigESQL = z.output<typeof tagcloudConfigSchemaESQL>;
