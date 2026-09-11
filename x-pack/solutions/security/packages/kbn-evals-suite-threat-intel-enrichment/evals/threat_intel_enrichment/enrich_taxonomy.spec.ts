/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/evals';
import { evaluate } from '../../src/evaluate';
import { enrichTaxonomyDataset } from '../../src/datasets/enrich_taxonomy_dataset';
import {
  createCategoryRecallEvaluator,
  createRegionRecallEvaluator,
} from '../../src/evaluators/enrich_taxonomy_evaluators';

evaluate.describe(
  'Threat Intel Enrichment: enrich_taxonomy',
  { tag: tags.stateful.classic },
  () => {
    evaluate('extracts categories and regions', async ({ executorClient, threatIntelClient }) => {
      await executorClient.runExperiment(
        {
          datasets: [
            {
              name: 'threat_intel: enrich_taxonomy',
              description:
                'BlackHat demo packs with labelled closed-set categories/regions plus one authored multi-category example. Scored by recall.',
              examples: enrichTaxonomyDataset,
            },
          ],
          task: async ({ input }) => {
            if (!input) throw new Error('Missing enrich_taxonomy input');
            return threatIntelClient.enrichTaxonomy(input);
          },
        },
        [createCategoryRecallEvaluator(), createRegionRecallEvaluator()]
      );
    });
  }
);
