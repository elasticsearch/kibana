/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type {
  SavedObjectsExportablePredicate,
  ISavedObjectTypeRegistry,
  SavedObjectsExportTransform,
  SavedObject,
} from '@kbn/core-saved-objects-server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import { applyExportTransforms } from './apply_export_transforms';

interface CollectExportedObjectOptions {
  savedObjectsClient: SavedObjectsClientContract;
  objects: SavedObject[];
  /** flag to also include all related saved objects in the export stream. */
  includeReferences?: boolean;
  /** optional namespace to override the namespace used by the savedObjectsClient. */
  namespace?: string;
  /** The http request initiating the export. */
  request: KibanaRequest;
  /** export transform per type */
  typeRegistry: ISavedObjectTypeRegistry;
  /** logger to use to log potential errors */
  logger: Logger;
}

interface CollectExportedObjectResult {
  objects: SavedObject[];
  excludedObjects: ExcludedObject[];
  missingRefs: CollectedReference[];
}

interface ExcludedObject {
  id: string;
  type: string;
  reason: ExclusionReason;
}

export type ExclusionReason = 'predicate_error' | 'excluded';

export const collectExportedObjects = async ({
  objects,
  includeReferences = true,
  namespace,
  request,
  typeRegistry,
  savedObjectsClient,
  logger,
}: CollectExportedObjectOptions): Promise<CollectExportedObjectResult> => {
  const exportTransforms = buildTransforms(typeRegistry);
  const isExportable = buildIsExportable(typeRegistry);

  const collectedObjects: SavedObject[] = [];
  const collectedMissingRefs: CollectedReference[] = [];
  const collectedNonExportableObjects: ExcludedObject[] = [];
  const alreadyProcessed: Set<string> = new Set();

  let currentObjects = objects;
  do {
    currentObjects = currentObjects.filter((object) => !alreadyProcessed.has(objKey(object)));

    // first, evict current objects that are not exportable
    const {
      exportable: untransformedExportableInitialObjects,
      nonExportable: nonExportableInitialObjects,
    } = await splitByExportability(currentObjects, isExportable, logger);
    collectedNonExportableObjects.push(...nonExportableInitialObjects);
    nonExportableInitialObjects.forEach((obj) => alreadyProcessed.add(objKey(obj)));

    // second, apply export transforms to exportable objects
    const transformedObjects = (
      await applyExportTransforms({
        request,
        objects: untransformedExportableInitialObjects,
        transforms: exportTransforms,
      })
    ).filter((object) => !alreadyProcessed.has(objKey(object)));
    transformedObjects.forEach((obj) => alreadyProcessed.add(objKey(obj)));

    // last, evict additional objects that are not exportable
    const { included: exportableInitialObjects, excluded: additionalObjects } = splitByKeys(
      transformedObjects,
      untransformedExportableInitialObjects.map((obj) => objKey(obj))
    );
    const {
      exportable: exportableAdditionalObjects,
      nonExportable: nonExportableAdditionalObjects,
    } = await splitByExportability(additionalObjects, isExportable, logger);
    const allExportableObjects = [...exportableInitialObjects, ...exportableAdditionalObjects];
    collectedNonExportableObjects.push(...nonExportableAdditionalObjects);
    collectedObjects.push(...allExportableObjects);

    // if `includeReferences` is true, recurse on exportable objects' references.
    if (includeReferences) {
      const references = collectReferences(allExportableObjects, alreadyProcessed);
      if (references.length) {
        const { objects: fetchedObjects, missingRefs } = await fetchReferences({
          references,
          namespace,
          client: savedObjectsClient,
        });
        collectedMissingRefs.push(...missingRefs);
        currentObjects = fetchedObjects;
      } else {
        currentObjects = [];
      }
    } else {
      currentObjects = [];
    }
  } while (includeReferences && currentObjects.length);

  return {
    objects: collectedObjects,
    excludedObjects: collectedNonExportableObjects,
    missingRefs: collectedMissingRefs,
  };
};

const objKey = (obj: { type: string; id: string }) => `${obj.type}:${obj.id}`;

type ObjectKey = string;

interface CollectedReference {
  id: string;
  type: string;
}

const collectReferences = (
  objects: SavedObject[],
  alreadyProcessed: Set<ObjectKey>
): CollectedReference[] => {
  const references: Map<string, CollectedReference> = new Map();
  objects.forEach((obj) => {
    obj.references?.forEach((ref) => {
      const refKey = objKey(ref);
      if (!alreadyProcessed.has(refKey)) {
        references.set(refKey, { type: ref.type, id: ref.id });
      }
    });
  });
  return [...references.values()];
};

interface FetchReferencesResult {
  objects: SavedObject[];
  missingRefs: CollectedReference[];
}

const fetchReferences = async ({
  references,
  client,
  namespace,
}: {
  references: CollectedReference[];
  client: SavedObjectsClientContract;
  namespace?: string;
}): Promise<FetchReferencesResult> => {
  const { saved_objects: savedObjects } = await client.bulkGet(references, { namespace });
  return {
    objects: savedObjects.filter((obj) => !isSavedObjectErrorResult(obj)),
    missingRefs: savedObjects
      .filter((obj) => isSavedObjectErrorResult(obj))
      .map((obj) => ({ type: obj.type, id: obj.id })),
  };
};

const buildTransforms = (typeRegistry: ISavedObjectTypeRegistry) =>
  typeRegistry.getAllTypes().reduce((transformMap, type) => {
    if (type.management?.onExport) {
      transformMap.set(type.name, type.management.onExport);
    }
    return transformMap;
  }, new Map<string, SavedObjectsExportTransform>());

const buildIsExportable = (
  typeRegistry: ISavedObjectTypeRegistry
): SavedObjectsExportablePredicate<any> => {
  const exportablePerType = typeRegistry.getAllTypes().reduce((exportableMap, type) => {
    if (type.management?.isExportable) {
      exportableMap.set(type.name, type.management.isExportable);
    }
    return exportableMap;
  }, new Map<string, SavedObjectsExportablePredicate>());

  return (obj: SavedObject) => {
    const typePredicate = exportablePerType.get(obj.type);
    return typePredicate ? typePredicate(obj) : true;
  };
};

const splitByExportability = (
  objects: SavedObject[],
  isExportable: SavedObjectsExportablePredicate<any>,
  logger: Logger
) => {
  const exportableObjects: SavedObject[] = [];
  const nonExportableObjects: ExcludedObject[] = [];

  objects.forEach((obj) => {
    try {
      const exportable = isExportable(obj);
      if (exportable) {
        exportableObjects.push(obj);
      } else {
        nonExportableObjects.push({
          id: obj.id,
          type: obj.type,
          reason: 'excluded',
        });
      }
    } catch (e) {
      logger.error(
        `Error invoking "isExportable" for object ${obj.type}:${obj.id}. Error was: ${
          e.stack ?? e.message
        }`
      );
      nonExportableObjects.push({
        id: obj.id,
        type: obj.type,
        reason: 'predicate_error',
      });
    }
  });

  return {
    exportable: exportableObjects,
    nonExportable: nonExportableObjects,
  };
};

const splitByKeys = (objects: SavedObject[], keys: ObjectKey[]) => {
  const included: SavedObject[] = [];
  const excluded: SavedObject[] = [];
  objects.forEach((obj) => {
    if (keys.includes(objKey(obj))) {
      included.push(obj);
    } else {
      excluded.push(obj);
    }
  });
  return {
    included,
    excluded,
  };
};
