/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/evals';
import { denseProfileLiveRetrievalDataset } from '../src/datasets/dense_profile_live_retrieval';
import { cleanupAd2ScenarioProfile, seedAd2ScenarioProfile } from '../src/scenario_registry';
import { evaluate } from '../src/evaluate';

evaluate.describe(
  'Attack Discovery Agent Builder — dense profile (scenario registry)',
  { tag: tags.stateful.classic },
  () => {
    evaluate.beforeAll(async ({ esClient, fetch }) => {
      await seedAd2ScenarioProfile(esClient, fetch, { profile: 'dense' });
      await fetch('/internal/elastic_assistant/update_anonymization_fields', {
        method: 'POST',
        headers: { 'elastic-api-version': '1' },
      });
    });

    evaluate.afterAll(async ({ esClient }) => {
      await cleanupAd2ScenarioProfile(esClient);
    });

    evaluate('dense profile live retrieval', async ({ evaluateDataset }) => {
      await evaluateDataset({ dataset: denseProfileLiveRetrievalDataset });
    });
  }
);
