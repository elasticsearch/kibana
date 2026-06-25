/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryListItem } from './change_history_list_item';

/** Full change payload returned for preview. */
export interface ChangeHistoryDetail extends ChangeHistoryListItem {
  /** Reason string when captured at write time. */
  reason?: string;
  /** Domain payload for preview slot — shape is opaque to the UI package. */
  snapshot: unknown;
}
