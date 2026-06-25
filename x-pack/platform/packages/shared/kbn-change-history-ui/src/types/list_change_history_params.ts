/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryListItem } from './change_history_list_item';

export interface ListChangeHistoryParams {
  objectId: string;
  spaceId?: string;
  /** Required — change history lists are always paginated. */
  page: { index: number; size: number };
  sort?: { field: 'timestamp' | 'sequence'; direction: 'asc' | 'desc' };
  signal?: AbortSignal;
}

export interface ListChangeHistoryResult {
  items: ChangeHistoryListItem[];
  total: number;
}

export interface GetChangeParams {
  objectId: string;
  /** Stable change id (maps to change-history `event.id` when backed by the platform store). */
  changeId: string;
  signal?: AbortSignal;
}
