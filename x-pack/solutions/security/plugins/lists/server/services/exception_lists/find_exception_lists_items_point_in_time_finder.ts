/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import type {
  FoundExceptionListItemSchema,
  MaxSizeOrUndefined,
  NamespaceTypeArray,
  PerPageOrUndefined,
  SortFieldOrUndefined,
  SortOrderOrUndefined,
} from '@kbn/securitysolution-io-ts-list-types';
import { getSavedObjectTypes } from '@kbn/securitysolution-list-utils';

import type { ExceptionListSoSchema } from '../../schemas/saved_objects';

import { transformSavedObjectsToFoundExceptionListItem } from './utils';
import { getExceptionListsItemFilter } from './utils/get_exception_lists_item_filter';

interface FindExceptionListsItemsPointInTimeFinderOptions {
  listIds: string[];
  namespaceTypes: NamespaceTypeArray;
  savedObjectsClient: SavedObjectsClientContract;
  filter: string | undefined;
  perPage: PerPageOrUndefined;
  sortField: SortFieldOrUndefined;
  sortOrder: SortOrderOrUndefined;
  executeFunctionOnStream: (response: FoundExceptionListItemSchema) => void;
  maxSize: MaxSizeOrUndefined;
}

/**
 * Finds exception list items within a point in time (PIT) and then calls the function
 * `executeFunctionOnStream` until the maxPerPage is reached and stops.
 * NOTE: This is slightly different from the saved objects version in that it takes
 * an injected function, so that we avoid doing additional plumbing with generators
 * to try to keep the maintenance of this machinery simpler for now.
 *
 * The notable difference between this function and `findExceptionListItemsPointInTimeFinder` is that this does not:
 *   * re-fetch the lists themselves
 *   * reuses the same filter for each page/segment of the query
 *
 * If you want to stream all results up to 10k into memory for correlation this would be:
 * @example
 * ```ts
 * const exceptionList: ExceptionListItemSchema[] = [];
 * const executeFunctionOnStream = (response: FoundExceptionListItemSchema) => {
 *   exceptionList = [...exceptionList, ...response.data];
 * }
 * await client.findExceptionListItemsPointInTimeFinder({
 *   filter,
 *   executeFunctionOnStream,
 *   namespaceType,
 *   maxSize: 10_000, // NOTE: This is unbounded if it is "undefined"
 *   perPage: 1_000, // See https://github.com/elastic/kibana/issues/93770 for choice of 1k
 *   sortField,
 *   sortOrder,
 *   exe
 * });
 * ```
 * @param listIds {NonEmptyStringArrayDecoded} The list IDs to filter against
 * @param filter {string} User KQL filter
 * @param namespaceType {string} "agnostic" | "single" of your namespace
 * @param perPage {number} The number of items per page. Typical value should be 1_000 here. Never go above 10_000
 * @param maxSize {number of undefined} If given a max size, this will not exceeded. Otherwise if undefined is passed down, all records will be processed.
 * @param sortField {string} String of the field to sort against
 * @param savedObjectsClient {Object} The saved object client
 * @param sortOrder "asc" | "desc" The order to sort against
 */
export const findExceptionListsItemsPointInTimeFinder = async ({
  listIds,
  namespaceTypes,
  savedObjectsClient,
  executeFunctionOnStream,
  maxSize,
  filter,
  perPage,
  sortField,
  sortOrder,
}: FindExceptionListsItemsPointInTimeFinderOptions): Promise<void> => {
  const savedObjectTypes = getSavedObjectTypes({ namespaceType: namespaceTypes });
  const finder = savedObjectsClient.createPointInTimeFinder<ExceptionListSoSchema, never>({
    filter: getExceptionListsItemFilter({
      globalFilter: filter,
      listId: listIds,
      savedObjectType: savedObjectTypes,
    }),
    perPage,
    sortField,
    sortOrder,
    type: savedObjectTypes,
  });

  let count = 0;
  for await (const savedObjectsFindResponse of finder.find()) {
    count += savedObjectsFindResponse.saved_objects.length;
    const exceptionListItem = transformSavedObjectsToFoundExceptionListItem({
      savedObjectsFindResponse,
    });
    if (maxSize != null && count > maxSize) {
      const diff = count - maxSize;
      exceptionListItem.data = exceptionListItem.data.slice(0, -diff);
      executeFunctionOnStream(exceptionListItem);
      try {
        await finder.close();
      } catch {
        // This is just a pre-caution in case the finder does a throw we don't want to blow up
        // the response. We have seen this within e2e test containers but nothing happen in normal
        // operational conditions which is why this try/catch is here.
      }
      // early return since we are at our maxSize
      return;
    } else {
      executeFunctionOnStream(exceptionListItem);
    }
  }

  try {
    await finder.close();
  } catch {
    // This is just a pre-caution in case the finder does a throw we don't want to blow up
    // the response. We have seen this within e2e test containers but nothing happen in normal
    // operational conditions which is why this try/catch is here.
  }
};
