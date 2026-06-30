/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  SavedObjectsImportFailure,
  SavedObjectsImportRetry,
} from '@kbn/core-saved-objects-common';
import type { SavedObject } from '@kbn/core-saved-objects-server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { SavedObjectsImportError } from '../errors';
import type { ImportStateMap } from './types';

const REF_TYPES_TO_VALIDATE = ['index-pattern', 'search'];

function filterReferencesToValidate({ type }: { type: string }) {
  return REF_TYPES_TO_VALIDATE.includes(type);
}

const getObjectsToSkip = (retries: SavedObjectsImportRetry[] = []) =>
  retries.reduce(
    (acc, { type, id, ignoreMissingReferences }) =>
      ignoreMissingReferences ? acc.add(`${type}:${id}`) : acc,
    new Set<string>()
  );

export interface ValidateReferencesParams {
  objects: Array<SavedObject<{ title?: string }>>;
  savedObjectsClient: SavedObjectsClientContract;
  namespace: string | undefined;
  importStateMap: ImportStateMap;
  retries?: SavedObjectsImportRetry[];
}

async function getNonExistingReferenceAsKeys({
  objects,
  savedObjectsClient,
  namespace,
  importStateMap,
  retries,
}: ValidateReferencesParams) {
  const objectsToSkip = getObjectsToSkip(retries);
  const collector = new Map();
  // Collect all references within objects
  for (const object of objects) {
    if (objectsToSkip.has(`${object.type}:${object.id}`)) {
      // skip objects with retries that have specified `ignoreMissingReferences`, or that share an origin with an existing object that has a different ID
      continue;
    }
    const filteredReferences = (object.references || []).filter(filterReferencesToValidate);
    for (const { type, id } of filteredReferences) {
      const key = `${type}:${id}`;
      const { isOnlyReference, destinationId } = importStateMap.get(key) ?? {};
      if (isOnlyReference && destinationId) {
        // We previously searched for this reference and found one with a matching origin, skip validating this
        continue;
      }
      collector.set(`${type}:${id}`, { type, id });
    }
  }

  // Remove objects that could be references
  for (const object of objects) {
    collector.delete(`${object.type}:${object.id}`);
  }
  if (collector.size === 0) {
    return [];
  }

  // Fetch references to see if they exist
  const bulkGetOpts = Array.from(collector.values()).map((obj) => ({ ...obj, fields: ['id'] }));
  const bulkGetResponse = await savedObjectsClient.bulkGet(bulkGetOpts, { namespace });

  // Error handling
  const erroredObjects = bulkGetResponse.saved_objects.filter(
    (obj) => isSavedObjectErrorResult(obj) && obj.error.statusCode !== 404
  );
  if (erroredObjects.length) {
    throw SavedObjectsImportError.referencesFetchError(erroredObjects);
  }

  // Cleanup collector
  for (const savedObject of bulkGetResponse.saved_objects) {
    if (isSavedObjectErrorResult(savedObject)) {
      continue;
    }
    collector.delete(`${savedObject.type}:${savedObject.id}`);
  }

  return [...collector.keys()];
}

export async function validateReferences(params: ValidateReferencesParams) {
  const { objects, retries } = params;
  const objectsToSkip = getObjectsToSkip(retries);
  const errorMap: { [key: string]: SavedObjectsImportFailure } = {};
  const nonExistingReferenceKeys = await getNonExistingReferenceAsKeys(params);

  // Filter out objects with missing references, add to error object
  for (const obj of objects) {
    const { type, id, references, attributes } = obj;
    const objectKey = `${type}:${id}`;
    if (objectsToSkip.has(objectKey)) {
      // skip objects with retries that have specified `ignoreMissingReferences`
      continue;
    }

    const missingReferences: Array<{ type: string; id: string }> = [];
    const enforcedTypeReferences = references?.filter(filterReferencesToValidate) || [];

    const seenReferences = new Set();
    for (const { type: refType, id: refId } of enforcedTypeReferences) {
      const refKey = `${refType}:${refId}`;

      if (nonExistingReferenceKeys.includes(refKey) && !seenReferences.has(refKey)) {
        missingReferences.push({ type: refType, id: refId });
        seenReferences.add(refKey);
      }
    }
    if (missingReferences.length > 0) {
      errorMap[objectKey] = {
        id,
        type,
        meta: { title: attributes.title },
        error: { type: 'missing_references', references: missingReferences },
      };
    }
  }

  return Object.values(errorMap);
}
