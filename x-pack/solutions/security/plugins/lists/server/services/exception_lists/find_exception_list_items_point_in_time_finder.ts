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
import type {
  EmptyStringArrayDecoded,
  NonEmptyStringArrayDecoded,
} from '@kbn/securitysolution-io-ts-types';
import { getSavedObjectTypes } from '@kbn/securitysolution-list-utils';

import type { ExceptionListSoSchema } from '../../schemas/saved_objects';

import { transformSavedObjectsToFoundExceptionListItem } from './utils';
import { getExceptionList } from './get_exception_list';
import { getExceptionListsItemFilter } from './utils/get_exception_lists_item_filter';

interface FindExceptionListItemsPointInTimeFinderOptions {
  listId: NonEmptyStringArrayDecoded;
  namespaceType: NamespaceTypeArray;
  savedObjectsClient: SavedObjectsClientContract;
  filter: EmptyStringArrayDecoded;
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
 * @param filter {string} Your filter
 * @param namespaceType {string} "agnostic" | "single" of your namespace
 * @param perPage {number} The number of items per page. Typical value should be 1_000 here. Never go above 10_000
 * @param maxSize {number of undefined} If given a max size, this will not exceeded. Otherwise if undefined is passed down, all records will be processed.
 * @param sortField {string} String of the field to sort against
 * @param savedObjectsClient {Object} The saved object client
 * @param sortOrder "asc" | "desc" The order to sort against
 */
export const findExceptionListItemsPointInTimeFinder = async ({
  listId,
  namespaceType,
  savedObjectsClient,
  executeFunctionOnStream,
  maxSize,
  filter,
  perPage,
  sortField,
  sortOrder,
}: FindExceptionListItemsPointInTimeFinderOptions): Promise<void> => {
  const savedObjectType = getSavedObjectTypes({ namespaceType });
  const exceptionLists = (
    await Promise.all(
      listId.map((singleListId, index) => {
        return getExceptionList({
          id: undefined,
          listId: singleListId,
          namespaceType: namespaceType[index],
          savedObjectsClient,
        });
      })
    )
  ).filter((list) => list != null);
  if (exceptionLists.length !== 0) {
    const finder = savedObjectsClient.createPointInTimeFinder<ExceptionListSoSchema, never>({
      filter: getExceptionListsItemFilter({ filter, listId, savedObjectType }),
      perPage,
      sortField,
      sortOrder,
      type: savedObjectType,
    });

    let count = 0;
    for await (const savedObjectsFindResponse of finder.find()) {
      count += savedObjectsFindResponse.saved_objects.length;
      const exceptionListItem = transformSavedObjectsToFoundExceptionListItem({
        savedObjectsFindResponse,
      });
      if (maxSize != null && count > maxSize) {
        const diff = count - maxSize;
        exceptionListItem.data = exceptionListItem.data.slice(
          -exceptionListItem.data.length,
          -diff
        );
        executeFunctionOnStream(exceptionListItem);
        try {
          await finder.close();
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (exception) {
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (exception) {
      // This is just a pre-caution in case the finder does a throw we don't want to blow up
      // the response. We have seen this within e2e test containers but nothing happen in normal
      // operational conditions which is why this try/catch is here.
    }
  }
};
