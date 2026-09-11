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

import { ScoutTestRunConfigCategory } from '@kbn/scout-info';
import type { FtrConfigProviderContext } from '@kbn/test';
import { getDataPath } from '@kbn/utils';

import { services } from './services';

export default async function ({ readConfigFile }: FtrConfigProviderContext) {
  const xPackAPITestsConfig = await readConfigFile(require.resolve('../api_integration/config'));

  const testEndpointsPlugin = resolve(__dirname, './plugins/test_endpoints');

  const dataPath = getDataPath();
  await fs.mkdir(dataPath, { recursive: true });
  const tempKibanaYamlFile = join(dataPath, `interactive_setup_kibana_${Date.now()}.yml`);
  await fs.writeFile(tempKibanaYamlFile, '');

  return {
    testConfigCategory: ScoutTestRunConfigCategory.API_TEST,
    testFiles: [require.resolve('./tests/manual_configuration_flow_without_tls')],
    servers: xPackAPITestsConfig.get('servers'),
    services,
    junit: {
      reportName: 'Interactive Setup API Integration Tests (Manual configuration flow without TLS)',
    },

    esTestCluster: {
      ...xPackAPITestsConfig.get('esTestCluster'),
      serverArgs: [
        ...xPackAPITestsConfig.get('esTestCluster.serverArgs'),
        'xpack.security.enabled=true',
      ],
    },

    kbnTestServer: {
      ...xPackAPITestsConfig.get('kbnTestServer'),
      serverArgs: [
        ...xPackAPITestsConfig
          .get('kbnTestServer.serverArgs')
          .filter((arg: string) => !arg.startsWith('--elasticsearch.')),
        `--plugin-path=${testEndpointsPlugin}`,
        `--config=${tempKibanaYamlFile}`,
      ],
      runOptions: {
        ...xPackAPITestsConfig.get('kbnTestServer.runOptions'),
        wait: /Kibana has not been configured/,
      },
    },
  };
}
