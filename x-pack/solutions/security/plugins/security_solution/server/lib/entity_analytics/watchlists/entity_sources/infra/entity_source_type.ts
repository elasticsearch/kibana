/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsType } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { Type } from '@kbn/config-schema';
import type { EncryptedSavedObjectTypeRegistration } from '@kbn/encrypted-saved-objects-plugin/server';
import { SECURITY_SOLUTION_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import type { MonitoringEntitySourceAttributes } from '../../../../../../common/api/entity_analytics/watchlists/data_source/common.gen';

export const watchlistEntitySourceTypeName = 'watchlist-entity-source';

export const MANAGED_SOURCES_VERSION = 1; // increment this when changing the managed sources

const watchlistEntitySourceMappings: SavedObjectsType['mappings'] = {
  dynamic: false,
  properties: {
    type: {
      type: 'keyword',
    },
    name: {
      type: 'text',
    },
    managed: {
      type: 'boolean',
    },
    enabled: {
      type: 'boolean',
    },
    range: {
      properties: {
        start: {
          type: 'keyword',
        },
        end: {
          type: 'keyword',
        },
      },
    },
  },
};

const matcherSchema = schema.object(
  {
    fields: schema.arrayOf(schema.string(), { maxSize: 20 }),
    // Keep permissive at the SO layer; enforce strict (string[] | boolean[]) via Zod in service code.
    values: schema.arrayOf(schema.any(), { maxSize: 50 }),
  },
  { unknowns: 'ignore' }
);

const matchersSchema = schema.arrayOf(matcherSchema, { maxSize: 50 });

const integrationsSyncDataSchema = schema.object(
  {
    lastFullSync: schema.maybe(schema.string()),
    lastUpdateProcessed: schema.maybe(schema.string()),
  },
  { unknowns: 'ignore' }
);

const integrationsSchema = schema.object(
  {
    syncMarkerIndex: schema.maybe(schema.string()),
    syncData: schema.maybe(integrationsSyncDataSchema),
  },
  { unknowns: 'ignore' }
);

export interface EntitySourceApiKeyFields {
  apiKeyId?: string | null;
  apiKey?: string | null; // encrypted
}

type WatchlistEntitySourceSchemaAttributes = Pick<
  MonitoringEntitySourceAttributes,
  | 'type'
  | 'name'
  | 'managed'
  | 'enabled'
  | 'integrationName'
  | 'identifierField'
  | 'queryRule'
  | 'matchers'
  | 'filter'
  | 'integrations'
  | 'range'
> & {
  error?: string;
  matchersModifiedByUser?: boolean;
  managedVersion?: number;
} & EntitySourceApiKeyFields;

type WatchlistEntitySourceSchemaProps = {
  [Key in keyof WatchlistEntitySourceSchemaAttributes]: Type<unknown>;
};

const entitySourceSchemaV1 = {
  type: schema.maybe(schema.string()),
  name: schema.maybe(schema.string()),
  managed: schema.maybe(schema.boolean()),
  enabled: schema.maybe(schema.boolean()),
  error: schema.maybe(schema.string()),
  integrationName: schema.maybe(schema.string()),
  identifierField: schema.maybe(schema.string()),
  queryRule: schema.maybe(schema.string()),
  matchers: schema.maybe(matchersSchema),
  matchersModifiedByUser: schema.boolean({ defaultValue: false }),
  managedVersion: schema.maybe(schema.number()),
  filter: schema.maybe(schema.any()),
  integrations: schema.maybe(integrationsSchema),
} satisfies Omit<WatchlistEntitySourceSchemaProps, 'range'>;

const entitySourceSchemaV2 = {
  ...entitySourceSchemaV1,
  range: schema.maybe(
    schema.object(
      {
        start: schema.string(),
        end: schema.string(),
      },
      { unknowns: 'ignore' }
    )
  ),
} satisfies WatchlistEntitySourceSchemaProps;

const entitySourceSchemaV3 = {
  ...entitySourceSchemaV2,
  apiKeyId: schema.maybe(schema.nullable(schema.string({ maxLength: 64 }))),
  apiKey: schema.maybe(schema.nullable(schema.string({ maxLength: 256 }))),
};

export const watchlistEntitySourceType: SavedObjectsType = {
  name: watchlistEntitySourceTypeName,
  indexPattern: SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
  hidden: true,
  namespaceType: 'multiple-isolated',
  mappings: watchlistEntitySourceMappings,
  modelVersions: {
    '1': {
      changes: [],
      schemas: {
        forwardCompatibility: schema.object(entitySourceSchemaV1, { unknowns: 'ignore' }),
        create: schema.object(entitySourceSchemaV1, { unknowns: 'ignore' }),
      },
    },
    '2': {
      changes: [
        {
          type: 'mappings_addition',
          addedMappings: {
            range: {
              properties: {
                start: { type: 'keyword' },
                end: { type: 'keyword' },
              },
            },
          },
        },
      ],
      schemas: {
        forwardCompatibility: schema.object(entitySourceSchemaV2, { unknowns: 'ignore' }),
        create: schema.object(entitySourceSchemaV2, { unknowns: 'ignore' }),
      },
    },
    '3': {
      changes: [],
      schemas: {
        forwardCompatibility: schema.object(entitySourceSchemaV3, { unknowns: 'ignore' }),
        create: schema.object(entitySourceSchemaV3, { unknowns: 'ignore' }),
      },
    },
  },
};

export const WatchlistEntitySourceApiKeyEncryptionParams: EncryptedSavedObjectTypeRegistration = {
  type: watchlistEntitySourceTypeName,
  attributesToEncrypt: new Set(['apiKey']),
  attributesToIncludeInAAD: new Set(['apiKeyId']),
};
