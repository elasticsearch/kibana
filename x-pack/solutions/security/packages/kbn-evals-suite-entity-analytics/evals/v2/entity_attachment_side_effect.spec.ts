/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { getEntitiesAlias, ENTITY_LATEST } from '@kbn/entity-store/common';
import { hashEuid } from '@kbn/entity-store/common/domain/euid';
import { evaluate } from '../../src/evaluate';

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

    evaluate.beforeAll(async ({ log, esClient: es, supertest }) => {
      log.info('[attachment-evals] beforeAll: POST /api/security/entity_store/install');
      const installRes = await supertest
        .post('/api/security/entity_store/install')
        .set('kbn-xsrf', 'true')
        .set('x-elastic-internal-origin', 'Kibana')
        .set('elastic-api-version', '2023-10-31')
        .send({ entityTypes: ['user', 'host'] });
      log.info(
        `[attachment-evals] beforeAll: install responded status=${
          installRes.status
        } body=${JSON.stringify(installRes.body)}`
      );
      if (installRes.status !== 200 && installRes.status !== 201) {
        throw new Error(
          `Entity Store V2 install failed (${installRes.status}): ${JSON.stringify(
            installRes.body
          )}`
        );
      }

      // Wait until status=running so the latest alias exists before we bulk
      // index into it. 120s ceiling aligns with `highlights_v2.ts`; normally
      // completes in ~5–15s on dev hardware.
      await waitForCondition(
        async () => {
          const res = await supertest
            .get('/api/security/entity_store/status')
            .set('elastic-api-version', '2023-10-31');
          if (res.status !== 200) return false;
          const status = (res.body as { status?: string }).status;
          if (status === 'error') {
            throw new Error(`Entity Store V2 is in error state: ${JSON.stringify(res.body)}`);
          }
          return status === 'running';
        },
        { label: 'entity store v2 status=running', timeoutMs: 120_000, log }
      );

      log.info('[attachment-evals] beforeAll: bulk indexing seeded entities into latest alias');
      const latestAlias = getEntitiesAlias(ENTITY_LATEST, 'default');
      const now = new Date().toISOString();
      await es.bulk({
        refresh: true,
        operations: [
          { index: { _index: latestAlias, _id: hashEuid(aliceEuid) } },
          {
            '@timestamp': now,
            entity: { id: aliceEuid, EngineMetadata: { Type: 'user' } },
            user: { name: 'attach-alice' },
            asset: { criticality: 'high_impact' },
          },
          { index: { _index: latestAlias, _id: hashEuid(bobEuid) } },
          {
            '@timestamp': now,
            entity: { id: bobEuid, EngineMetadata: { Type: 'user' } },
            user: { name: 'attach-bob' },
            asset: { criticality: 'medium_impact' },
          },
        ],
      });

      log.info('[attachment-evals] beforeAll: setup complete');
    });

    evaluate.afterAll(async ({ log, quickApiClient }) => {
      try {
        await quickApiClient.deleteEntityEngines({ query: { delete_data: true } });
      } catch (err) {
        log.warning(`deleteEntityEngines failed during teardown: ${(err as Error).message}`);
      }
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
                tool_sequence: ['security.get_entity'],
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
                tool_sequence: ['security.search_entities'],
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
                tool_sequence: ['security.get_entity'],
              },
              metadata: { query_intent: 'Factual' },
            },
          ],
        },
      });
    });
  }
);

/**
 * Minimal polling helper. Pulled inline rather than dragging in a dependency
 * on FTR's `retry` service (not available in the evals fixture graph).
 */
async function waitForCondition(
  check: () => Promise<boolean>,
  {
    label,
    timeoutMs,
    intervalMs = 2000,
    log,
  }: {
    label: string;
    timeoutMs: number;
    intervalMs?: number;
    log: { warning: (m: string) => void };
  }
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return;
    } catch (err) {
      log.warning(`${label} check threw: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}
