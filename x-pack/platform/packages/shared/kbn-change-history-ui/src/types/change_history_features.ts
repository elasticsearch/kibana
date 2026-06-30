/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Product-level feature toggles for change-history UI affordances. */
export interface ChangeHistoryFeatures {
  /** When true, restore is shown when the adapter implements `restoreChange`. */
  restore?: boolean;
}

/** Optional privilege hints supplied by the host application. */
export interface ChangeHistoryPermissions {
  /** Must be `true` to enable restore when `features.restore` is on. */
  canRestore?: boolean;
}

/** Resolved capabilities after combining features, adapter, and host gates. */
export interface ChangeHistorySupports {
  restore: boolean;
}
