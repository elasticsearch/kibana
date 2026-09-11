/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { SavedObjectsModelVersionMap } from '@kbn/core-saved-objects-server';
import { DataGridDensity } from '@kbn/discover-session-constants';
import { extractTabsBackfillFnV6 } from '../../common/service/extract_tabs';
import {
  MIN_SAVED_SEARCH_SAMPLE_SIZE,
  MAX_SAVED_SEARCH_SAMPLE_SIZE,
  VIEW_MODE,
} from '../../common';

const SCHEMA_SEARCH_BASE = schema.object({
  // General
  title: schema.string(),
  description: schema.string({ defaultValue: '' }),

  // Data grid
  columns: schema.arrayOf(schema.string(), { defaultValue: [] }),
  sort: schema.oneOf(
    [
      schema.arrayOf(schema.arrayOf(schema.string(), { maxSize: 2 })),
      schema.arrayOf(schema.string(), { maxSize: 2 }),
    ],
    { defaultValue: [] }
  ),
  grid: schema.object(
    {
      columns: schema.maybe(
        schema.recordOf(
          schema.string(),
          schema.object({
            width: schema.maybe(schema.number()),
          })
        )
      ),
    },
    { defaultValue: {} }
  ),
  rowHeight: schema.maybe(schema.number()),
  rowsPerPage: schema.maybe(schema.number()),

  // Chart
  hideChart: schema.boolean({ defaultValue: false }),
  breakdownField: schema.maybe(schema.string()),

  // Search
  kibanaSavedObjectMeta: schema.object({
    searchSourceJSON: schema.string(),
  }),
  isTextBasedQuery: schema.boolean({ defaultValue: false }),
  usesAdHocDataView: schema.maybe(schema.boolean()),

  // Time
  timeRestore: schema.maybe(schema.boolean()),
  timeRange: schema.maybe(
    schema.object({
      from: schema.string(),
      to: schema.string(),
    })
  ),
  refreshInterval: schema.maybe(
    schema.object({
      pause: schema.boolean(),
      value: schema.number(),
    })
  ),

  // Display
  viewMode: schema.maybe(
    schema.oneOf([
      schema.literal(VIEW_MODE.DOCUMENT_LEVEL),
      schema.literal(VIEW_MODE.AGGREGATED_LEVEL),
    ])
  ),
  hideAggregatedPreview: schema.maybe(schema.boolean()),

  // Legacy
  hits: schema.maybe(schema.number()),
  version: schema.maybe(schema.number()),
});

export const SCHEMA_SEARCH_V8_8_0 = SCHEMA_SEARCH_BASE;

const SCHEMA_SEARCH_MODEL_VERSION_1 = SCHEMA_SEARCH_BASE.extends({
  sampleSize: schema.maybe(
    schema.number({
      min: MIN_SAVED_SEARCH_SAMPLE_SIZE,
      max: MAX_SAVED_SEARCH_SAMPLE_SIZE,
    })
  ),
});

const SCHEMA_SEARCH_MODEL_VERSION_2 = SCHEMA_SEARCH_MODEL_VERSION_1.extends({
  headerRowHeight: schema.maybe(schema.number()),
});

const SCHEMA_SEARCH_MODEL_VERSION_3 = SCHEMA_SEARCH_MODEL_VERSION_2.extends({
  visContext: schema.maybe(
    schema.oneOf([
      // existing value
      schema.object({
        // unified histogram state
        suggestionType: schema.string(),
        requestData: schema.object({
          dataViewId: schema.maybe(schema.string()),
          timeField: schema.maybe(schema.string()),
          timeInterval: schema.maybe(schema.string()),
          breakdownField: schema.maybe(schema.string()),
        }),
        // lens attributes
        attributes: schema.recordOf(schema.string(), schema.any()),
      }),
      // cleared previous value
      schema.object({}),
    ])
  ),
});

const SCHEMA_SEARCH_MODEL_VERSION_4 = SCHEMA_SEARCH_MODEL_VERSION_3.extends({
  viewMode: schema.maybe(
    schema.oneOf([
      schema.literal(VIEW_MODE.DOCUMENT_LEVEL),
      schema.literal(VIEW_MODE.PATTERN_LEVEL),
      schema.literal(VIEW_MODE.AGGREGATED_LEVEL),
    ])
  ),
});

export const SCHEMA_SEARCH_MODEL_VERSION_5 = SCHEMA_SEARCH_MODEL_VERSION_4.extends({
  density: schema.maybe(
    schema.oneOf([
      schema.literal(DataGridDensity.COMPACT),
      schema.literal(DataGridDensity.EXPANDED),
      schema.literal(DataGridDensity.NORMAL),
    ])
  ),
});

const DISCOVER_SESSION_TAB_ATTRIBUTES = SCHEMA_SEARCH_MODEL_VERSION_5.extends({
  title: undefined,
  description: undefined,
});

const SCHEMA_DISCOVER_SESSION_TAB = schema.object({
  id: schema.string(),
  label: schema.string(),
  // Remove `title` and `description` from the tab schema as they exist at the top level of the saved object
  attributes: DISCOVER_SESSION_TAB_ATTRIBUTES,
});

export const SCHEMA_SEARCH_MODEL_VERSION_6 = SCHEMA_SEARCH_MODEL_VERSION_5.extends({
  tabs: schema.maybe(schema.arrayOf(SCHEMA_DISCOVER_SESSION_TAB, { minSize: 1 })),
});

const { columns, grid, hideChart, isTextBasedQuery, kibanaSavedObjectMeta, rowHeight, sort } =
  SCHEMA_SEARCH_MODEL_VERSION_6.getPropSchemas();

// Mark top-level attributes (except title and description) optional, and mark tabs as required
const SCHEMA_SEARCH_MODEL_VERSION_7 = SCHEMA_SEARCH_MODEL_VERSION_6.extends({
  columns: schema.maybe(columns),
  grid: schema.maybe(grid),
  hideChart: schema.maybe(hideChart),
  isTextBasedQuery: schema.maybe(isTextBasedQuery),
  kibanaSavedObjectMeta: schema.maybe(kibanaSavedObjectMeta),
  rowHeight: schema.maybe(rowHeight),
  sort: schema.maybe(sort),
  tabs: schema.arrayOf(SCHEMA_DISCOVER_SESSION_TAB, { minSize: 1 }),
});

const CONTROL_GROUP_JSON_SCHEMA = {
  controlGroupJson: schema.maybe(schema.string()),
};

const DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_8 =
  DISCOVER_SESSION_TAB_ATTRIBUTES.extends(CONTROL_GROUP_JSON_SCHEMA);

const SCHEMA_DISCOVER_SESSION_TAB_VERSION_8 = SCHEMA_DISCOVER_SESSION_TAB.extends({
  attributes: DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_8,
});

const SCHEMA_SEARCH_MODEL_VERSION_8 = SCHEMA_SEARCH_MODEL_VERSION_7.extends({
  ...CONTROL_GROUP_JSON_SCHEMA,
  tabs: schema.arrayOf(SCHEMA_DISCOVER_SESSION_TAB_VERSION_8, { minSize: 1 }),
});

// We need to flatten the schema type here to avoid this error:
// "Type instantiation is excessively deep and possibly infinite",
// since each `extends()` call wraps the previous type until we hit the depth limit.
const { tabs: tabsV8, ...restV8Props } = SCHEMA_SEARCH_MODEL_VERSION_8.getPropSchemas();

// This schema temporarily makes `tabs` optional again, to work around an issue
// where saved objects created via the deprecated saved objects API without a
// specified version would fail validation if `tabs` was not provided, which
// broke existing API usages after SCHEMA_SEARCH_MODEL_VERSION_8 was added.
// It should not be relied on in application code or used for the content
// management validation schema, and `tabs` should be required again once Core
// provides a way to fix the underlying issue at the saved objects API level.
const SCHEMA_SEARCH_MODEL_VERSION_9_SO_API_WORKAROUND = schema.object({
  ...restV8Props,
  tabs: schema.maybe(tabsV8),
});

const DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_10 =
  DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_8.extends({
    chartInterval: schema.maybe(schema.string()),
  });

const SCHEMA_DISCOVER_SESSION_TAB_VERSION_10 = SCHEMA_DISCOVER_SESSION_TAB_VERSION_8.extends({
  attributes: DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_10,
});

const SCHEMA_SEARCH_MODEL_VERSION_10 = SCHEMA_SEARCH_MODEL_VERSION_8.extends({
  tabs: schema.arrayOf(SCHEMA_DISCOVER_SESSION_TAB_VERSION_10, { minSize: 1 }),
});

const { tabs: tabsV10, ...restV10Props } = SCHEMA_SEARCH_MODEL_VERSION_10.getPropSchemas();

const SCHEMA_SEARCH_MODEL_VERSION_10_SO_API_WORKAROUND = schema.object({
  ...restV10Props,
  tabs: schema.maybe(tabsV10),
});

const SCHEMA_SEARCH_MODEL_VERSION_11 = SCHEMA_SEARCH_MODEL_VERSION_10.extends({
  chartInterval: schema.maybe(schema.string()),
});

const { tabs: tabsV11, ...restV11Props } = SCHEMA_SEARCH_MODEL_VERSION_11.getPropSchemas();

const SCHEMA_SEARCH_MODEL_VERSION_11_SO_API_WORKAROUND = schema.object({
  ...restV11Props,
  tabs: schema.maybe(tabsV11),
});

const DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_12 =
  DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_10.extends({
    hideTable: schema.boolean({ defaultValue: false }),
  });

const SCHEMA_DISCOVER_SESSION_TAB_VERSION_12 = SCHEMA_DISCOVER_SESSION_TAB_VERSION_10.extends({
  attributes: DISCOVER_SESSION_TAB_ATTRIBUTES_VERSION_12,
});

const SCHEMA_SEARCH_MODEL_VERSION_12 = SCHEMA_SEARCH_MODEL_VERSION_11.extends({
  hideTable: schema.maybe(schema.boolean({ defaultValue: false })),
  tabs: schema.arrayOf(SCHEMA_DISCOVER_SESSION_TAB_VERSION_12, { minSize: 1, maxSize: 25 }),
});

const { tabs: tabsV12, ...restV12Props } = SCHEMA_SEARCH_MODEL_VERSION_12.getPropSchemas();

export const SCHEMA_SEARCH_MODEL_VERSION_12_SO_API_WORKAROUND = schema.object({
  ...restV12Props,
  tabs: schema.maybe(tabsV12),
});

const LEGACY_MODEL_RETAINED_ATTRIBUTES = ['title', 'description', 'tabs'];

export const LEGACY_MODEL_REMOVED_ATTRIBUTES = Object.keys(
  SCHEMA_SEARCH_MODEL_VERSION_12_SO_API_WORKAROUND.getPropSchemas()
).filter((key) => !LEGACY_MODEL_RETAINED_ATTRIBUTES.includes(key));

export const LEGACY_MODEL_VERSIONS: SavedObjectsModelVersionMap = {
  1: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_1.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_1,
    },
  },
  2: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_2.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_2,
    },
  },
  3: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_3.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_3,
    },
  },
  4: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_4.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_4,
    },
  },
  5: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_5.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_5,
    },
  },
  6: {
    changes: [
      {
        type: 'data_backfill',
        backfillFn: extractTabsBackfillFnV6,
      },
    ],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_6.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_6,
    },
  },
  7: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_7.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_7,
    },
  },
  8: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_8.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_SEARCH_MODEL_VERSION_8,
    },
  },
  9: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_9_SO_API_WORKAROUND.extends(
        {},
        { unknowns: 'ignore' }
      ),
      create: SCHEMA_SEARCH_MODEL_VERSION_9_SO_API_WORKAROUND,
    },
  },
  10: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_10_SO_API_WORKAROUND.extends(
        {},
        { unknowns: 'ignore' }
      ),
      create: SCHEMA_SEARCH_MODEL_VERSION_10_SO_API_WORKAROUND,
    },
  },
  11: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_11_SO_API_WORKAROUND.extends(
        {},
        { unknowns: 'ignore' }
      ),
      create: SCHEMA_SEARCH_MODEL_VERSION_11_SO_API_WORKAROUND,
    },
  },
  12: {
    changes: [],
    schemas: {
      forwardCompatibility: SCHEMA_SEARCH_MODEL_VERSION_12_SO_API_WORKAROUND.extends(
        {},
        { unknowns: 'ignore' }
      ),
      create: SCHEMA_SEARCH_MODEL_VERSION_12_SO_API_WORKAROUND,
    },
  },
};
