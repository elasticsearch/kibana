/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs/promises';
import { join, resolve } from 'path';

import type { FtrConfigProviderContext } from '@kbn/test';
import { getDataPath } from '@kbn/utils';

export default async function ({ readConfigFile }: FtrConfigProviderContext) {
  const functionalConfig = await readConfigFile(require.resolve('../functional/config.base.js'));

  const testEndpointsPlugin = resolve(
    __dirname,
    '../interactive_setup_api_integration/plugins/test_endpoints'
  );

  const dataPath = getDataPath();
  await fs.mkdir(dataPath, { recursive: true });
  const tempKibanaYamlFile = join(dataPath, `interactive_setup_kibana_${Date.now()}.yml`);
  await fs.writeFile(tempKibanaYamlFile, '');

  return {
    ...functionalConfig.getAll(),

    testFiles: [require.resolve('./tests/manual_configuration_without_security')],

    junit: {
      reportName: 'Interactive Setup Functional Tests (Manual configuration without Security)',
    },

    security: { disableTestUser: true },

    esTestCluster: {
      ...functionalConfig.get('esTestCluster'),
      serverArgs: [
        ...functionalConfig
          .get('esTestCluster.serverArgs')
          .filter((arg: string) => !arg.startsWith('xpack.security.')),
        'xpack.security.enabled=false',
      ],
    },

    kbnTestServer: {
      ...functionalConfig.get('kbnTestServer'),
      serverArgs: [
        ...functionalConfig
          .get('kbnTestServer.serverArgs')
          .filter((arg: string) => !arg.startsWith('--elasticsearch.')),
        `--plugin-path=${testEndpointsPlugin}`,
        `--config=${tempKibanaYamlFile}`,
      ],
      runOptions: {
        ...functionalConfig.get('kbnTestServer.runOptions'),
        wait: /Kibana has not been configured/,
      },
    },

    uiSettings: {}, // UI settings can't be set during `preboot` stage
  };
}
