/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { evaluate as base } from '@kbn/evals';
import { createEsClientForTesting, systemIndicesSuperuser } from '@kbn/test';
import type { EvaluateForensicDataset } from './evaluate_forensic_dataset';
import { createEvaluateForensicDataset } from './evaluate_forensic_dataset';
import type { EvaluatePolicyManagementDataset } from './evaluate_policy_management_dataset';
import { createEvaluatePolicyManagementDataset } from './evaluate_policy_management_dataset';
import type { EvaluateSecurityDataset } from './evaluate_dataset';
import { createEvaluateSecurityDataset } from './evaluate_dataset';

export const evaluate = base.extend<
  {},
  {
    evaluateDataset: EvaluateSecurityDataset;
    evaluateForensicDataset: EvaluateForensicDataset;
    evaluatePolicyManagementDataset: EvaluatePolicyManagementDataset;
    internalEsClient: Client;
  }
>({
  evaluateDataset: [
    ({ agentBuilderClient, evaluators, executorClient }, use) => {
      use(
        createEvaluateSecurityDataset({
          agentBuilderClient,
          evaluators,
          executorClient,
        })
      );
    },
    { scope: 'worker' },
  ],
  evaluateForensicDataset: [
    ({ agentBuilderClient, evaluators, executorClient, traceEsClient, log }, use) => {
      use(
        createEvaluateForensicDataset({
          agentBuilderClient,
          evaluators,
          executorClient,
          traceEsClient,
          log,
        })
      );
    },
    { scope: 'worker' },
  ],
  evaluatePolicyManagementDataset: [
    ({ agentBuilderClient, evaluators, executorClient }, use) => {
      use(
        createEvaluatePolicyManagementDataset({
          agentBuilderClient,
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
