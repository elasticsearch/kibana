/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';
import {
  bulkIndexEntities,
  deleteEntityEngines,
  installEntityStoreV2AndWait,
} from '../../src/setup_helpers';

/**
 * Entity Store V2 - attachment side-effect evals.
 *
 * Validates that the entity-analytics skill persists the expected
 * `security.entity` conversation attachment as a side effect of tool
 * execution.
 *
 * Seed strategy (fast path, follows `highlights_v2.ts`):
 *   - Install V2 engines only (creates latest alias + indices).
 *   - Bulk-index two user entities directly into the latest alias.
 *   - Skip the real extractor + maintainer pipeline because our assertion
 *     only needs entities to be resolvable by `security.get_entity` /
 *     `security.search_entities`, which read from the latest alias.
 *
 * Seeded entities:
 *   user:attach-alice — asset.criticality high_impact
 *   user:attach-bob   — asset.criticality medium_impact
 *
 * Total beforeAll runtime: ~5s on a dev box (vs ~5min for the full real
 * pipeline with rules/alerts/force-extraction).
 */
evaluate.describe(
  'SIEM Entity Analytics V2 Skill - Attachment Side-Effects',
  { tag: tags.serverless.security.complete },
  () => {
    const aliceEuid = 'user:attach-alice';
    const bobEuid = 'user:attach-bob';

    evaluate.beforeAll(async ({ log, esClient, supertest }) => {
      await installEntityStoreV2AndWait({ supertest, log });
      await bulkIndexEntities({
        esClient,
        entities: [
          { euid: aliceEuid, assetCriticality: 'high_impact' },
          { euid: bobEuid, assetCriticality: 'medium_impact' },
        ],
      });
    });

    evaluate.afterAll(async ({ log, quickApiClient }) => {
      await deleteEntityEngines({ quickApiClient, log });
    });

    evaluate('entity store v2: attachment side-effects', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics-v2: attachment side-effects',
          description:
            'Validates the security.entity attachment created as a side effect of get_entity / search_entities tool calls against seeded entity store V2 data.',
          examples: [
            // Single-entity card path.
            {
              input: {
                question: "Tell me about user attach-alice's current risk profile",
              },
              output: {
                criteria: [
                  'Summarise the entity profile for user attach-alice.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "attach-alice" (prefixed or non-prefixed form).',
                    ],
                  },
                ],
                attachments: [
                  {
                    type: 'security.entity',
                    shape: 'single',
                    entityType: 'user',
                    entityId: 'attach-alice',
                    count: { min: 1 },
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },

            // Multi-entity table path.
            {
              input: {
                question: 'Which users have the highest risk scores right now?',
              },
              output: {
                criteria: [
                  'Return a list of users from the entity store including attach-alice and attach-bob, or clearly state that data is unavailable.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with parameters that sort or filter by risk score.',
                    ],
                  },
                ],
                attachments: [
                  {
                    type: 'security.entity',
                    shape: 'table',
                    minEntities: 2,
                    count: { min: 1 },
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },

            // Negative case: no attachment persisted when entity cannot be resolved.
            {
              input: {
                question: "Tell me about the entity zzz_missing_999xyz's current risk profile",
              },
              output: {
                criteria: [
                  'Clearly state that the entity zzz_missing_999xyz was not found.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "zzz_missing_999xyz" or equivalent.',
                    ],
                  },
                ],
                attachments: [
                  {
                    type: 'security.entity',
                    count: { exact: 0 },
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },
          ],
        },
      });
    });
  }
);
