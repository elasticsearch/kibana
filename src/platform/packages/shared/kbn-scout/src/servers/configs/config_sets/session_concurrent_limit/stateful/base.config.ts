/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { defaultConfig } from '../../default/stateful/base.config';
import {
  addOrReplaceArg,
  preCreateSamlProvider,
  TEST_ENDPOINTS_PLUGIN_PATH,
  withSaml1Realm,
} from '../../session_management/shared';

const kbnServerArgs = [...defaultConfig.kbnTestServer.serverArgs];

addOrReplaceArg(kbnServerArgs, 'xpack.security.session.concurrentSessions.maxSessions', '2');
addOrReplaceArg(kbnServerArgs, 'xpack.security.session.cleanupInterval', '5h');
addOrReplaceArg(
  kbnServerArgs,
  'xpack.security.authc.providers',
  JSON.stringify({
    basic: { basic1: { order: 0 } },
    saml: {
      saml1: { order: 1, realm: 'saml1' },
      ...preCreateSamlProvider(4),
    },
    anonymous: {
      anonymous1: {
        order: 3,
        credentials: { username: 'anonymous_user', password: 'changeme' },
      },
    },
  })
);
addOrReplaceArg(
  kbnServerArgs,
  'xpack.task_manager.unsafe.exclude_task_types',
  JSON.stringify(['Fleet-Metrics-Task', 'UPTIME:*'])
);
kbnServerArgs.push(`--plugin-path=${TEST_ENDPOINTS_PLUGIN_PATH}`);

export const sessionConcurrentLimitConfig: ScoutServerConfig = {
  ...defaultConfig,
  esTestCluster: withSaml1Realm(defaultConfig, { order: 2 }),
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: kbnServerArgs,
  },
};
