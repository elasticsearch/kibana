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

export const columnSettingsEntrySchema = z
  .object({
    width: z.number().min(0).optional().meta({
      description: 'Optional width of the column in pixels.',
    }),
  })
  .strict();

export const sortSchema = z
  .object({
    name: z.string().meta({
      description: 'The name of the field to sort by.',
    }),
    direction: z.enum(['asc', 'desc']).meta({
      description:
        'The direction to sort the field by: Use "asc" for ascending or "desc" for descending.',
    }),
  })
  .strict();

export const jsonModeSettingsSchema = z
  .object({
    hide_nulls: z.boolean().optional().meta({
      description: 'When true, fields with null values are hidden while in JSON mode.',
    }),
    wrap_lines: z.boolean().optional().meta({
      description:
        'When false, long values are truncated to a single line instead of wrapping while in JSON mode.',
    }),
    default_rendered_nodes: z.number().min(10).max(200).optional().meta({
      description: 'How many rows each JSON cell renders by default while in JSON mode.',
    }),
  })
  .strict()
  .optional()
  .meta({
    description:
      'Settings that only apply when the source column is displayed in JSON mode (`documents_display_mode: "json"`).',
  });

export const dataTableLimitsSchema = z
  .object({
    rows_per_page: z.number().min(1).max(10000).optional().meta({
      description:
        'The number of rows to display per page in the data table. If omitted, defaults to the advanced setting "discover:sampleRowsPerPage".',
    }),
    sample_size: z.number().min(10).max(10000).optional().meta({
      description:
        'The number of documents to sample for the data table. If omitted, defaults to the advanced setting "discover:sampleSize".',
    }),
  })
  .strict()
  .meta({ id: 'discoverSessionEmbeddableDataTableLimitsSchema' });

export const dataTableSchema = z
  .object({
    column_order: z
      .array(z.string().meta({ description: 'Field name of a column in display order.' }))
      .max(100)
      .optional()
      .meta({
        description:
          'Ordered list of field names to display in the data table. If omitted, defaults to the advanced setting "defaultColumns" or the referenced saved object.',
      }),
    column_settings: z.record(z.string(), columnSettingsEntrySchema).optional().meta({
      description:
        'Per-column presentation settings keyed by field name (e.g. widths). Keys should correspond to entries in `column_order` when both are set.',
    }),
    sort: z.array(sortSchema).max(100).default([]).meta({
      description: 'Sort configuration for the data table (field and direction).',
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
          'Data grid density. Choose "compact", "expanded", or "normal" for row spacing. If omitted, Discover or the embedding application determines the density from its current settings, such as the user preference.',
      }),
    header_row_height: z
      .union([z.number().min(1).max(5), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Header row height. Use a number (1–5) or "auto" to size based on content. If omitted, Discover or the embedding application determines the height from its current settings, such as the user preference.',
      }),
    row_height: z
      .union([z.number().min(1).max(20), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Data row height. Use a number (1–20) or "auto" to size based on content. If omitted, defaults to the advanced setting "discover:rowHeightOption".',
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
  .meta({ id: 'discoverSessionEmbeddableDataTableSchema' });
