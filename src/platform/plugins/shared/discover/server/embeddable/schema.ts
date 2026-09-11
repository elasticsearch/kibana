/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { DataGridDensity } from '@kbn/discover-utils';
import { asCodeQuerySchema } from '@kbn/as-code-shared-schemas';
import { esqlDataSourceSchema } from '@kbn/as-code-data-views-schema';
import {
  BY_REF_SCHEMA_META,
  BY_VALUE_SCHEMA_META,
  serializedTitlesSchema,
  serializedTimeRangeSchema,
} from '@kbn/presentation-publishing-schemas';
import { VIEW_MODE } from '@kbn/saved-search-plugin/common';
import { asCodeFilterSchema } from '@kbn/as-code-filters-schema';
import { dataViewSchema } from '@kbn/as-code-data-views-schema';
import type { GetDrilldownsSchemaFnType } from '@kbn/embeddable-plugin/server';
import { ON_OPEN_PANEL_MENU } from '@kbn/ui-actions-plugin/common/trigger_ids';

const columnSettingsEntrySchema = z
  .object({
    width: z.number().min(0).optional().meta({
      description: 'Optional width of the column in pixels.',
    }),
  })
  .strict();

const sortSchema = z
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

export const viewModeSchema = z
  .union([
    z.literal(VIEW_MODE.DOCUMENT_LEVEL),
    z.literal(VIEW_MODE.PATTERN_LEVEL),
    z.literal(VIEW_MODE.AGGREGATED_LEVEL),
  ])
  .default(VIEW_MODE.DOCUMENT_LEVEL)
  .meta({
    description:
      'Discover view mode. Choose "documents" (search hits), "patterns" (pattern analysis), or "aggregated" (field statistics).',
  });

const documentsDisplayModeSchema = z.union([z.literal('table'), z.literal('json')]).optional();

export const dataTableLimitsSchema = z
  .object({
    rows_per_page: z.number().min(1).max(10000).optional().meta({
      description:
        'The number of rows to display per page in the data table. If omitted, defaults to the advanced setting "discover:sampleRowsPerPage".',
    }),
    sample_size: z.number().min(10).max(10000).optional().meta({
      description:
        'Discover display option: controls how many documents to sample for the data table. If omitted, defaults to the advanced setting "discover:sampleSize".',
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
          'Discover display option: controls table row spacing. Choose "compact", "expanded", or "normal". If omitted, Discover or the embedding application determines the density from its current settings, such as the user preference.',
      }),
    header_row_height: z
      .union([z.number().min(1).max(5), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Discover display option: controls table header row height. Use a number (1–5) or "auto" to size based on content. If omitted, Discover or the embedding application determines the height from its current settings, such as the user preference.',
      }),
    row_height: z
      .union([z.number().min(1).max(20), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Discover display option: controls table data row height. Use a number (1–20) or "auto" to size based on content. If omitted, defaults to the advanced setting "discover:rowHeightOption".',
      }),
    documents_display_mode: documentsDisplayModeSchema.meta({
      description:
        'Discover display option: controls whether documents are shown as a formatted table ("table") or as a raw JSON tree ("json").',
    }),
    hide_nulls: z.boolean().optional().meta({
      description:
        'Discover display option: controls whether fields with null values are hidden in JSON document view.',
    }),
    wrap_lines: z.boolean().optional().meta({
      description:
        'Discover display option: controls whether long values wrap in JSON document view. When false, values are truncated to a single line.',
    }),
    default_rendered_nodes: z.number().min(10).max(200).optional().meta({
      description:
        'Discover display option: controls how many nodes each JSON cell renders by default in JSON document view.',
    }),
  })
  .strict()
  .meta({ id: 'discoverSessionEmbeddableDataTableSchema' });

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
          'Discover display option: controls table row spacing (`compact`, `expanded`, or `normal`). When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
      }),
    header_row_height: z
      .union([z.number().min(1).max(5), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Discover display option: controls table header row height (number 1–5 or `auto`). When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
      }),
    row_height: z
      .union([z.number().min(1).max(20), z.literal('auto')])
      .optional()
      .meta({
        description:
          'Discover display option: controls table data row height (number 1–20 or `auto`). When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:rowHeightOption".',
      }),
    rows_per_page: z.number().min(1).max(10000).optional().meta({
      description:
        'Number of rows per page. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:sampleRowsPerPage".',
    }),
    sample_size: z.number().min(10).max(10000).optional().meta({
      description:
        'Discover display option: controls how many documents to sample. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:sampleSize".',
    }),
    documents_display_mode: documentsDisplayModeSchema.meta({
      description:
        'Discover display option: controls whether documents are shown as a formatted table ("table") or as a raw JSON tree ("json"). When set, overrides the referenced saved object or the inline tab config in `tabs`.',
    }),
    hide_nulls: z.boolean().optional().meta({
      description:
        'Discover display option: controls whether fields with null values are hidden in JSON document view. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
    }),
    wrap_lines: z.boolean().optional().meta({
      description:
        'Discover display option: controls whether long values wrap in JSON document view. When false, values are truncated to a single line. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
    }),
    default_rendered_nodes: z.number().min(10).max(200).optional().meta({
      description:
        'Discover display option: controls how many nodes each JSON cell renders by default in JSON document view. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
    }),
  })
  .strict()
  .default({});

export const classicTabSchema = z
  .object({
    ...dataTableSchema.shape,
    ...dataTableLimitsSchema.shape,
    query: asCodeQuerySchema.optional(),
    filters: z.array(asCodeFilterSchema).max(100).default([]).meta({
      description: 'List of filters to apply to the data in the tab.',
    }),
    data_source: dataViewSchema,
    view_mode: viewModeSchema,
  })
  .strict();

export const esqlTabSchema = z
  .object({
    ...dataTableSchema.shape,
    ...dataTableLimitsSchema.shape,
    data_source: esqlDataSourceSchema,
  })
  .strict()
  .meta({
    description: 'ES|QL (Elasticsearch Query Language) data source.',
  });

export const tabSchema = z.union([classicTabSchema, esqlTabSchema]);

const DISCOVER_SUPPORTED_DRILLDOWN_TRIGGERS = [ON_OPEN_PANEL_MENU];

/**
 * Intersects embeddable-only props with panel-level schemas normally merged by the host
 * (e.g. dashboard): serialized titles, time range, and drilldowns.
 */
function withPanelSchemas<T extends z.ZodRawShape>(
  embeddableSchema: z.ZodObject<T>,
  allMeta: z.GlobalMeta = {}
) {
  return (getDrilldownsSchema: GetDrilldownsSchemaFnType) => {
    return z
      .object({
        ...serializedTitlesSchema.shape,
        ...serializedTimeRangeSchema.shape,
        ...getDrilldownsSchema(DISCOVER_SUPPORTED_DRILLDOWN_TRIGGERS).shape,
        ...embeddableSchema.shape,
      })
      .strip()
      .meta(allMeta);
  };
}

const discoverSessionByValuePropsSchema = z
  .object({
    tabs: z.array(tabSchema).min(1).max(1).meta({
      description:
        'Inline tab configuration. Used when no `ref_id` is set. Currently supports one tab.',
    }),
  })
  .strict();
const getDiscoverSessionByValueEmbeddableSchema = withPanelSchemas(
  discoverSessionByValuePropsSchema,
  BY_VALUE_SCHEMA_META
);

const discoverSessionByReferencePropsSchema = z
  .object({
    ref_id: z.string(),
    selected_tab_id: z.string().optional().meta({
      description:
        'Tab to select from the referenced saved object. If omitted, defaults to the first tab.',
    }),
    overrides: panelOverridesSchema,
  })
  .strict();
const getDiscoverSessionByReferenceEmbeddableSchema = withPanelSchemas(
  discoverSessionByReferencePropsSchema,
  BY_REF_SCHEMA_META
);

export const getDiscoverSessionEmbeddableSchema = (
  getDrilldownsSchema: GetDrilldownsSchemaFnType
) =>
  z.union([
    getDiscoverSessionByValueEmbeddableSchema(getDrilldownsSchema),
    getDiscoverSessionByReferenceEmbeddableSchema(getDrilldownsSchema),
  ]);

export type DiscoverSessionPanelOverrides = z.output<typeof panelOverridesSchema>;
export type DiscoverSessionClassicTab = z.output<typeof classicTabSchema>;
export type DiscoverSessionEsqlTab = z.output<typeof esqlTabSchema>;
export type DiscoverSessionTab = z.output<typeof tabSchema>;
export type DiscoverSessionEmbeddableByValueProps = z.output<
  typeof discoverSessionByValuePropsSchema
>;
export type DiscoverSessionEmbeddableByReferenceProps = z.output<
  typeof discoverSessionByReferencePropsSchema
>;

export type DiscoverSessionEmbeddableByValueState = z.output<
  ReturnType<typeof getDiscoverSessionByValueEmbeddableSchema>
>;
export type DiscoverSessionEmbeddableByReferenceState = z.output<
  ReturnType<typeof getDiscoverSessionByReferenceEmbeddableSchema>
>;
export type DiscoverSessionEmbeddableState = z.output<
  ReturnType<typeof getDiscoverSessionEmbeddableSchema>
>;
