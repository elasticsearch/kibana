/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/evals';
import { evaluate } from '../../src/evaluate';
import { extractDiamondDataset } from '../../src/datasets/extract_diamond_dataset';
import {
  createDiamondNoIocLeakEvaluator,
  createSignalCountEvaluator,
  withMajorityVote,
} from '../../src/evaluators/extract_diamond_evaluators';

/**
 * LLM-judge criteria for Diamond prose quality and the vertex-separation
 * constraints the prompt enforces. Complements the deterministic CODE checks
 * (signal count, literal-IOC leak).
 *
 * Each criterion is atomic and, where it concerns literal indicators or named
 * organisations, explicitly scopes the judgment to the *summary text only* and
 * states that the source article is expected to contain those. The judge
 * otherwise conflates the article containing an IOC with the summary containing
 * it and fails a summary that is actually generic (its own reason then
 * contradicts its verdict). Judged over several samples by majority vote.
 */
const DIAMOND_CRITERIA = [
  'Judging only the text of the infrastructure vertex summary, not the source article: the summary does not contain a literal IP address, domain name, URL, or email address. The source article is expected to contain such indicators; a generic behavioural description (for example "a Russian-geolocated IP address" or "two distinct source hosts") satisfies this criterion.',
  'Every vertex whose signal is HIGH or PARTIAL has a non-empty summary, and any vertex the article does not support is marked NONE with an empty summary.',
  'Each statement in every non-empty vertex summary is grounded in facts stated in the source article.',
  'The adversary vertex summary describes attacker or operator behaviour and does not describe the victim system or organisation characteristics.',
  'Judging only the text of the victim vertex summary, not the source article: it characterises the compromised systems or organisation generically and does not contain a specific named victim organisation. The source article is expected to name the victim; generic role or environment descriptions satisfy this criterion.',
];

evaluate.describe(
  'Threat Intel Enrichment: extract_diamond',
  { tag: tags.stateful.classic },
  () => {
    evaluate(
      'extracts Diamond vertices within constraints',
      async ({ executorClient, threatIntelClient, evaluators }) => {
        await executorClient.runExperiment(
          {
            datasets: [
              {
                name: 'threat_intel: extract_diamond',
                description:
                  'Diamond-suitable BlackHat demo packs. CODE-scored on signal count and literal-IOC leak; LLM-judged on vertex separation and prose grounding.',
                examples: extractDiamondDataset,
              },
            ],
            task: async ({ input }) => {
              if (!input) throw new Error('Missing extract_diamond input');
              return threatIntelClient.extractDiamond(input);
            },
          },
          [
            createSignalCountEvaluator(),
            createDiamondNoIocLeakEvaluator(),
            withMajorityVote(evaluators.criteria(DIAMOND_CRITERIA), 3),
          ]
        );
      }
    );
  }
);
