/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { EvaluationIndices } from '@kbn/evals-common';
import { types } from '@kbn/storage-adapter';

export const datasetsStorageSettings = {
  name: EvaluationIndices.DATASETS,
  schema: {
    properties: {
      name: types.keyword({}),
      description: types.text({}),
      examples_count: types.long({}),
      created_at: types.date({}),
      updated_at: types.date({}),
    },
  },
} satisfies IndexStorageSettings;

export interface DatasetStorageProperties {
  name: string;
  description: string;
  examples_count?: number;
  created_at: string;
  updated_at: string;
}
