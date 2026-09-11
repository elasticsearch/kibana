/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/evals';
import { evaluate } from '../../src/evaluate';
import { assessRelevanceDataset } from '../../src/datasets/assess_relevance_dataset';
import {
  createIsIntelligenceEvaluator,
  createRelevanceShapeEvaluator,
} from '../../src/evaluators/assess_relevance_evaluators';

evaluate.describe(
  'Threat Intel Enrichment: assess_relevance',
  { tag: tags.stateful.classic },
  () => {
    evaluate('classifies intelligence vs noise', async ({ executorClient, threatIntelClient }) => {
      await executorClient.runExperiment(
        {
          datasets: [
            {
              name: 'threat_intel: assess_relevance',
              description:
                'BlackHat demo packs (intelligence) plus authored marketing/opinion distractors (not intelligence).',
              examples: assessRelevanceDataset,
            },
          ],
          task: async ({ input }) => {
            if (!input) throw new Error('Missing assess_relevance input');
            return threatIntelClient.assessRelevance(input);
          },
        },
        [createIsIntelligenceEvaluator(), createRelevanceShapeEvaluator()]
      );
    });
  }
);
