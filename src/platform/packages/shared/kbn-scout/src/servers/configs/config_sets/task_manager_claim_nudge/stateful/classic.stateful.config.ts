/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { servers as defaultConfig } from '../../default/stateful/classic.stateful.config';
import type { ScoutServerConfig } from '../../../../../types';

// Task Manager polls every 500ms by default, which is too fast to tell a claim nudge apart from the
// next regular poll cycle. Stretching the interval to a minute means a task claimed within seconds
// of `runSoon` can only have been claimed because of the nudge, and leaves plenty of room for the
// test's budget to absorb CI jitter without a regular poll cycle wandering into it.
export const servers: ScoutServerConfig = {
  ...defaultConfig,
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: [
      ...defaultConfig.kbnTestServer.serverArgs,
      '--xpack.task_manager.poll_interval=60000',
      // Pinned rather than relying on the default so the tests keep exercising the nudge even if
      // the default is ever flipped off.
      '--xpack.task_manager.claim_nudge.enabled=true',
      // Kibana's own background tasks pile up behind the stretched poll interval, and a claim cycle
      // stops once capacity is used up. The pattern is a minimatch glob, so a leading `!` excludes
      // every task type except the one the tests schedule, keeping the nudged claim cycle from
      // being crowded out by that backlog and intermittently missing the tests' budget.
      '--xpack.task_manager.unsafe.exclude_task_types=["!task_manager:invalidate_api_keys"]',
    ],
  },
};
