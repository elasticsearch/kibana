/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolve } from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ScoutServerConfig } from '../../../../../types';
import { defaultConfig } from '../../default/stateful/base.config';

/**
 * Same test plugin as `spaces_access_control`, but with `savedObjects.enableAccessControl=false`
 * so the Spaces `feature_disabled` API suite can assert access control is inert (write-restricted
 * creates rejected, no `accessControl` metadata, ownership/mode APIs report the type does not
 * support access control). Enabled vs disabled is a boot-time setting, hence a separate config set.
 */
const pluginPath = `--plugin-path=${resolve(
  REPO_ROOT,
  'x-pack/platform/test/spaces_access_control/plugins/access_control_test_plugin'
)}`;

export const servers: ScoutServerConfig = {
  ...defaultConfig,
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: [
      ...defaultConfig.kbnTestServer.serverArgs,
      pluginPath,
      '--savedObjects.enableAccessControl=false',
    ],
  },
};
