/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface AiIndexField {
  path: string;
  /** ES field type, or `conflict` when the target's indices map this path to different types. */
  type: string;
  searchable: boolean;
  aggregatable: boolean;
}

export interface AiIndexTagCount {
  tag: string;
  count: number;
}
