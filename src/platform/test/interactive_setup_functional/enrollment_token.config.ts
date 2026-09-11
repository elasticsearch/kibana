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
  const manualConfigurationConfig = await readConfigFile(
    require.resolve('./manual_configuration.config.ts')
  );

  const dataPath = getDataPath();
  await fs.mkdir(dataPath, { recursive: true });
  const tempKibanaYamlFile = join(dataPath, `interactive_setup_kibana_${Date.now()}.yml`);
  await fs.writeFile(tempKibanaYamlFile, '');

  const caPath = resolve(
    __dirname,
    '../interactive_setup_api_integration/fixtures/elasticsearch.p12'
  );

  return {
    ...manualConfigurationConfig.getAll(),

    testFiles: [require.resolve('./tests/enrollment_token')],

    junit: {
      reportName: 'Interactive Setup Functional Tests (Enrollment token)',
    },

    esTestCluster: {
      ...manualConfigurationConfig.get('esTestCluster'),
      serverArgs: [
        ...manualConfigurationConfig.get('esTestCluster.serverArgs'),
        'xpack.security.enrollment.enabled=true',
        `xpack.security.http.ssl.keystore.path=${caPath}`,
        'xpack.security.http.ssl.keystore.secure_password=storepass',
      ],
    },

    kbnTestServer: {
      ...manualConfigurationConfig.get('kbnTestServer'),
      serverArgs: [
        ...manualConfigurationConfig
          .get('kbnTestServer.serverArgs')
          .filter((arg: string) => !arg.startsWith('--config')),
        `--config=${tempKibanaYamlFile}`,
      ],
    },
  };
}
