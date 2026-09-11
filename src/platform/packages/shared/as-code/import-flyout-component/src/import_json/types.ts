/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface SanitizeImportJsonResult<SanitizedState> {
  data: SanitizedState;
  warnings: string[];
}

export type SanitizeImportJson<SanitizedState> = (
  raw: unknown
) => Promise<SanitizeImportJsonResult<SanitizedState>>;

export interface CreateFromJsonResult {
  id: string;
  title: string;
}

export type CreateFromJson<SanitizedState> = (
  data: SanitizedState
) => Promise<CreateFromJsonResult>;

/** Narrow CoreStart slice used by the import flyout (no Core package dependency). */
export interface ImportJsonFlyoutServices {
  application: {
    getUrlForApp: (appId: string, options?: { path?: string }) => string;
  };
  notifications: {
    toasts: {
      addDanger: (input: { title: string; text?: string }) => unknown;
    };
  };
}
