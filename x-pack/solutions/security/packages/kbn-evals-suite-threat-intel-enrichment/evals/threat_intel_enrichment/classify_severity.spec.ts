/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/evals';
import { evaluate } from '../../src/evaluate';
import { classifySeverityDataset } from '../../src/datasets/classify_severity_dataset';
import {
  createSeverityAdjacentEvaluator,
  createSeverityExactEvaluator,
} from '../../src/evaluators/classify_severity_evaluators';

evaluate.describe(
  'Threat Intel Enrichment: classify_severity',
  { tag: tags.stateful.classic },
  () => {
    evaluate(
      'assigns severity across the ladder',
      async ({ executorClient, threatIntelClient }) => {
        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: 'threat_intel: classify_severity',
                description:
                  'Authored low/medium/high/critical ladder plus two fixture-derived anchors. Scored exact and within-one-level.',
                examples: classifySeverityDataset,
              },
            ],
            task: async ({ input }) => {
              if (!input) throw new Error('Missing classify_severity input');
              return threatIntelClient.classifySeverity(input);
            },
          },
          [createSeverityExactEvaluator(), createSeverityAdjacentEvaluator()]
        );
      }
    );
  }
);
