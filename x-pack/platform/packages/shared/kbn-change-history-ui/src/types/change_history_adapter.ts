/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryDetail } from './change_history_detail';
import type {
  GetChangeParams,
  ListChangeHistoryParams,
  ListChangeHistoryResult,
} from './list_change_history_params';

/** Integration surface between a domain plugin and the shared UI. */
export interface ChangeHistoryAdapter {
  listChanges: (params: ListChangeHistoryParams) => Promise<ListChangeHistoryResult>;
  getChange: (params: GetChangeParams) => Promise<ChangeHistoryDetail>;
}
