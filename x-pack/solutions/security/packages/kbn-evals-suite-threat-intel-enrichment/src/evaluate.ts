/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate as base } from '@kbn/evals';
import { ThreatIntelClient } from './clients/threat_intel_client';

// The threat_intel routes resolve their model server-side. In this eval config
// `searchInferenceEndpoints` is disabled, so `resolveScopedModel` falls back to
// this advanced setting. Pointing it at the per-project connector is what makes
// the EIS/LiteLLM matrix actually exercise each model under test.
const GEN_AI_DEFAULT_CONNECTOR_SETTING = 'genAiSettings:defaultAIConnector';

/**
 * Extends the base `@kbn/evals` fixture with a worker-scoped `ThreatIntelClient`
 * that posts directly to the threat_intel enrichment routes, plus an auto
 * fixture that points the default GenAI connector at the model under test.
 * Everything else (executorClient, inferenceClient, connector, evaluators, log)
 * comes from the base fixture unchanged.
 */
export const evaluate = base.extend<
  {},
  {
    threatIntelClient: ThreatIntelClient;
    defaultConnectorForThreatIntel: void;
  }
>({
  defaultConnectorForThreatIntel: [
    async ({ kbnClient, connector, log }, use) => {
      log.info(
        `[threat-intel-evals] Setting ${GEN_AI_DEFAULT_CONNECTOR_SETTING}=${connector.id} so enrichment routes resolve the model under test`
      );
      await kbnClient.uiSettings.update({
        [GEN_AI_DEFAULT_CONNECTOR_SETTING]: connector.id,
      });
      await use();
    },
    { scope: 'worker', auto: true },
  ],

  threatIntelClient: [
    async ({ kbnClient, log, defaultConnectorForThreatIntel }, use) => {
      await use(new ThreatIntelClient(kbnClient, log));
    },
    { scope: 'worker' },
  ],
});
