/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateExceptionListItemSchema,
  ExceptionListSchema,
  FoundExceptionListItemSchema,
  NamespaceType,
} from '@kbn/securitysolution-io-ts-list-types';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import { getSavedObjectType } from '@kbn/securitysolution-list-utils';

import { findExceptionListItemsPointInTimeFinder } from './find_exception_list_items_point_in_time_finder';
import { bulkCreateExceptionListItems } from './bulk_create_exception_list_items';
import { createExceptionList } from './create_exception_list';

const LISTS_ABLE_TO_DUPLICATE = [
  ExceptionListTypeEnum.DETECTION.toString(),
  ExceptionListTypeEnum.RULE_DEFAULT.toString(),
];

interface DuplicateExceptionListOptions {
  list: ExceptionListSchema;
  savedObjectsClient: SavedObjectsClientContract;
  namespaceType: NamespaceType;
  user: string;
  includeExpiredExceptions: boolean;
}

export const duplicateExceptionListAndItems = async ({
  includeExpiredExceptions,
  list,
  savedObjectsClient,
  namespaceType,
  user,
}: DuplicateExceptionListOptions): Promise<ExceptionListSchema | null> => {
  // Generate a new static listId
  const newListId = uuidv4();

  if (!LISTS_ABLE_TO_DUPLICATE.includes(list.type)) {
    return null;
  }

  const newlyCreatedList = await createExceptionList({
    description: list.description,
    immutable: list.immutable,
    listId: newListId,
    meta: list.meta,
    name: `${list.name} [Duplicate]`,
    namespaceType: list.namespace_type,
    osTypes: list.os_types,
    savedObjectsClient,
    tags: list.tags,
    type: list.type,
    user,
    version: 1,
  });

  // fetch associated items
  let itemsToBeDuplicated: CreateExceptionListItemSchema[] = [];
  const executeFunctionOnStream = (response: FoundExceptionListItemSchema): void => {
    const transformedItems = response.data.map((item) => {
      // Generate a new static listId
      const newItemId = uuidv4();

      return {
        comments: [],
        description: item.description,
        entries: item.entries,
        expire_time: item.expire_time,
        item_id: newItemId,
        list_id: newlyCreatedList.list_id,
        meta: item.meta,
        name: item.name,
        namespace_type: item.namespace_type,
        os_types: item.os_types,
        tags: item.tags,
        type: item.type,
      };
    });
    itemsToBeDuplicated = [...itemsToBeDuplicated, ...transformedItems];
  };
  const savedObjectPrefix = getSavedObjectType({ namespaceType });
  const filter = includeExpiredExceptions
    ? []
    : [
        `(${savedObjectPrefix}.attributes.expire_time > "${new Date().toISOString()}" OR NOT ${savedObjectPrefix}.attributes.expire_time: *)`,
      ];
  await findExceptionListItemsPointInTimeFinder({
    executeFunctionOnStream,
    filter,
    listId: [list.list_id],
    maxSize: 10000,
    namespaceType: [namespaceType],
    perPage: undefined,
    savedObjectsClient,
    sortField: undefined,
    sortOrder: undefined,
  });

  await bulkCreateExceptionListItems({
    items: itemsToBeDuplicated,
    savedObjectsClient,
    user,
  });

  return newlyCreatedList;
};
