/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationDataset, Example } from '@kbn/evals';
import type { Dataset } from './types';

/**
 * Shapes a suite dataset into what `runExperiment` records scores against.
 *
 * Suite-specific fields are destructured away and the rest spread, so a field added to
 * `EvaluationDataset` keeps flowing through. Listing them by hand is how one silently stops.
 */
export const toEvaluationDataset = <TExample extends Example>({
  id,
  seedSource,
  examples,
  ...frameworkFields
}: Dataset<TExample>): EvaluationDataset<TExample> => ({
  ...frameworkFields,
  examples: [...examples()],
});
