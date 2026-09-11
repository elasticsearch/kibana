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
 * Custom Scout stateful server configuration for the Rule Migration v2 agent evals.
 * Extends `evals_tracing` and additionally enables the `ruleMigrationGraphv2`
 * experimental feature flag, which switches the SIEM rule migration task runner
 * from `getRuleMigrationAgent` (v1) to `getRuleMigrationAgentV2` (v2).
 *
 * Usage:
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet evals_rule_migration_v2
 *   node scripts/evals scout --serverConfigSet evals_rule_migration_v2
 *   node scripts/evals start --suite security-automatic-migrations --profile local --skip-server
 */
export const servers: ScoutServerConfig = {
  ...evalsTracingConfig,
  kbnTestServer: {
    ...evalsTracingConfig.kbnTestServer,
    serverArgs: [
      ...evalsTracingConfig.kbnTestServer.serverArgs,
      `--xpack.securitySolution.enableExperimental=["ruleMigrationGraphv2"]`,
    ],
  },
};
