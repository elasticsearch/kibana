/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { DataGridDensity } from '@kbn/discover-utils';
import type { SavedObjectsModelVersionMap } from '@kbn/core-saved-objects-server';
import {
  MIN_SAVED_SEARCH_SAMPLE_SIZE,
  MAX_SAVED_SEARCH_SAMPLE_SIZE,
  MAX_DISCOVER_SESSION_COLUMNS,
  MAX_DISCOVER_SESSION_TABS,
  VIEW_MODE,
} from '../../common';
import { extractTabsTransformFnV13 } from '../../common/service/extract_tabs';
import { LEGACY_MODEL_REMOVED_ATTRIBUTES } from './schema_legacy';

/**
 * Follow this pattern to update the tab attributes schema in a non-breaking way:
 *
 * const SCHEMA_TAB_ATTRIBUTES_VNEXT = SCHEMA_TAB_ATTRIBUTES_VPREV.extends({
 *   // New tab attributes should be added here
 * });
 *
 * const SCHEMA_TAB_VNEXT = SCHEMA_TAB_VPREV.extends({
 *   attributes: SCHEMA_TAB_ATTRIBUTES_VNEXT,
 * });
 *
 * export const SCHEMA_DISCOVER_SESSION_VNEXT = SCHEMA_DISCOVER_SESSION_VPREV.extends({
 *   tabs: schema.arrayOf(SCHEMA_TAB_VNEXT, { minSize: 1, maxSize: 25 }),
 * });
 *
 * Also update SCHEMA_TAB_LATEST and SCHEMA_DISCOVER_SESSION_LATEST with the new schemas:
 *
 * export const SCHEMA_TAB_LATEST = SCHEMA_TAB_VNEXT;
 * export const SCHEMA_DISCOVER_SESSION_LATEST = SCHEMA_DISCOVER_SESSION_VNEXT;
 */

const SCHEMA_TAB_ATTRIBUTES_V13 = schema.object({
  // Layout
  hideChart: schema.boolean({ defaultValue: false }),
  hideTable: schema.boolean({ defaultValue: false }),

  // Data grid
  columns: schema.arrayOf(schema.string(), {
    defaultValue: [],
    maxSize: MAX_DISCOVER_SESSION_COLUMNS,
  }),
  sort: schema.oneOf(
    [
      schema.arrayOf(schema.arrayOf(schema.string(), { maxSize: 2 }), {
        maxSize: MAX_DISCOVER_SESSION_COLUMNS,
      }),
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
  headerRowHeight: schema.maybe(schema.number()),
  rowHeight: schema.maybe(schema.number()),
  rowsPerPage: schema.maybe(schema.number()),
  sampleSize: schema.maybe(
    schema.number({
      min: MIN_SAVED_SEARCH_SAMPLE_SIZE,
      max: MAX_SAVED_SEARCH_SAMPLE_SIZE,
    })
  ),
  density: schema.maybe(
    schema.oneOf([
      schema.literal(DataGridDensity.COMPACT),
      schema.literal(DataGridDensity.EXPANDED),
      schema.literal(DataGridDensity.NORMAL),
    ])
  ),
  // Chart
  breakdownField: schema.maybe(schema.string()),
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
  chartInterval: schema.maybe(schema.string()),

  // Search
  kibanaSavedObjectMeta: schema.object({
    searchSourceJSON: schema.string(),
  }),
  isTextBasedQuery: schema.boolean({ defaultValue: false }),
  usesAdHocDataView: schema.maybe(schema.boolean()),
  controlGroupJson: schema.maybe(schema.string()),

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
      schema.literal(VIEW_MODE.PATTERN_LEVEL),
      schema.literal(VIEW_MODE.AGGREGATED_LEVEL),
    ])
  ),
  hideAggregatedPreview: schema.maybe(schema.boolean()),
});

const SCHEMA_TAB_V13 = schema.object({
  id: schema.string(),
  label: schema.string(),
  attributes: SCHEMA_TAB_ATTRIBUTES_V13,
});

export const SCHEMA_DISCOVER_SESSION_V13 = schema.object({
  title: schema.string(),
  description: schema.string({ defaultValue: '' }),
  tabs: schema.arrayOf(SCHEMA_TAB_V13, { minSize: 1, maxSize: MAX_DISCOVER_SESSION_TABS }),
});

// Add new model versions here, which automatically registers them
export const DISCOVER_SESSION_MODEL_VERSIONS: SavedObjectsModelVersionMap = {
  13: {
    changes: [
      {
        type: 'unsafe_transform',
        transformFn: (typeSafeGuard) => typeSafeGuard(extractTabsTransformFnV13),
      },
      {
        type: 'data_removal',
        removedAttributePaths: LEGACY_MODEL_REMOVED_ATTRIBUTES,
      },
    ],
    schemas: {
      forwardCompatibility: SCHEMA_DISCOVER_SESSION_V13.extends({}, { unknowns: 'ignore' }),
      create: SCHEMA_DISCOVER_SESSION_V13,
    },
  },
};

// Set constants to the latest schemas, which updates derived types and content management
export const SCHEMA_TAB_LATEST = SCHEMA_TAB_V13;
export const SCHEMA_DISCOVER_SESSION_LATEST = SCHEMA_DISCOVER_SESSION_V13;

export type DiscoverSessionTabAttributes = TypeOf<typeof SCHEMA_TAB_LATEST>['attributes'];
export type DiscoverSessionTab = TypeOf<typeof SCHEMA_TAB_LATEST>;
export type DiscoverSessionAttributes = TypeOf<typeof SCHEMA_DISCOVER_SESSION_LATEST>;
