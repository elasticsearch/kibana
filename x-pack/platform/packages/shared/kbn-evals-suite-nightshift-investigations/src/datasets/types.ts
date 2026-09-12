/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationDataset, Example } from '@kbn/evals';
import type { SeedSource } from '../seed_data/types';

/**
 * An eval dataset: the examples scored during a run, plus where the Elasticsearch documents they
 * are scored against come from.
 *
 * The two halves are deliberately independent. `examples` is the ground truth, `seedSource` is
 * the data under it, and several eval datasets may point at the same seed data.
 *
 * Everything the framework persists is inherited from `EvaluationDataset` rather than restated,
 * so a field added there shows up here and cannot be dropped on the way back out. `name` is worth
 * knowing about: scores are attributed to it, so renaming one starts a new dataset.
 *
 * `id` and `examples` are overridden because the framework's `EvaluationDataset` reserves `id`
 * for datasets already stored server-side, and takes its examples as a plain array.
 */
export interface Dataset<TExample extends Example = Example>
  extends Omit<EvaluationDataset<TExample>, 'examples' | 'id'> {
  /** Selector accepted by `NIGHTSHIFT_DATASETS`, also used as the Playwright describe title. */
  id: string;
  seedSource: SeedSource;
  /**
   * Called rather than held inline so a dataset can build its examples when Playwright collects
   * the describe tree, which happens synchronously.
   */
  examples: () => readonly TExample[];
}
