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
 * Registers the `access_control_type` (`supportsAccessControl: true`) and
 * `non_access_control_type` saved-object types and exposes HTTP routes that call
 * SavedObjectsClient access-control operations (`create` with an `accessControl` option,
 * `changeOwnership`, `changeAccessMode`, ...) that have no public/core HTTP API.
 *
 * Used by the Spaces `test/scout_spaces_access_control` API suite.
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
      // `savedObjects.enableAccessControl` already defaults to `true`; set explicitly so this
      // config set stays correct even if the product default changes.
      '--savedObjects.enableAccessControl=true',
    ],
  },
};
