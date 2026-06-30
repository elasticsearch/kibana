/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import type {
  DescriptionOrUndefined,
  EntriesArray,
  ExceptionListItemSchema,
  ExceptionListItemTypeOrUndefined,
  ExpireTimeOrUndefined,
  IdOrUndefined,
  ItemIdOrUndefined,
  MetaOrUndefined,
  NameOrUndefined,
  NamespaceType,
  OsTypeArray,
  TagsOrUndefined,
  UpdateCommentsArrayOrUndefined,
  _VersionOrUndefined,
} from '@kbn/securitysolution-io-ts-list-types';
import { getSavedObjectType } from '@kbn/securitysolution-list-utils';

import type { ExceptionListSoSchema } from '../../schemas/saved_objects';

import {
  transformSavedObjectUpdateToExceptionListItem,
  transformUpdateCommentsToComments,
} from './utils';
import { getExceptionListItem } from './get_exception_list_item';

export interface UpdateExceptionListItemOptions {
  id: IdOrUndefined;
  comments: UpdateCommentsArrayOrUndefined;
  _version: _VersionOrUndefined;
  name: NameOrUndefined;
  description: DescriptionOrUndefined;
  entries: EntriesArray;
  expireTime: ExpireTimeOrUndefined;
  savedObjectsClient: SavedObjectsClientContract;
  namespaceType: NamespaceType;
  osTypes: OsTypeArray;
  itemId: ItemIdOrUndefined;
  meta: MetaOrUndefined;
  user: string;
  tags: TagsOrUndefined;
  tieBreaker?: string;
  type: ExceptionListItemTypeOrUndefined;
}

export const updateExceptionListItem = async ({
  _version,
  comments,
  entries,
  expireTime,
  id,
  savedObjectsClient,
  namespaceType,
  name,
  osTypes,
  description,
  itemId,
  meta,
  user,
  userDisplayName = user,
  tags,
  type,
}: UpdateExceptionListItemOptions): Promise<ExceptionListItemSchema | null> => {
  const savedObjectType = getSavedObjectType({ namespaceType });
  const exceptionListItem = await getExceptionListItem({
    id,
    itemId,
    namespaceType,
    savedObjectsClient,
  });
  if (exceptionListItem == null) {
    return null;
  } else {
    const transformedComments = transformUpdateCommentsToComments({
      comments,
      existingComments: exceptionListItem.comments,
      user: userDisplayName,
    });
    const savedObject = await savedObjectsClient.update<ExceptionListSoSchema>(
      savedObjectType,
      exceptionListItem.id,
      {
        comments: transformedComments,
        description,
        entries,
        expire_time: expireTime,
        meta,
        name,
        os_types: osTypes,
        tags,
        type,
        updated_by: user,
      },
      {
        version: _version,
      }
    );
    return transformSavedObjectUpdateToExceptionListItem({
      exceptionListItem,
      savedObject,
    });
  }
};
