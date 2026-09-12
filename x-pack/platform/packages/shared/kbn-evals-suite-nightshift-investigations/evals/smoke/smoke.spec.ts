/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@playwright/test';
import { selectEvaluators } from '@kbn/evals';
import { tags } from '@kbn/scout';
import { toEvaluationDataset } from '../../src/datasets';
import { evaluate } from '../../src/evaluate';
import { withSeedData } from '../../src/seed_data';
import { getSmokeDatasets } from './datasets';
import { smokeEvaluators } from './evaluators';
import { summarizeSeedData } from './task';

/**
 * Checks that the suite itself works: it seeds an eval dataset's data, reports what reached the
 * cluster and scores that with CODE evaluators.
 *
 * No model takes part, so a red score here means seed data loading, score ingestion or the
 * golden-cluster export is broken rather than that investigation quality regressed.
 */
evaluate.describe('Nightshift investigations: smoke', { tag: tags.stateful.classic }, () => {
  for (const dataset of getSmokeDatasets()) {
    evaluate.describe(dataset.id, () => {
      const seedData = withSeedData(dataset);

      evaluate(
        'seeds its data into the eval cluster and records the scores',
        async ({ executorClient, esClient, evalsClient }) => {
          const evaluators = selectEvaluators(smokeEvaluators);

          expect(evaluators.length).toBeGreaterThan(0);

          const [experiment] = await executorClient.runExperiment(
            {
              datasets: [toEvaluationDataset(dataset)],
              task: () => summarizeSeedData({ esClient, indices: seedData().indices }),
            },
            evaluators
          );

          const scores = experiment.evaluationRuns.map((run) => run.result?.score);
          expect(scores.length).toBeGreaterThanOrEqual(evaluators.length);
          expect(scores.every((score) => score === 1)).toBe(true);

          const recorded = await evalsClient.getExperimentScores(experiment.id);
          const recordedScores = new Map(
            recorded.map(({ evaluator }) => [evaluator.name, evaluator.score])
          );

          for (const { name } of evaluators) {
            expect(recordedScores.get(name)).toBe(1);
          }
        }
      );
    });
  }
});
