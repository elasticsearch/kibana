/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryScope } from '../types/change_history_scope';
import { DEFAULT_CHANGE_HISTORY_PAGE_SIZE } from '../types/change_history_constants';

export const CHANGE_HISTORY_QUERY_KEY = ['change-history'] as const;

export const changeHistoryScopeQueryKeyPrefix = (scope: ChangeHistoryScope) =>
  [...CHANGE_HISTORY_QUERY_KEY, scope.module, scope.dataset, scope.objectType] as const;

export const changeHistoryObjectQueryKeyPrefix = (objectId: string, scope: ChangeHistoryScope) =>
  [...changeHistoryScopeQueryKeyPrefix(scope), objectId] as const;

export const changeHistoryListQueryKey = ({
  objectId,
  scope,
  pageSize = DEFAULT_CHANGE_HISTORY_PAGE_SIZE,
}: {
  objectId: string;
  scope: ChangeHistoryScope;
  pageSize?: number;
}) => [...changeHistoryObjectQueryKeyPrefix(objectId, scope), 'list', pageSize] as const;

export const changeHistoryDetailQueryKey = ({
  objectId,
  changeId,
  scope,
}: {
  objectId: string;
  changeId: string;
  scope: ChangeHistoryScope;
}) => [...changeHistoryObjectQueryKeyPrefix(objectId, scope), 'detail', changeId] as const;
