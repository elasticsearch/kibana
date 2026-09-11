/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrConfigProviderContext } from '@kbn/test';
import { ELASTICSEARCH_MAX_RESPONSE_SIZE_ARG } from '../max_response_size';

export default async function ({ readConfigFile }: FtrConfigProviderContext) {
  const functionalConfig = await readConfigFile(
    require.resolve('../../../../../../../config/ess/config.base.trial')
  );
  const defaultConfig = functionalConfig.getAll();

  return {
    ...defaultConfig,
    testFiles: [require.resolve('..')],
    junit: {
      reportName:
        'Detection Engine - New Terms Rule Execution Logic Integration Tests - ESS Env - Trial License - Max response size',
    },
    kbnTestServer: {
      ...defaultConfig.kbnTestServer,
      serverArgs: [...defaultConfig.kbnTestServer.serverArgs, ELASTICSEARCH_MAX_RESPONSE_SIZE_ARG],
    },
  };
}
