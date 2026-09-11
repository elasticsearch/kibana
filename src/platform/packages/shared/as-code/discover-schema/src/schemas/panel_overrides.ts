/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { DataGridDensity } from '@kbn/discover-session-constants';
import { columnSettingsEntrySchema, jsonModeSettingsSchema, sortSchema } from './data_table';

export const panelOverridesSchema = z
  .object({
    column_order: z
      .array(z.string().meta({ description: 'Field name of a column in display order.' }))
      .max(100)
      .optional()
      .meta({
        description:
          'When set, overrides column order for the data table relative to the referenced saved object (`ref_id`) or the inline tab in `tabs`. If omitted, the source configuration is used.',
      }),
    column_settings: z.record(z.string(), columnSettingsEntrySchema).optional().meta({
      description:
        'Per-column presentation overrides (e.g. widths) keyed by field name. When set, merges with the source configuration for the referenced session or inline tab.',
    }),
    sort: z.array(sortSchema).max(100).optional().meta({
      description:
        'Sort configuration (field and direction) for the data table. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
    }),
    density: z
      .union([
        z.literal(DataGridDensity.COMPACT),
        z.literal(DataGridDensity.EXPANDED),
        z.literal(DataGridDensity.NORMAL),
      ])
      .optional()
      .meta({
        description:
          'Data grid row spacing: `compact`, `expanded`, or `normal`. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
      }),
    header_row_height: z
      .union([z.number().min(1).max(5), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Header row height: number (1–5) or `auto`. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
      }),
    row_height: z
      .union([z.number().min(1).max(20), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Data row height: number (1–20) or `auto`. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:rowHeightOption".',
      }),
    rows_per_page: z.number().min(1).max(10000).optional().meta({
      description:
        'Number of rows per page. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:sampleRowsPerPage".',
    }),
    sample_size: z.number().min(10).max(10000).optional().meta({
      description:
        'Number of documents to sample. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:sampleSize".',
    }),
    documents_display_mode: z
      .union([z.literal('table'), z.literal('json')])
      .optional()
      .meta({
        description:
          'Documents display mode: "table" for the formatted summary, or "json" for the raw JSON tree. When set, overrides the referenced saved object or the inline tab config in `tabs`.',
      }),
    json_mode_settings: jsonModeSettingsSchema,
  })
  .strict()
  .default({});
