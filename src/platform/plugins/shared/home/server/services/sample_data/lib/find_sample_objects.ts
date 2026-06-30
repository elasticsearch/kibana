/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as esKuery from '@kbn/es-query';
import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';

const MAX_OBJECTS_TO_FIND = 10000; // we only expect up to a few dozen, search for 10k to be safe; anything over this is ignored

export interface FindSampleObjectsParams {
  client: SavedObjectsClientContract;
  logger: Logger;
  objects: SampleObject[];
}

export interface SampleObject {
  type: string;
  id: string;
}

export interface FindSampleObjectsResponseObject {
  type: string;
  id: string;
  /** Contains a string if this sample data object was found, or undefined if it was not. */
  foundObjectId: string | undefined;
}

/**
 * Given an array of objects in a sample dataset, this function attempts to find if those objects exist in the current space.
 * It attempts to find objects with an origin of the sample data (e.g., matching `id` or `originId`).
 */
export async function findSampleObjects({ client, logger, objects }: FindSampleObjectsParams) {
  const bulkGetResponse = await client.bulkGet(objects);

  let resultsMap = new Map<string, string>();
  const objectsToFind: SampleObject[] = [];
  objects.forEach((object, i) => {
    const bulkGetResult = bulkGetResponse.saved_objects[i];
    if (!isSavedObjectErrorResult(bulkGetResult)) {
      const { type, id } = object;
      const key = getObjKey(type, id);
      resultsMap.set(key, id);
    } else if (bulkGetResult.error.statusCode === 404) {
      objectsToFind.push(object);
    }
  });

  if (objectsToFind.length > 0) {
    const options = {
      type: getUniqueTypes(objectsToFind),
      filter: createKueryFilter(objectsToFind),
      fields: ['title'], // we don't want to return all source fields, so we have to specify at least one source field
      perPage: MAX_OBJECTS_TO_FIND,
    };
    const findResponse = await client.find(options);
    if (findResponse.total > MAX_OBJECTS_TO_FIND) {
      // As of this writing, it is not possible to encounter this scenario when using Kibana import or copy-to-space, because at most one
      // object can exist in a given space. However, as of today, when objects are shareable you _could_ get Kibana into a state where
      // multiple objects of the same origin exist in the same space.
      // #116677 describes solutions to fully mitigate this edge case in the future.
      logger.warn(
        `findSampleObjects got ${findResponse.total} results, only using the first ${MAX_OBJECTS_TO_FIND}`
      );
    }
    resultsMap = findResponse.saved_objects.reduce((acc, { type, id, originId }) => {
      const key = getObjKey(type, originId!);
      const existing = acc.get(key);
      if (existing) {
        // As of this writing, it is not possible to encounter this scenario when using Kibana import or copy-to-space, because at most one
        // object can exist in a given space. However, as of today, when objects are shareable you _could_ get Kibana into a state where
        // multiple objects of the same origin exist in the same space.
        // #116677 describes solutions to fully mitigate this edge case in the future.
        logger.warn(
          `Found two sample objects with the same origin "${originId}" (previously found "${existing}", ignoring "${id}")`
        );
        return acc;
      }
      return acc.set(key, id);
    }, resultsMap);
  }

  return objects.map<FindSampleObjectsResponseObject>(({ type, id }) => {
    const key = getObjKey(type, id);
    return { type, id, foundObjectId: resultsMap.get(key) };
  });
}

function getUniqueTypes(objects: SampleObject[]) {
  return [...new Set(objects.map(({ type }) => type))];
}

function createKueryFilter(objects: SampleObject[]) {
  const { buildNode } = esKuery.nodeTypes.function;
  const kueryNodes = objects.map(({ type, id }) => buildNode('is', `${type}.originId`, id)); // the repository converts this node into "and (type is ..., originId is ...)"
  return buildNode('or', kueryNodes);
}

function getObjKey(type: string, id: string) {
  return `${type}:${id}`;
}
