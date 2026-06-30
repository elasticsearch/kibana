/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EmptyStringArrayDecoded } from '@kbn/securitysolution-io-ts-types';
import type { SavedObjectType } from '@kbn/securitysolution-list-utils';

import { escapeQuotes } from '../../utils/escape_query';

export const getExceptionListsItemFilter = ({
  filter,
  globalFilter,
  listId,
  savedObjectType,
}: {
  listId: string[];
  filter?: EmptyStringArrayDecoded;
  globalFilter?: string;
  savedObjectType: SavedObjectType[];
}): string => {
  return listId.reduce((accum, singleListId, index) => {
    const escapedListId = escapeQuotes(singleListId);
    const listItemAppend = `(${savedObjectType[index]}.attributes.list_type: item AND ${savedObjectType[index]}.attributes.list_id: "${escapedListId}")`;
    const listFilter = filter?.[index] ?? globalFilter;
    const listItemAppendWithFilter =
      listFilter != null ? `(${listItemAppend} AND (${listFilter}))` : listItemAppend;
    if (accum === '') {
      return listItemAppendWithFilter;
    } else {
      return `${accum} OR ${listItemAppendWithFilter}`;
    }
  }, '');
};
