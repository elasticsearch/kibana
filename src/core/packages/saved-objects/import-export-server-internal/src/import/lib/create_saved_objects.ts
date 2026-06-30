/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsImportFailure } from '@kbn/core-saved-objects-common';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { CreatedObject, SavedObject } from '@kbn/core-saved-objects-server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import type { LegacyUrlAlias } from '@kbn/core-saved-objects-base-server-internal';
import { LEGACY_URL_ALIAS_TYPE } from '@kbn/core-saved-objects-base-server-internal';
import { SavedObjectsUtils } from '@kbn/core-saved-objects-utils-server';
import { extractErrors } from './extract_errors';
import type { ImportStateMap } from './types';

export interface CreateSavedObjectsParams<T> {
  objects: Array<SavedObject<T>>;
  accumulatedErrors: SavedObjectsImportFailure[];
  savedObjectsClient: SavedObjectsClientContract;
  importStateMap: ImportStateMap;
  namespace?: string;
  overwrite?: boolean;
  refresh?: boolean | 'wait_for';
  /**
   * If true, Kibana will apply various adjustments to the data that's being imported to maintain compatibility between
   * different Kibana versions (e.g. generate legacy URL aliases for all imported objects that have to change IDs).
   */
  compatibilityMode?: boolean;
  /**
   * If true, create the object as managed.
   *
   * This can be leveraged by applications to e.g. prevent edits to a managed
   * saved object. Instead, users can be guided to create a copy first and
   * make their edits to the copy.
   */
  managed?: boolean;
}

export interface CreateSavedObjectsResult<T> {
  createdObjects: Array<CreatedObject<T>>;
  errors: SavedObjectsImportFailure[];
}

/**
 * This function abstracts the bulk creation of import objects. The main reason for this is that the import ID map should dictate the IDs of
 * the objects we create, and the create results should be mapped to the original IDs that consumers will be able to understand.
 */
export const createSavedObjects = async <T>({
  objects,
  accumulatedErrors,
  savedObjectsClient,
  importStateMap,
  namespace,
  overwrite,
  refresh,
  compatibilityMode,
  managed,
}: CreateSavedObjectsParams<T>): Promise<CreateSavedObjectsResult<T>> => {
  // filter out any objects that resulted in errors
  const errorSet = accumulatedErrors.reduce(
    (acc, { type, id }) => acc.add(`${type}:${id}`),
    new Set<string>()
  );
  const filteredObjects = objects.filter(({ type, id }) => !errorSet.has(`${type}:${id}`));

  // exit early if there are no objects to create
  if (filteredObjects.length === 0) {
    return { createdObjects: [], errors: [] };
  }

  // generate a map of the raw object IDs
  const objectIdMap = filteredObjects.reduce(
    (map, object) => map.set(`${object.type}:${object.id}`, object),
    new Map<string, SavedObject<T>>()
  );

  // filter out the 'version' field of each object, if it exists, and set the originId appropriately
  const objectsToCreate = filteredObjects.map(({ version, originId, ...object }) => {
    // use the import ID map to ensure that each reference is being created with the correct ID
    const references = object.references?.map((reference) => {
      const { type, id } = reference;
      const importStateValue = importStateMap.get(`${type}:${id}`);
      if (importStateValue?.destinationId) {
        return { ...reference, id: importStateValue.destinationId };
      }
      return reference;
    });
    // use the import ID map to ensure that each object is being created with the correct ID, also ensure that the `originId` is set on
    // the created object if it did not have one (or is omitted if specified)
    const importStateValue = importStateMap.get(`${object.type}:${object.id}`);
    if (importStateValue?.destinationId) {
      objectIdMap.set(`${object.type}:${importStateValue.destinationId}`, object);
      return {
        ...object,
        id: importStateValue.destinationId,
        ...(references && { references }),
        // Do not set originId, not even to undefined, if omitOriginId is true.
        // When omitOriginId is true, we are trying to create a brand new object without setting the originId at all.
        // Semantically, setting `originId: undefined` is used to clear out an existing object's originId when overwriting it
        // (and if you attempt to do that on a non-multi-namespace object type, it will result in a 400 Bad Request error).
        ...(!importStateValue.omitOriginId && { originId: originId ?? object.id }),
      };
    }
    return {
      ...object,
      ...(references && { references }),
      ...(originId && { originId }),
      ...{ managed: managed ?? object.managed ?? false },
    };
  });

  const resolvableErrors = ['conflict', 'ambiguous_conflict', 'missing_references'];
  const hasResolvableErrors = accumulatedErrors.some(({ error: { type } }) =>
    resolvableErrors.includes(type)
  );

  let expectedResults: Array<SavedObject<T>> = objectsToCreate;
  if (!hasResolvableErrors) {
    const bulkCreateResponse = await savedObjectsClient.bulkCreate(objectsToCreate, {
      namespace,
      overwrite,
      refresh,
    });
    expectedResults = bulkCreateResponse.saved_objects;
  }

  // Namespace to use as the target namespace for the legacy URLs we create when in compatibility mode. If the namespace
  // is specified explicitly we should use it instead of the namespace the saved objects client is scoped to. In certain
  // scenarios (e.g. copying to a default space) both current namespace and namespace from the parameter aren't defined.
  const legacyUrlTargetNamespace = SavedObjectsUtils.namespaceIdToString(
    namespace ?? savedObjectsClient.getCurrentNamespace()
  );

  // Remap results to reflect the object IDs that were submitted for import this ensures that consumers understand the
  // results, and collect legacy URL aliases if in compatibility mode.
  const remappedResults: Array<CreatedObject<T>> = [];
  const legacyUrlAliases = new Map<string, SavedObject<LegacyUrlAlias>>();
  for (const result of expectedResults) {
    const { id } = objectIdMap.get(`${result.type}:${result.id}`)!;
    // also, include a `destinationId` field if the object create attempt was made with a different ID
    remappedResults.push({ ...result, id, ...(id !== result.id && { destinationId: result.id }) });

    // Indicates that object has been successfully imported.
    const objectSuccessfullyImported = !hasResolvableErrors && !isSavedObjectErrorResult(result);

    // Indicates that the object has changed ID at some point with the original ID retained as the origin ID, so that
    // legacy URL alias is required to retrieve the object using its original ID.
    const objectRequiresLegacyUrlAlias = !!result.originId && result.originId !== result.id;
    if (compatibilityMode && objectRequiresLegacyUrlAlias && objectSuccessfullyImported) {
      const legacyUrlAliasId = `${legacyUrlTargetNamespace}:${result.type}:${result.originId}`;
      legacyUrlAliases.set(legacyUrlAliasId, {
        id: legacyUrlAliasId,
        type: LEGACY_URL_ALIAS_TYPE,
        references: [],
        attributes: {
          // We can safely force `originId` here since it's enforced by `objectRequiresLegacyUrlAlias`.
          sourceId: result.originId!,
          targetNamespace: legacyUrlTargetNamespace,
          targetType: result.type,
          targetId: result.id,
          purpose: 'savedObjectImport',
        },
        ...{ managed: managed ?? false }, // we can safey create each doc with the given managed flag, even if it's set as the default, bulkCreate would "override" this otherwise.
      });
    }
  }

  // Create legacy URL aliases if needed.
  const legacyUrlAliasResults =
    legacyUrlAliases.size > 0
      ? (
          await savedObjectsClient.bulkCreate([...legacyUrlAliases.values()], {
            namespace,
            overwrite,
            refresh,
          })
        ).saved_objects
      : [];
  return {
    createdObjects: remappedResults.filter((obj) => !isSavedObjectErrorResult(obj)),
    errors: extractErrors(remappedResults, objects, legacyUrlAliasResults, legacyUrlAliases),
  };
};
