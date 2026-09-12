/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator, Example } from '@kbn/evals';
import type { SeedDataSummary } from './task';

/** Ground truth for this eval: what seeded data should look like once it has landed. */
export interface SmokeExpectation {
  /** Documents the dataset's seed snapshot is known to hold. */
  minimum_document_count: number;
  /**
   * How stale the newest document may be. Replay rewrites the newest `@timestamp` to "now", so
   * anything older than this means the timestamp shift did not happen.
   */
  maximum_document_age_ms: number;
}

/**
 * The intersection makes `output` required, which lets evaluators read the expectation without
 * a runtime guard: an example without ground truth is a dataset bug, not an eval outcome.
 */
export type SmokeExample = Example<{ dataset_id: string }, SmokeExpectation> & {
  output: SmokeExpectation;
};

export type SmokeEvaluator = Evaluator<SmokeExample, SeedDataSummary>;
