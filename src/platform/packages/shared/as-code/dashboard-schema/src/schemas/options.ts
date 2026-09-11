/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { DEFAULT_DASHBOARD_OPTIONS } from '../constants';

export const optionsSchema = z
  .object({
    auto_apply_filters: z.boolean().default(DEFAULT_DASHBOARD_OPTIONS.auto_apply_filters).meta({
      description:
        "When `true`, control filter changes are applied automatically. When `false`, control filter changes are applied manually through the dashboard's search update button. Defaults to `true`.",
    }),
    hide_panel_titles: z
      .boolean()
      .default(DEFAULT_DASHBOARD_OPTIONS.hide_panel_titles)
      .meta({ description: 'When `true`, panel titles are hidden. Defaults to `false`.' }),
    hide_panel_borders: z
      .boolean()
      .default(DEFAULT_DASHBOARD_OPTIONS.hide_panel_borders)
      .meta({ description: 'When `true`, panel borders are hidden. Defaults to `false`.' }),
    use_margins: z
      .boolean()
      .default(DEFAULT_DASHBOARD_OPTIONS.use_margins)
      .meta({ description: 'When `true`, panels are separated by a margin. Defaults to `true`.' }),
    sync_colors: z.boolean().default(DEFAULT_DASHBOARD_OPTIONS.sync_colors).meta({
      description:
        'When `true`, colors are synchronized across panels that share a data source. Defaults to `false`.',
    }),
    sync_tooltips: z.boolean().default(DEFAULT_DASHBOARD_OPTIONS.sync_tooltips).meta({
      description: 'When `true`, tooltips are synchronized across panels. Defaults to `false`.',
    }),
    sync_cursor: z.boolean().default(DEFAULT_DASHBOARD_OPTIONS.sync_cursor).meta({
      description:
        'When `true`, the cursor position is synchronized across panels. Defaults to `true`.',
    }),
  })
  .strict()
  .default(DEFAULT_DASHBOARD_OPTIONS)
  .meta({
    id: 'kbn-dashboard-options',
    title: 'Options',
    description: 'Display and behavior settings for the dashboard.',
  });
