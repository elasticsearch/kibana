/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ObjectType, Props, TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
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

const columnSettingsEntrySchema = schema.object({
  width: schema.maybe(
    schema.number({
      min: 0,
      meta: {
        description: 'Optional width of the column in pixels.',
      },
    })
  ),
});

const sortSchema = schema.object({
  name: schema.string({
    meta: {
      description: 'The name of the field to sort by.',
    },
  }),
  direction: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
    meta: {
      description:
        'The direction to sort the field by: Use "asc" for ascending or "desc" for descending.',
    },
  }),
});

export const viewModeSchema = schema.oneOf(
  [
    schema.literal(VIEW_MODE.DOCUMENT_LEVEL),
    schema.literal(VIEW_MODE.PATTERN_LEVEL),
    schema.literal(VIEW_MODE.AGGREGATED_LEVEL),
  ],
  {
    defaultValue: VIEW_MODE.DOCUMENT_LEVEL,
    meta: {
      description:
        'Discover view mode. Choose "documents" (search hits), "patterns" (pattern analysis), or "aggregated" (field statistics).',
    },
  }
);

export const dataTableLimitsSchema = schema.object(
  {
    rows_per_page: schema.maybe(
      schema.number({
        min: 1,
        max: 10000,
        defaultValue: 100,
        meta: {
          description:
            'The number of rows to display per page in the data table. If omitted, defaults to the advanced setting "discover:sampleRowsPerPage".',
        },
      })
    ),
    sample_size: schema.maybe(
      schema.number({
        min: 10,
        max: 10000,
        defaultValue: 500,
        meta: {
          description:
            'The number of documents to sample for the data table. If omitted, defaults to the advanced setting "discover:sampleSize".',
        },
      })
    ),
  },
  { meta: { id: 'discoverSessionEmbeddableDataTableLimitsSchema' } }
);

export const dataTableSchema = schema.object(
  {
    column_order: schema.maybe(
      schema.arrayOf(
        schema.string({
          meta: {
            description: 'Field name of a column in display order.',
          },
        }),
        {
          maxSize: 100,
          defaultValue: [],
          meta: {
            description:
              'Ordered list of field names to display in the data table. If omitted, defaults to the advanced setting "defaultColumns" or the referenced saved object.',
          },
        }
      )
    ),
    column_settings: schema.maybe(
      schema.recordOf(schema.string(), columnSettingsEntrySchema, {
        meta: {
          description:
            'Per-column presentation settings keyed by field name (e.g. widths). Keys should correspond to entries in `column_order` when both are set.',
        },
      })
    ),
    sort: schema.arrayOf(sortSchema, {
      maxSize: 100,
      defaultValue: [],
      meta: {
        description: 'Sort configuration for the data table (field and direction).',
      },
    }),
    density: schema.maybe(
      schema.oneOf(
        [
          schema.literal(DataGridDensity.COMPACT),
          schema.literal(DataGridDensity.EXPANDED),
          schema.literal(DataGridDensity.NORMAL),
        ],
        {
          defaultValue: DataGridDensity.COMPACT,
          meta: {
            description:
              'Data grid density. Choose "compact", "expanded", or "normal" for row spacing. If omitted, defaults to Discover or embeddable defaults (e.g. user preference / local storage).',
          },
        }
      )
    ),
    header_row_height: schema.maybe(
      schema.oneOf(
        [
          schema.number({
            min: 1,
            max: 5,
          }),
          schema.literal('auto'),
        ],
        {
          defaultValue: 3,
          meta: {
            description:
              'Header row height. Use a number (1–5) or "auto" to size based on content. If omitted, defaults to Discover or embeddable defaults (e.g. user preference / local storage).',
          },
        }
      )
    ),
    row_height: schema.maybe(
      schema.oneOf(
        [
          schema.number({
            min: 1,
            max: 20,
          }),
          schema.literal('auto'),
        ],
        {
          defaultValue: 3,
          meta: {
            description:
              'Data row height. Use a number (1–20) or "auto" to size based on content. If omitted, defaults to the advanced setting "discover:rowHeightOption".',
          },
        }
      )
    ),
  },
  { meta: { id: 'discoverSessionEmbeddableDataTableSchema' } }
);

export const panelOverridesSchema = schema.object(
  {
    column_order: schema.maybe(
      schema.arrayOf(
        schema.string({
          meta: {
            description: 'Field name of a column in display order.',
          },
        }),
        {
          maxSize: 100,
          defaultValue: [],
          meta: {
            description:
              'When set, overrides column order for the data table relative to the referenced saved object (`ref_id`) or the inline tab in `tabs`. If omitted, the source configuration is used.',
          },
        }
      )
    ),
    column_settings: schema.maybe(
      schema.recordOf(schema.string(), columnSettingsEntrySchema, {
        meta: {
          description:
            'Per-column presentation overrides (e.g. widths) keyed by field name. When set, merges with the source configuration for the referenced session or inline tab.',
        },
      })
    ),
    sort: schema.maybe(
      schema.arrayOf(sortSchema, {
        maxSize: 100,
        defaultValue: [],
        meta: {
          description:
            'Sort configuration (field and direction) for the data table. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
        },
      })
    ),
    density: schema.maybe(
      schema.oneOf(
        [
          schema.literal(DataGridDensity.COMPACT),
          schema.literal(DataGridDensity.EXPANDED),
          schema.literal(DataGridDensity.NORMAL),
        ],
        {
          defaultValue: DataGridDensity.COMPACT,
          meta: {
            description:
              'Data grid row spacing: `compact`, `expanded`, or `normal`. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
          },
        }
      )
    ),
    header_row_height: schema.maybe(
      schema.oneOf(
        [
          schema.number({
            min: 1,
            max: 5,
          }),
          schema.literal('auto'),
        ],
        {
          defaultValue: 3,
          meta: {
            description:
              'Header row height: number (1–5) or `auto`. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, the source configuration is used.',
          },
        }
      )
    ),
    row_height: schema.maybe(
      schema.oneOf(
        [
          schema.number({
            min: 1,
            max: 20,
          }),
          schema.literal('auto'),
        ],
        {
          defaultValue: 3,
          meta: {
            description:
              'Data row height: number (1–20) or `auto`. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:rowHeightOption".',
          },
        }
      )
    ),
    rows_per_page: schema.maybe(
      schema.number({
        min: 1,
        max: 10000,
        defaultValue: 100,
        meta: {
          description:
            'Number of rows per page. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:sampleRowsPerPage".',
        },
      })
    ),
    sample_size: schema.maybe(
      schema.number({
        min: 10,
        max: 10000,
        defaultValue: 500,
        meta: {
          description:
            'Number of documents to sample. When set, overrides the referenced saved object or the inline tab config in `tabs`. If omitted, falls back to the source or to the advanced setting "discover:sampleSize".',
        },
      })
    ),
  },
  { defaultValue: {} }
);

export const classicTabSchema = schema.object({
  ...dataTableSchema.getPropSchemas(),
  ...dataTableLimitsSchema.getPropSchemas(),
  query: schema.maybe(asCodeQuerySchema),
  filters: schema.arrayOf(asCodeFilterSchema, {
    maxSize: 100,
    defaultValue: [],
    meta: {
      description: 'List of filters to apply to the data in the tab.',
    },
  }),
  data_source: dataViewSchema,
  view_mode: viewModeSchema,
});

export const esqlTabSchema = schema.object(
  {
    ...dataTableSchema.getPropSchemas(),
    data_source: esqlDataSourceSchema,
  },
  {
    meta: {
      description: 'ES|QL (Elasticsearch Query Language) data source.',
    },
  }
);

export const tabSchema = schema.oneOf([classicTabSchema, esqlTabSchema]);

const DISCOVER_SUPPORTED_DRILLDOWN_TRIGGERS = [ON_OPEN_PANEL_MENU];

/**
 * Intersects embeddable-only props with panel-level schemas normally merged by the host
 * (e.g. dashboard): serialized titles, time range, and drilldowns.
 */
function withPanelSchemas<P extends Props>(
  embeddableSchema: ObjectType<P>,
  allOfOptions?: { meta: typeof BY_VALUE_SCHEMA_META | typeof BY_REF_SCHEMA_META }
) {
  return (getDrilldownsSchema: GetDrilldownsSchemaFnType) =>
    schema.allOf(
      [
        serializedTitlesSchema,
        serializedTimeRangeSchema,
        getDrilldownsSchema(DISCOVER_SUPPORTED_DRILLDOWN_TRIGGERS),
        embeddableSchema,
      ],
      allOfOptions ?? {}
    );
}

const discoverSessionByValuePropsSchema = schema.object({
  tabs: schema.arrayOf(tabSchema, {
    minSize: 1,
    maxSize: 1,
    meta: {
      description:
        'Inline tab configuration. Used when no `ref_id` is set. Currently supports one tab.',
    },
  }),
});
const getDiscoverSessionByValueEmbeddableSchema = withPanelSchemas(
  discoverSessionByValuePropsSchema,
  { meta: BY_VALUE_SCHEMA_META }
);

const discoverSessionByReferencePropsSchema = schema.object({
  ref_id: schema.string(),
  selected_tab_id: schema.maybe(
    schema.string({
      meta: {
        description:
          'Tab to select from the referenced saved object. If omitted, defaults to the first tab.',
      },
    })
  ),
  overrides: panelOverridesSchema,
});
const getDiscoverSessionByReferenceEmbeddableSchema = withPanelSchemas(
  discoverSessionByReferencePropsSchema,
  { meta: BY_REF_SCHEMA_META }
);

export const getDiscoverSessionEmbeddableSchema = (
  getDrilldownsSchema: GetDrilldownsSchemaFnType
) =>
  schema.oneOf([
    getDiscoverSessionByValueEmbeddableSchema(getDrilldownsSchema),
    getDiscoverSessionByReferenceEmbeddableSchema(getDrilldownsSchema),
  ]);

export type DiscoverSessionPanelOverrides = TypeOf<typeof panelOverridesSchema>;
export type DiscoverSessionClassicTab = TypeOf<typeof classicTabSchema>;
export type DiscoverSessionEsqlTab = TypeOf<typeof esqlTabSchema>;
export type DiscoverSessionTab = TypeOf<typeof tabSchema>;
export type DiscoverSessionEmbeddableByValueProps = TypeOf<
  typeof discoverSessionByValuePropsSchema
>;
export type DiscoverSessionEmbeddableByReferenceProps = TypeOf<
  typeof discoverSessionByReferencePropsSchema
>;

export type DiscoverSessionEmbeddableByValueState = TypeOf<
  ReturnType<typeof getDiscoverSessionByValueEmbeddableSchema>
>;
export type DiscoverSessionEmbeddableByReferenceState = TypeOf<
  ReturnType<typeof getDiscoverSessionByReferenceEmbeddableSchema>
>;
export type DiscoverSessionEmbeddableState = TypeOf<
  ReturnType<typeof getDiscoverSessionEmbeddableSchema>
>;
