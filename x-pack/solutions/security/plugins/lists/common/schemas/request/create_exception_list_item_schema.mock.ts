/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CreateExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';

import {
  COMMENTS,
  DESCRIPTION,
  ENTRIES,
  EXPIRE_TIME,
  ITEM_ID,
  ITEM_TYPE,
  LIST_ID,
  META,
  NAME,
  NAMESPACE_TYPE,
  OS_TYPES,
  TAGS,
} from '../../constants.mock';

export const getCreateExceptionListItemSchemaMock = (): CreateExceptionListItemSchema => ({
  comments: COMMENTS,
  description: DESCRIPTION,
  entries: ENTRIES,
  item_id: undefined,
  list_id: LIST_ID,
  meta: META,
  name: NAME,
  namespace_type: NAMESPACE_TYPE,
  os_types: OS_TYPES,
  tags: TAGS,
  type: ITEM_TYPE,
});

/**
 * Useful for end to end testing
 */
export const getCreateExceptionListItemMinimalSchemaMock = (
  overrides: Partial<CreateExceptionListItemSchema> = {}
): CreateExceptionListItemSchema => ({
  description: DESCRIPTION,
  entries: ENTRIES,
  item_id: ITEM_ID,
  list_id: LIST_ID,
  name: NAME,
  os_types: OS_TYPES,
  type: ITEM_TYPE,
  ...overrides,
});

/**
 * Useful for end to end testing
 */
export const getCreateExceptionListItemMinimalSchemaMockWithoutId =
  (): CreateExceptionListItemSchema => ({
    description: DESCRIPTION,
    entries: ENTRIES,
    list_id: LIST_ID,
    name: NAME,
    os_types: OS_TYPES,
    type: ITEM_TYPE,
  });

/**
 * Useful for testing newer exception list item versions, as the previous
 * versions can be used to test migration cases
 */
export const getCreateExceptionListItemNewerVersionSchemaMock =
  (): CreateExceptionListItemSchema => ({
    description: DESCRIPTION,
    entries: ENTRIES,
    expire_time: EXPIRE_TIME,
    list_id: LIST_ID,
    name: NAME,
    os_types: OS_TYPES,
    type: ITEM_TYPE,
  });
