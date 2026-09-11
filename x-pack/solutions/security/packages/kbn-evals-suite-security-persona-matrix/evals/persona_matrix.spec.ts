/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import type { Client as EsClient } from '@elastic/elasticsearch';
import { evaluate } from '../src/evaluate';
import { personaMatrixDataset } from '../src/datasets';
import { seedChrysalisAlerts, cleanupChrysalisAlerts } from '../src/fixtures/chrysalis_seed';
import { seedPersonaMatrixEnvironment, cleanupEnvSeeds } from '../src/fixtures/env_seeds';
import {
  seedPersonaMatrixTools,
  attachPersonaMatrixToolsToAgent,
  cleanupPersonaMatrixTools,
} from '../src/fixtures/persona_matrix_tools_seed';
import { assertPersonaMatrixToolsRegistered } from '../src/fixtures/tool_registration_check';

const DATASET_NAME = 'security: security-persona-matrix';
const DATASET_DESCRIPTION =
  'Breadth-first persona matrix: 21 prompts across 7 security skill categories.';

evaluate.describe('Security Persona Matrix', { tag: tags.stateful.classic }, () => {
  evaluate.beforeAll(async ({ esClient, kbnClient, log }) => {
    await seedChrysalisAlerts({ esClient: esClient as unknown as EsClient, log, count: 3 });
    log.info('[persona-matrix] seeded Chrysalis alerts');
    await seedPersonaMatrixEnvironment({
      esClient: esClient as unknown as EsClient,
      kbnClient,
      log,
    });
    log.info('[persona-matrix] seeded environment-truth data (endpoint, labs, ti-mock, entity)');
    await seedPersonaMatrixTools({ kbnClient, log });
    // Registry creation alone leaves the tools invisible to the model — the
    // default agent ships `tools: []` and only sees `defaultAgentToolIds`.
    await attachPersonaMatrixToolsToAgent({ kbnClient, log });
    log.info('[persona-matrix] seeded virustotal_lookup + on_call_lookup tools');
  });

  evaluate.afterAll(async ({ esClient, kbnClient, log }) => {
    await cleanupChrysalisAlerts({ esClient: esClient as unknown as EsClient, log });
    await cleanupEnvSeeds({
      esClient: esClient as unknown as EsClient,
      kbnClient,
      log,
    });
    await cleanupPersonaMatrixTools({ kbnClient, log });
  });

  evaluate('all 21 examples', async ({ evaluateDataset, kbnClient, log }) => {
    log.info(`Running persona matrix evaluation with ${personaMatrixDataset.length} examples`);

    // Pre-flight: fail fast if an expected custom tool isn't registered, rather
    // than silently scoring a tool that doesn't exist.
    await assertPersonaMatrixToolsRegistered({ kbnClient, log });

    await evaluateDataset({
      dataset: {
        name: DATASET_NAME,
        description: DATASET_DESCRIPTION,
        examples: personaMatrixDataset,
      },
    });

    log.info('Persona matrix evaluation complete');
  });
});
