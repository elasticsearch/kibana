/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { servers as evalsTracingConfig } from '../../evals_tracing/stateful/classic.stateful.config';

/**
 * Custom Scout stateful server configuration for Security Automatic Migrations evals.
 * Enables the siemMigrationsEvalsInvokeEnabled experimental flag in Security Solution.
 *
 * The suite runs rules + dashboard specs sequentially against one Kibana process. The rules
 * eval leaves Kibana near memory exhaustion, so the dashboard eval can push it over the heap
 * limit (SocketError: other side closed). Bump Kibana's old-space heap beyond the repo-wide
 * 4 GB default; the n2-standard-8 CI agent has 32 GB RAM so 8 GB is safe. Appended after any
 * inherited NODE_OPTIONS so Node applies this --max-old-space-size last.
 *
 * Usage:
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet evals_security_automatic_migrations
 */
export const servers: ScoutServerConfig = {
  ...evalsTracingConfig,
  kbnTestServer: {
    ...evalsTracingConfig.kbnTestServer,
    env: {
      ...evalsTracingConfig.kbnTestServer.env,
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        evalsTracingConfig.kbnTestServer.env?.NODE_OPTIONS,
        '--max-old-space-size=8192',
      ]
        .filter(Boolean)
        .join(' '),
    },
    serverArgs: [
      ...evalsTracingConfig.kbnTestServer.serverArgs,
      `--xpack.securitySolution.enableExperimental=${JSON.stringify([
        'siemMigrationsEvalsInvokeEnabled',
      ])}`,
    ],
  },
};
