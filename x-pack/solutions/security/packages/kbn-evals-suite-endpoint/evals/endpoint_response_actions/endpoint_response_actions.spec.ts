/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate } from '../../src/evaluate';
import {
  waitForEndpointPackage,
  waitForTransformPropagation,
  seedScenario,
} from '../../src/data_generators/endpoint_data';
import { cleanupSeededData } from '../../src/data_generators/cleanup';

const SKILL_PATH = 'skills/security/endpoint/endpoint-response-actions/SKILL.md';

evaluate.describe('Endpoint Response Actions', { tag: tags.stateful.classic }, () => {
  evaluate.beforeAll(async ({ kbnClient, esClient, internalEsClient, chatClient, log }) => {
    await waitForEndpointPackage(kbnClient, esClient, log);

    try {
      await chatClient.converse({ message: 'hello' });
    } catch (e) {
      log.warning(`Warmup failed: ${e}`);
    }

    const clients = { esClient, internalEsClient };
    // Seed endpoint data for response-action tests
    await seedScenario(clients, {
      agentId: 'eval-agent-isolate-001',
      hostName: 'eval-host-isolate',
      os: { name: 'Windows', version: '10' },
      policyName: 'eval-policy-response',
      policyStatus: 'success',
    });
    await seedScenario(clients, {
      agentId: 'eval-agent-release-001',
      hostName: 'eval-host-release',
      os: { name: 'Linux', version: 'Ubuntu 22.04' },
      policyName: 'eval-policy-response',
      policyStatus: 'success',
    });

    await waitForTransformPropagation(esClient, log, {
      metadataCurrent: 2,
      metadataUnited: 2,
    });
  });

  evaluate.afterAll(async ({ esClient, internalEsClient }) => {
    await cleanupSeededData({ esClient, internalEsClient });
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Isolate host via natural language
  // ---------------------------------------------------------------------------
  evaluate('isolate host via natural language command', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'endpoint-response-actions: isolate host NL',
        description:
          'Validates that the agent parses an isolate command from natural language, ' +
          'resolves the host to an endpoint ID, and invokes the isolation skill with ' +
          'a confirmation step.',
        examples: [
          {
            input: {
              question: 'Isolate host eval-host-isolate',
            },
            output: {
              criteria: [
                `Activated the endpoint response actions skill by reading ${SKILL_PATH}`,
                'Resolved host name "eval-host-isolate" to an endpoint/agent ID',
                'Presented a confirmation prompt before executing the isolation',
                'Called the executeHostIsolation inline tool or equivalent',
                'Reported the isolation result (success or pending) back to the user',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Release host via natural language
  // ---------------------------------------------------------------------------
  evaluate('release host via natural language command', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'endpoint-response-actions: release host NL',
        description:
          'Validates that the agent parses a release/unisolate command from natural language, ' +
          'resolves the host, and invokes the un-isolation skill with confirmation.',
        examples: [
          {
            input: {
              question: 'Release eval-host-release from isolation',
            },
            output: {
              criteria: [
                `Activated the endpoint response actions skill by reading ${SKILL_PATH}`,
                'Resolved host name "eval-host-release" to an endpoint/agent ID',
                'Presented a confirmation prompt before executing the release',
                'Called the executeHostIsolation (release mode) or equivalent inline tool',
                'Reported the release result back to the user',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: List endpoints before isolation
  // ---------------------------------------------------------------------------
  evaluate('list endpoints before taking action', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'endpoint-response-actions: list endpoints',
        description:
          'Validates that the agent can list available endpoints when the user asks ' +
          'for context before deciding which host to isolate.',
        examples: [
          {
            input: {
              question: 'Show me all endpoints that are currently online',
            },
            output: {
              criteria: [
                `Activated the endpoint response actions skill by reading ${SKILL_PATH}`,
                'Called the getEndpointList inline tool or equivalent',
                'Returned a list of endpoints including at least eval-host-isolate and eval-host-release',
                'Did not attempt to isolate any host without explicit user confirmation',
              ],
            },
          },
        ],
      },
    });
  });
});
