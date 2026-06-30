/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Parameters for restoring a historical change through the domain adapter. */
export interface RestoreChangeParams {
  objectId: string;
  changeId: string;
  signal?: AbortSignal;
}
