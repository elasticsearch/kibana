/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsFullModelVersion } from '@kbn/core-saved-objects-server';
import type { SavedObjectsType } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { ENGINE_DESCRIPTOR_TYPE_NAME } from '../../../../common/privileges';

export const EngineDescriptorTypeName = ENGINE_DESCRIPTOR_TYPE_NAME;

export const EngineDescriptorTypeMappings: SavedObjectsType['mappings'] = {
  dynamic: false,
  properties: {
    type: {
      type: 'keyword', // EntityType: user | host | service | generic
    },
    status: {
      type: 'keyword', // EngineStatus: installing | started | stopped | updating | error
    },
    logExtractionState: {
      properties: {
        // Config fields kept in mappings for migration validation (v1/v2 added them; v3 schema-only stops returning them; v4 data_removal deletes from docs)
        filter: { type: 'keyword' },
        additionalIndexPattern: { type: 'keyword' },
        additionalIndexPatterns: { type: 'keyword' },
        fieldHistoryLength: { type: 'integer' },
        lookbackPeriod: { type: 'keyword' },
        delay: { type: 'keyword' },
        docsLimit: { type: 'integer' },
        timeout: { type: 'keyword' },
        frequency: { type: 'keyword' },
        // Runtime fields (v3 and current)
        paginationTimestamp: { type: 'date' },
        paginationId: { type: 'keyword' },
        lastExecutionTimestamp: { type: 'date' },
      },
    },
    error: {
      properties: {
        message: {
          type: 'text',
        },
        action: {
          type: 'keyword',
        },
      },
    },
    versionState: {
      properties: {
        version: {
          type: 'integer',
        },
        state: {
          type: 'keyword', // running | migrating
        },
        isMigratedFromV1: {
          type: 'boolean',
        },
      },
    },
  },
};

const logExtractionStateSchemaV1 = schema.object({
  filter: schema.string(),
  additionalIndexPattern: schema.string(),
  fieldHistoryLength: schema.number(),
  lookbackPeriod: schema.string(),
  delay: schema.string(),
  docsLimit: schema.number(),
  timeout: schema.string(),
  frequency: schema.string(),
  paginationTimestamp: schema.maybe(schema.string()),
  lastExecutionTimestamp: schema.maybe(schema.string()),
});

const engineDescriptorAttributesSchemaV1 = {
  type: schema.oneOf([
    schema.literal('user'),
    schema.literal('host'),
    schema.literal('service'),
    schema.literal('generic'),
  ]),
  status: schema.oneOf([
    schema.literal('installing'),
    schema.literal('started'),
    schema.literal('stopped'),
    schema.literal('updating'),
    schema.literal('error'),
  ]),
  logExtractionState: logExtractionStateSchemaV1,
  error: schema.maybe(
    schema.object({
      message: schema.string(),
      action: schema.string(),
    })
  ),
  versionState: schema.object({
    version: schema.oneOf([schema.literal(1), schema.literal(2)]),
    state: schema.oneOf([schema.literal('running'), schema.literal('migrating')]),
    isMigratedFromV1: schema.boolean(),
  }),
};

const engineDescriptorSchemaV1 = schema.object(engineDescriptorAttributesSchemaV1);

const logExtractionStateSchemaV2 = schema.object({
  filter: schema.string(),
  additionalIndexPatterns: schema.arrayOf(schema.string(), { maxSize: 10000 }),
  fieldHistoryLength: schema.number(),
  lookbackPeriod: schema.string(),
  delay: schema.string(),
  docsLimit: schema.number(),
  timeout: schema.string(),
  frequency: schema.string(),
  paginationTimestamp: schema.maybe(schema.string()),
  paginationId: schema.maybe(schema.string()),
  lastExecutionTimestamp: schema.maybe(schema.string()),
});

const engineDescriptorSchemaV2 = engineDescriptorSchemaV1.extends({
  logExtractionState: logExtractionStateSchemaV2,
});

const logExtractionRuntimeStateSchemaV3 = schema.object({
  paginationTimestamp: schema.maybe(schema.string()),
  paginationId: schema.maybe(schema.string()),
  lastExecutionTimestamp: schema.maybe(schema.string()),
});

const logExtractionRuntimeStateSchemaV4 = schema.object({
  paginationTimestamp: schema.maybe(schema.string()),
  paginationId: schema.maybe(schema.string()),
  lastExecutionTimestamp: schema.maybe(schema.string()),
  logsPageCursorStartTimestamp: schema.maybe(schema.string()),
  logsPageCursorStartId: schema.maybe(schema.string()),
  logsPageCursorEndTimestamp: schema.maybe(schema.string()),
  logsPageCursorEndId: schema.maybe(schema.string()),
});

const engineDescriptorAttributesSchemaV3 = {
  ...engineDescriptorAttributesSchemaV1,
  logExtractionState: logExtractionRuntimeStateSchemaV3,
};

const engineDescriptorSchemaV3 = schema.object(engineDescriptorAttributesSchemaV3);

const engineDescriptorAttributesSchemaV4 = {
  ...engineDescriptorAttributesSchemaV1,
  logExtractionState: logExtractionRuntimeStateSchemaV4,
};

const engineDescriptorSchemaV4 = schema.object(engineDescriptorAttributesSchemaV4);

const version1: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    create: engineDescriptorSchemaV1,
    forwardCompatibility: engineDescriptorSchemaV1.extends({}, { unknowns: 'ignore' }),
  },
};

const version2: SavedObjectsFullModelVersion = {
  changes: [
    {
      type: 'mappings_addition' as const,
      addedMappings: {
        logExtractionState: {
          properties: {
            additionalIndexPatterns: { type: 'keyword' as const },
            paginationId: { type: 'keyword' as const },
          },
        },
      },
    },
    {
      type: 'data_backfill' as const,
      backfillFn: (document) => {
        const { logExtractionState } = document.attributes;
        const additionalIndexPatterns = Array.isArray(logExtractionState?.additionalIndexPatterns)
          ? logExtractionState.additionalIndexPatterns
          : [];
        const paginationId = logExtractionState?.paginationId ?? '';

        return {
          attributes: {
            logExtractionState: {
              additionalIndexPatterns,
              paginationId,
            },
          },
        };
      },
    },
  ],
  schemas: {
    create: engineDescriptorSchemaV2,
    forwardCompatibility: engineDescriptorSchemaV2.extends({}, { unknowns: 'ignore' }),
  },
};

const version3: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    create: engineDescriptorSchemaV3,
    forwardCompatibility: engineDescriptorSchemaV3.extends({}, { unknowns: 'ignore' }),
  },
};

const version4: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    create: engineDescriptorSchemaV4,
    forwardCompatibility: engineDescriptorSchemaV4.extends({}, { unknowns: 'ignore' }),
  },
};

const logExtractionRuntimeStateSchemaV5 = schema.object({
  paginationTimestamp: schema.nullable(schema.string()),
  paginationId: schema.nullable(schema.string()),
  lastExecutionTimestamp: schema.nullable(schema.string()),
  logsPageCursorStartTimestamp: schema.nullable(schema.string()),
  logsPageCursorStartId: schema.nullable(schema.string()),
  logsPageCursorEndTimestamp: schema.nullable(schema.string()),
  logsPageCursorEndId: schema.nullable(schema.string()),
});

const engineDescriptorSchemaV5 = schema.object({
  ...engineDescriptorAttributesSchemaV1,
  logExtractionState: logExtractionRuntimeStateSchemaV5,
  error: schema.nullable(
    schema.object({
      message: schema.string(),
      action: schema.string(),
    })
  ),
});

const version5: SavedObjectsFullModelVersion = {
  changes: [
    {
      type: 'data_backfill' as const,
      backfillFn: (document) => {
        const { logExtractionState, error } = document.attributes;
        return {
          attributes: {
            logExtractionState: {
              paginationTimestamp: logExtractionState?.paginationTimestamp ?? null,
              paginationId: logExtractionState?.paginationId ?? null,
              lastExecutionTimestamp: logExtractionState?.lastExecutionTimestamp ?? null,
              logsPageCursorStartTimestamp:
                logExtractionState?.logsPageCursorStartTimestamp ?? null,
              logsPageCursorStartId: logExtractionState?.logsPageCursorStartId ?? null,
              logsPageCursorEndTimestamp: logExtractionState?.logsPageCursorEndTimestamp ?? null,
              logsPageCursorEndId: logExtractionState?.logsPageCursorEndId ?? null,
            },
            error: error ?? null,
          },
        };
      },
    },
  ],
  schemas: {
    create: engineDescriptorSchemaV5,
    forwardCompatibility: engineDescriptorSchemaV5.extends({}, { unknowns: 'ignore' }),
  },
};

const logExtractionRuntimeStateSchemaV6 = schema.object({
  checkpointTimestamp: schema.nullable(schema.string()),
  paginationId: schema.nullable(schema.string()),
  lastExecutionTimestamp: schema.nullable(schema.string()),
});

const engineDescriptorSchemaV6 = schema.object({
  ...engineDescriptorAttributesSchemaV1,
  logExtractionState: logExtractionRuntimeStateSchemaV6,
  error: schema.nullable(
    schema.object({
      message: schema.string(),
      action: schema.string(),
    })
  ),
});

const version6: SavedObjectsFullModelVersion = {
  changes: [
    {
      type: 'data_backfill' as const,
      backfillFn: (document) => {
        const { logExtractionState } = document.attributes;
        return {
          attributes: {
            logExtractionState: {
              checkpointTimestamp: logExtractionState?.paginationTimestamp ?? null,
            },
          },
        };
      },
    },
    {
      type: 'data_removal' as const,
      removedAttributePaths: [
        'logExtractionState.logsPageCursorStartId',
        'logExtractionState.logsPageCursorEndId',
        'logExtractionState.paginationTimestamp',
        'logExtractionState.logsPageCursorStartTimestamp',
        'logExtractionState.logsPageCursorEndTimestamp',
      ],
    },
  ],
  schemas: {
    create: engineDescriptorSchemaV6,
    forwardCompatibility: engineDescriptorSchemaV6.extends({}, { unknowns: 'ignore' }),
  },
};

const logExtractionRuntimeStateSchemaV7 = schema.object({
  checkpointTimestamp: schema.nullable(schema.string()),
  paginationId: schema.nullable(schema.string()),
  lastExecutionTimestamp: schema.nullable(schema.string()),
  sliceEndTimestamp: schema.nullable(schema.string()),
});

const engineDescriptorSchemaV7 = schema.object({
  ...engineDescriptorAttributesSchemaV1,
  logExtractionState: logExtractionRuntimeStateSchemaV7,
  error: schema.nullable(
    schema.object({
      message: schema.string(),
      action: schema.string(),
    })
  ),
});

// Adds logExtractionState.sliceEndTimestamp. Nullable with a null default, so no data
// backfill is needed. Runtime cursor fields are stored but not indexed (mappings are
// dynamic: false), so there is no mappings addition either.
const version7: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    create: engineDescriptorSchemaV7,
    forwardCompatibility: engineDescriptorSchemaV7.extends({}, { unknowns: 'ignore' }),
  },
};

/** Mirrors the zod `LogExtractionTypeOverride`: every field optional and nullable, without `timeout` and `fieldHistoryLength`. */
const logExtractionConfigSchemaV8 = schema.object({
  additionalIndexPatterns: schema.maybe(
    schema.nullable(schema.arrayOf(schema.string(), { maxSize: 10000 }))
  ),
  excludedIndexPatterns: schema.maybe(
    schema.nullable(schema.arrayOf(schema.string(), { maxSize: 10000 }))
  ),
  lookbackPeriod: schema.maybe(schema.nullable(schema.string())),
  delay: schema.maybe(schema.nullable(schema.string())),
  docsLimit: schema.maybe(schema.nullable(schema.number())),
  maxLogsPerPage: schema.maybe(schema.nullable(schema.number())),
  frequency: schema.maybe(schema.nullable(schema.string())),
  maxTimeWindowSize: schema.maybe(schema.nullable(schema.string())),
  maxLogsPerWindow: schema.maybe(schema.nullable(schema.number())),
  maxLogsPerWindowCapBehavior: schema.maybe(
    schema.nullable(schema.oneOf([schema.literal('defer'), schema.literal('drop')] as const))
  ),
});

const engineDescriptorSchemaV8 = engineDescriptorSchemaV7.extends({
  logExtractionConfig: schema.maybe(logExtractionConfigSchemaV8),
});

// Adds logExtractionConfig. Optional, so older descriptors stay valid with no backfill. Not queried, so no mappings addition.
const version8: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    create: engineDescriptorSchemaV8,
    forwardCompatibility: engineDescriptorSchemaV8.extends({}, { unknowns: 'ignore' }),
  },
};

export const EngineDescriptorType: SavedObjectsType = {
  name: EngineDescriptorTypeName,
  hidden: false,
  namespaceType: 'multiple-isolated',
  mappings: EngineDescriptorTypeMappings,
  modelVersions: {
    1: version1,
    2: version2,
    3: version3,
    4: version4,
    5: version5,
    6: version6,
    7: version7,
    8: version8,
  },
  hiddenFromHttpApis: true,
};
