/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsType } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import { schema } from '@kbn/config-schema';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import { updateApmOssIndexPaths } from './migrations/update_apm_oss_index_paths';
import { createApmIndexStringSchema, type APMIndices } from '../../common/config_schema';

export const APM_INDEX_SETTINGS_SAVED_OBJECT_TYPE = 'apm-indices';
export const APM_INDEX_SETTINGS_SAVED_OBJECT_ID = 'apm-indices';

export interface APMIndicesSavedObjectBody {
  apmIndices?: {
    error?: string;
    onboarding?: string;
    span?: string;
    transaction?: string;
    metric?: string;
    sourcemap?: string;
  };
  isSpaceAware?: boolean;
}

export const apmIndicesSavedObjectDefinition: SavedObjectsType = {
  name: APM_INDEX_SETTINGS_SAVED_OBJECT_TYPE,
  hidden: false,
  namespaceType: 'single',
  mappings: {
    dynamic: false,
    properties: {}, // several fields exist, but we don't need to search or aggregate on them, so we exclude them from the mappings
  },
  management: {
    importableAndExportable: true,
    icon: 'apmApp',
    getTitle: () =>
      i18n.translate('xpack.apmSourcesAccess.apmSettings.index', {
        defaultMessage: 'APM Settings - Index',
      }),
  },
  modelVersions: {
    '1': {
      changes: [],
      schemas: {
        create: schema.object({
          apmIndices: schema.maybe(
            schema.object({
              error: schema.maybe(createApmIndexStringSchema('error')),
              onboarding: schema.maybe(createApmIndexStringSchema('onboarding')),
              span: schema.maybe(createApmIndexStringSchema('span')),
              transaction: schema.maybe(createApmIndexStringSchema('transaction')),
              metric: schema.maybe(createApmIndexStringSchema('metric')),
            })
          ),
          isSpaceAware: schema.maybe(schema.boolean()),
        }),
      },
    },
  },
  migrations: {
    '7.16.0': (doc) => {
      const attributes = updateApmOssIndexPaths(doc.attributes);
      return { ...doc, attributes };
    },
    '8.2.0': (doc) => {
      // Any future changes on this structure should be also tested on migrateLegacyAPMIndicesToSpaceAware
      return { ...doc, attributes: { apmIndices: doc.attributes } };
    },
  },
};

export function saveApmIndices(
  savedObjectsClient: SavedObjectsClientContract,
  apmIndices: Partial<APMIndices>
) {
  return savedObjectsClient.create<APMIndicesSavedObjectBody>(
    APM_INDEX_SETTINGS_SAVED_OBJECT_TYPE,
    { apmIndices: removeEmpty(apmIndices), isSpaceAware: true },
    { id: APM_INDEX_SETTINGS_SAVED_OBJECT_ID, overwrite: true }
  );
}

// remove empty/undefined values
function removeEmpty(apmIndices: Partial<APMIndices>) {
  return Object.entries<string | undefined>(apmIndices).reduce((obj, [key, value]) => {
    value = value?.trim();

    if (value) {
      obj[key] = value;
    }

    return obj;
  }, {} as Record<string, unknown>);
}

export async function getApmIndicesSavedObject(savedObjectsClient: SavedObjectsClientContract) {
  try {
    const apmIndicesSavedObject = await savedObjectsClient.get<Partial<APMIndicesSavedObjectBody>>(
      APM_INDEX_SETTINGS_SAVED_OBJECT_TYPE,
      APM_INDEX_SETTINGS_SAVED_OBJECT_ID
    );
    return apmIndicesSavedObject.attributes.apmIndices;
  } catch (error) {
    // swallow error if saved object does not exist
    if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
      return {};
    }

    throw error;
  }
}
