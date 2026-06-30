/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Scope discriminators aligned with `@kbn/change-history`:
 * - `module` / `dataset` — `ChangeHistoryClient` binding (`event.module`, `event.dataset`)
 * - `objectType` — `ObjectChange.objectType` / `object.type`
 */
export interface ChangeHistoryScope {
  module: string;
  dataset: string;
  objectType: string;
}
