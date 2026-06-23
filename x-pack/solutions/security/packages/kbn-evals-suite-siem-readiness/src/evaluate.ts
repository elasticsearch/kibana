/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { evaluate as base } from '@kbn/evals';
import { createEsClientForTesting, systemIndicesSuperuser } from '@kbn/test';
import { SiemReadinessEvalChatClient } from './chat_client';
import type { EvaluateSiemReadinessDataset } from './evaluate_dataset';
import { createEvaluateSiemReadinessDataset } from './evaluate_dataset';

export const evaluate = base.extend<
  {},
  {
    chatClient: SiemReadinessEvalChatClient;
    evaluateDataset: EvaluateSiemReadinessDataset;
    internalEsClient: Client;
  }
>({
  chatClient: [
    async ({ fetch, log, connector }, use) => {
      const chatClient = new SiemReadinessEvalChatClient(fetch, log, connector.id);
      await use(chatClient);
    },
    { scope: 'worker' },
  ],
  evaluateDataset: [
    ({ chatClient, evaluators, executorClient }, use) => {
      use(
        createEvaluateSiemReadinessDataset({
          chatClient,
          evaluators,
          executorClient,
        })
      );
    },
    { scope: 'worker' },
  ],
  internalEsClient: [
    async ({ config }, use) => {
      const { username, password } = systemIndicesSuperuser;
      const esUrl = new URL(config.hosts.elasticsearch);
      esUrl.username = username;
      esUrl.password = password;
      const client = createEsClientForTesting({
        esUrl: esUrl.toString(),
        isCloud: config.isCloud,
      });
      const alive = await client.ping().catch(() => false);
      if (!alive) {
        throw new Error(
          `internalEsClient: unable to reach Elasticsearch as "${username}". ` +
            'Ensure the system_indices_superuser user exists (created during test cluster startup).'
        );
      }
      await use(client);
      await client.close();
    },
    { scope: 'worker' },
  ],
});
