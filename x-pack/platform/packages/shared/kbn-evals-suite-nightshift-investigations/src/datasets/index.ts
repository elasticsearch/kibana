/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The eval dataset contract, shared by every eval. Individual datasets are declared by the eval
 * that scores them, under `evals/<name>/datasets.ts`.
 */

export { selectDatasets } from './select_datasets';
export { toEvaluationDataset } from './to_evaluation_dataset';
export type { Dataset } from './types';
