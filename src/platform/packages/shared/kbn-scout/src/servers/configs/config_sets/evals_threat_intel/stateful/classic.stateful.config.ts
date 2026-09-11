/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { servers as evalsTracingConfig } from '../../evals_tracing/stateful/classic.stateful.config';
import type { ScoutServerConfig } from '../../../../../types';

/**
 * Custom Scout stateful server configuration for Threat Intel enrichment evals.
 *
 * Extends the tracing config (EIS connectors + eval tracing) and:
 *   - Enables the `threatIntelSupplyEnabled` experimental feature flag so the
 *     `/internal/threat_intel/*` enrichment routes are registered.
 *   - Disables `searchInferenceEndpoints` so `resolveScopedModel` takes its
 *     `genAiSettings:defaultAIConnector` fallback path. The suite points that
 *     setting at the per-project connector, which is how each model in the
 *     EIS/LiteLLM matrix actually gets exercised. With the registry present the
 *     route would deliberately refuse the global-default fallback and return a
 *     no_connector error.
 *
 * Usage:
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet evals_threat_intel
 */
export const servers: ScoutServerConfig = {
  ...evalsTracingConfig,
  kbnTestServer: {
    ...evalsTracingConfig.kbnTestServer,
    serverArgs: [
      ...evalsTracingConfig.kbnTestServer.serverArgs,
      `--xpack.securitySolution.enableExperimental=${JSON.stringify(['threatIntelSupplyEnabled'])}`,
      '--xpack.searchInferenceEndpoints.enabled=false',
    ],
  },
};
