/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type {
  ChangeHistoryFeatures,
  ChangeHistoryPermissions,
  ChangeHistorySupports,
} from '../types/change_history_features';

export interface ResolveChangeHistorySupportsOptions {
  features?: ChangeHistoryFeatures;
  permissions?: ChangeHistoryPermissions;
}

export const resolveChangeHistorySupports = (
  adapter: ChangeHistoryAdapter,
  { features, permissions }: ResolveChangeHistorySupportsOptions = {}
): ChangeHistorySupports => {
  const restore =
    features?.restore === true &&
    typeof adapter.restoreChange === 'function' &&
    permissions?.canRestore === true;

  return { restore };
};
