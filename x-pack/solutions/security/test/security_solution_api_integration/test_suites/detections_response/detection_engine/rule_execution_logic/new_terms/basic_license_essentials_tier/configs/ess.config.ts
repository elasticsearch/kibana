/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrConfigProviderContext } from '@kbn/test';

const ENABLE_EXPERIMENTAL_PREFIX = '--xpack.securitySolution.enableExperimental=';

export default async function ({ readConfigFile }: FtrConfigProviderContext) {
  const functionalConfig = await readConfigFile(
    require.resolve('../../../../../../../config/ess/config.base.basic')
  );

  const baseServerArgs: string[] = functionalConfig.get('kbnTestServer.serverArgs');

  // Preserve the experimental flags set by the base config and additionally disable the ES|QL
  // approach, so the New Terms rule runs the aggregation execution path. Appending a second
  // enableExperimental arg would not work (last flag wins), so we merge into a single arg.
  const baseEnableExperimentalArg = baseServerArgs.find((arg) =>
    arg.startsWith(ENABLE_EXPERIMENTAL_PREFIX)
  );
  const baseExperimentalFlags: string[] = baseEnableExperimentalArg
    ? JSON.parse(baseEnableExperimentalArg.slice(ENABLE_EXPERIMENTAL_PREFIX.length))
    : [];

  const serverArgs = [
    ...baseServerArgs.filter((arg) => !arg.startsWith(ENABLE_EXPERIMENTAL_PREFIX)),
    `${ENABLE_EXPERIMENTAL_PREFIX}${JSON.stringify([
      ...baseExperimentalFlags,
      'disable:newTermsEsqlApproachEnabled',
    ])}`,
  ];

  return {
    ...functionalConfig.getAll(),
    kbnTestServer: {
      ...functionalConfig.get('kbnTestServer'),
      serverArgs,
    },
    testFiles: [require.resolve('..')],
    junit: {
      reportName:
        'Detection Engine - New Terms Rule Execution Logic Integration Tests - ESS Env - Basic License (Aggregation Path)',
    },
  };
}
