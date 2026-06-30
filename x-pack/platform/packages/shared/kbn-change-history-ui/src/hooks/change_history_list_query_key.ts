/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_CHANGE_HISTORY_PAGE_SIZE } from '../types/change_history_constants';

export const CHANGE_HISTORY_QUERY_KEY = ['change-history'] as const;

/** @deprecated Use {@link CHANGE_HISTORY_QUERY_KEY} or {@link changeHistoryObjectQueryKeyPrefix} */
export const CHANGE_HISTORY_LIST_QUERY_KEY = [...CHANGE_HISTORY_QUERY_KEY, 'list'] as const;

export const changeHistoryObjectQueryKeyPrefix = (objectId: string) =>
  [...CHANGE_HISTORY_QUERY_KEY, objectId] as const;

/** @deprecated Use {@link changeHistoryObjectQueryKeyPrefix} */
export const changeHistoryListQueryKeyPrefix = changeHistoryObjectQueryKeyPrefix;

export const changeHistoryListQueryKey = ({
  objectId,
  pageSize = DEFAULT_CHANGE_HISTORY_PAGE_SIZE,
}: {
  objectId: string;
  pageSize?: number;
}) => [...changeHistoryObjectQueryKeyPrefix(objectId), 'list', pageSize] as const;

export const changeHistoryDetailQueryKey = ({
  objectId,
  changeId,
}: {
  objectId: string;
  changeId: string;
}) => [...changeHistoryObjectQueryKeyPrefix(objectId), 'detail', changeId] as const;
