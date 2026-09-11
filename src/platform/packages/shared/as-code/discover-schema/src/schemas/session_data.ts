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
  asCodeEsqlApproximationSchema,
  asCodeIdSchema,
  getAsCodeTagsSchema,
} from '@kbn/as-code-shared-schemas';
import { refreshIntervalSchema } from '@kbn/data-service-server';
import { timeRangeSchema } from '@kbn/es-query-server';
import {
  MAX_DISCOVER_SESSION_TABS,
  MAX_SESSION_TITLE_LENGTH,
  MAX_SESSION_DESCRIPTION_LENGTH,
  MAX_TAB_LABEL_LENGTH,
  MAX_BREAKDOWN_FIELD_LENGTH,
  MAX_DISCOVER_SESSION_TAGS,
  DiscoverTabType,
} from '@kbn/discover-session-constants';
import { classicTabSchema, esqlTabSchema } from './tab';
import { visContextSchema } from './vis_context';
import { discoverSessionControlPanelsSchema } from './control_panel';
import { discoverSessionMetricsTabTypeStateSchema } from './metrics_tab';

const discoverSessionTabPresentationSchema = z
  .object({
    hide_chart: z
      .boolean()
      .default(false)
      .meta({ description: 'When `true`, the chart is hidden.' }),
    hide_table: z
      .boolean()
      .default(false)
      .meta({ description: 'When `true`, the data table is hidden.' }),
    hide_aggregated_preview: z
      .boolean()
      .optional()
      .meta({ description: 'When `true`, aggregated preview panels are hidden.' }),
    breakdown_field: z
      .string()
      .max(MAX_BREAKDOWN_FIELD_LENGTH)
      .optional()
      .meta({ description: 'Field name used to split chart data into series.' }),
    chart_interval: z
      .union([
        z.literal('auto'),
        z.literal('ms'),
        z.literal('s'),
        z.literal('m'),
        z.literal('h'),
        z.literal('d'),
        z.literal('w'),
        z.literal('M'),
        z.literal('y'),
      ])
      .optional()
      .meta({
        description: 'Time interval for the chart histogram on this tab.',
      }),
    time_range: timeRangeSchema.optional().meta({
      description:
        'Time range to restore when the tab is opened. When omitted, Discover uses the global time settings.',
    }),
    refresh_interval: refreshIntervalSchema.optional().meta({
      description:
        'Refresh interval associated with this tab. It can be stored independently; the presence of `time_range` controls whether the time settings are restored.',
    }),
    vis_context: visContextSchema.optional(),
    control_panels: discoverSessionControlPanelsSchema.optional(),
  })
  .strict();

const discoverSessionTabIdentitySchema = z
  .object({
    id: asCodeIdSchema,
    label: z.string().max(MAX_TAB_LABEL_LENGTH).meta({ description: 'Tab label.' }),
  })
  .strict();

export const discoverSessionDefaultTabTypeStateSchema = z
  .object({
    type: z
      .literal(`${DiscoverTabType.Default}`)
      .default(DiscoverTabType.Default)
      .meta({
        description:
          'A tab with no type-specific saved state. ' +
          'If `type` is omitted, it defaults to `default`. Responses always include `type`.',
      }),
  })
  .strict();

export const discoverSessionClassicTabSchema = z
  .object({
    ...discoverSessionTabIdentitySchema.shape,
    ...classicTabSchema.shape,
    ...discoverSessionTabPresentationSchema.shape,
    ...discoverSessionDefaultTabTypeStateSchema.shape,
  })
  .strict();

export const discoverSessionEsqlTabSchema = z
  .object({
    ...discoverSessionTabIdentitySchema.shape,
    ...esqlTabSchema.shape,
    ...discoverSessionTabPresentationSchema.shape,
    ...asCodeEsqlApproximationSchema.shape,
    ...discoverSessionDefaultTabTypeStateSchema.shape,
  })
  .strict();

export const discoverSessionMetricsTabSchema = discoverSessionEsqlTabSchema
  .extend(discoverSessionMetricsTabTypeStateSchema.shape)
  .meta({
    title: 'Metrics tab',
    description: 'An ES|QL tab with saved metrics grid settings.',
  });

export const discoverSessionApiTabSchema = z
  .union([
    discoverSessionClassicTabSchema,
    discoverSessionEsqlTabSchema,
    discoverSessionMetricsTabSchema,
  ])
  .meta({
    description:
      'A Discover tab definition. `data_source.type` identifies the data source; `type` identifies the tab type. ' +
      'The tab type describes saved state and does not select the active Discover experience. ' +
      'Default tabs support data views and ES|QL; metrics tabs support only ES|QL.',
  });

export const discoverSessionApiDataSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .max(MAX_SESSION_TITLE_LENGTH)
      .meta({ description: 'Discover session title.' }),
    description: z
      .string()
      .max(MAX_SESSION_DESCRIPTION_LENGTH)
      .default('')
      .meta({ description: 'Discover session description.' }),
    tags: getAsCodeTagsSchema(
      'Tag IDs to associate with this Discover session.',
      MAX_DISCOVER_SESSION_TAGS
    ).optional(),
    tabs: z
      .array(discoverSessionApiTabSchema)
      .min(1)
      .max(MAX_DISCOVER_SESSION_TABS)
      .refine(
        (tabs) => new Set(tabs.map((t) => t.id)).size === tabs.length,
        'tabs must have unique ids'
      )
      .meta({
        description:
          'Ordered list of tabs in the Discover session. Each tab requires a stable, unique ID because Dashboard panels and Discover links can reference it.',
      }),
  })
  .strict()
  .meta({
    id: 'kbn-discover-session-data',
    title: 'Discover session data',
    description: 'Configuration data for a Discover session.',
  });
