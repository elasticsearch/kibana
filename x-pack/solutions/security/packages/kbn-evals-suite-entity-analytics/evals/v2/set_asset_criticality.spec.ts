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
 * Entity Store V2 — set_asset_criticality tool evals.
 *
 * Validates tool selection, argument extraction, confirmation gating, and
 * the unassign path for the `security.set_asset_criticality` action tool.
 */
evaluate.describe(
  'SIEM Entity Analytics V2 Skill - Set Asset Criticality',
  { tag: tags.serverless.security.complete },
  () => {
    const server1Euid = 'host:crit-server1';
    const aliceEuid = 'user:crit-alice';

    evaluate.beforeAll(async ({ log, esClient: es, supertest }) => {
      log.info('[set-criticality-evals] beforeAll: installing entity store v2');
      const installRes = await supertest
        .post('/api/security/entity_store/install')
        .set('kbn-xsrf', 'true')
        .set('x-elastic-internal-origin', 'Kibana')
        .set('elastic-api-version', '2023-10-31')
        .send({ entityTypes: ['user', 'host'] });

      if (installRes.status !== 200 && installRes.status !== 201) {
        throw new Error(
          `Entity Store V2 install failed (${installRes.status}): ${JSON.stringify(
            installRes.body
          )}`
        );
      }

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

      log.info('[set-criticality-evals] beforeAll: seeding entities');
      const latestAlias = getEntitiesAlias(ENTITY_LATEST, 'default');
      const now = new Date().toISOString();
      await es.bulk({
        refresh: true,
        operations: [
          { index: { _index: latestAlias, _id: hashEuid(server1Euid) } },
          {
            '@timestamp': now,
            entity: { id: server1Euid, EngineMetadata: { Type: 'host' } },
            host: { name: 'crit-server1' },
            asset: { criticality: 'low_impact' },
          },
          { index: { _index: latestAlias, _id: hashEuid(aliceEuid) } },
          {
            '@timestamp': now,
            entity: { id: aliceEuid, EngineMetadata: { Type: 'user' } },
            user: { name: 'crit-alice' },
          },
        ],
      });

      log.info('[set-criticality-evals] beforeAll: setup complete');
    });

    evaluate.afterAll(async ({ log, quickApiClient }) => {
      try {
        await quickApiClient.deleteEntityEngines({ query: { delete_data: true } });
      } catch (err) {
        log.warning(`deleteEntityEngines failed during teardown: ${(err as Error).message}`);
      }
    });

    evaluate(
      'set_asset_criticality: tool routing and HITL confirmation',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'entity-analytics-v2: set_asset_criticality',
            description:
              'Validates that the entity-analytics skill routes criticality-set requests to ' +
              'security.set_asset_criticality, extracts the correct arguments, and presents ' +
              'a HITL confirmation before executing.',
            examples: [
              {
                input: {
                  question: 'Mark host crit-server1 as high impact',
                },
                output: {
                  criteria: [
                    'Ask the user to confirm before setting the asset criticality, or indicate that a confirmation prompt was presented.',
                    'Do not report that the criticality was changed without user confirmation.',
                  ],
                  toolCalls: [
                    {
                      id: 'security.set_asset_criticality',
                      criteria: [
                        'The tool is called with entityId matching "crit-server1" (prefixed "host:crit-server1" or non-prefixed form).',
                        'The tool is called with entityType "host".',
                        'The tool is called with criticality "high_impact".',
                      ],
                    },
                  ],
                },
                metadata: { query_intent: 'Action' },
              },
              {
                input: {
                  question: 'Remove the asset criticality for user crit-alice',
                },
                output: {
                  criteria: [
                    'Ask the user to confirm before removing the asset criticality, or indicate that a confirmation prompt was presented.',
                    'Do not report the criticality as removed without user confirmation.',
                  ],
                  toolCalls: [
                    {
                      id: 'security.set_asset_criticality',
                      criteria: [
                        'The tool is called with entityId matching "crit-alice" (prefixed "user:crit-alice" or non-prefixed form).',
                        'The tool is called with entityType "user".',
                        'The tool is called with criticality "unassigned".',
                      ],
                    },
                  ],
                },
                metadata: { query_intent: 'Action' },
              },
              // Argument extraction — level from natural language.
              {
                input: {
                  question: 'Set crit-server1 to extreme impact',
                },
                output: {
                  criteria: [
                    'Ask the user to confirm before setting the criticality, or indicate that a confirmation prompt was presented.',
                  ],
                  toolCalls: [
                    {
                      id: 'security.set_asset_criticality',
                      criteria: [
                        'The tool is called with criticality "extreme_impact".',
                        'The tool is called with entityId referencing "crit-server1".',
                      ],
                    },
                  ],
                },
                metadata: { query_intent: 'Action' },
              },
            ],
          },
        });
      }
    );
  }
);

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
