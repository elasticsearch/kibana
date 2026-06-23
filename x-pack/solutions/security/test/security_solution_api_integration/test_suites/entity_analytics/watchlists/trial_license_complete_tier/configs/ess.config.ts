/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrConfigProviderContext } from '@kbn/test';

export default async function ({ readConfigFile }: FtrConfigProviderContext) {
  const functionalConfig = await readConfigFile(
    require.resolve('../../../../../config/ess/config.base.trial')
  );

  const baseServerArgs: string[] = functionalConfig.get('kbnTestServer.serverArgs');
  // Do not append a second --xpack.securitySolution.enableExperimental=…; the last flag wins and
  // would drop previewTelemetryUrlEnabled / endpointExceptionsMovedUnderManagement from config.base.
  const serverArgsWithoutExperimental = baseServerArgs.filter(
    (arg) => !arg.startsWith('--xpack.securitySolution.enableExperimental=')
  );

  return {
    ...functionalConfig.getAll(),
    kbnTestServer: {
      ...functionalConfig.get('kbnTestServer'),
      serverArgs: [
        ...serverArgsWithoutExperimental,
        `--xpack.securitySolution.enableExperimental=${JSON.stringify([
          'previewTelemetryUrlEnabled',
          'endpointExceptionsMovedUnderManagement',
          'entityAnalyticsWatchlistEnabled',
          'entityAnalyticsEntityStoreV2',
        ])}`,
        '--xpack.encryptedSavedObjects.encryptionKey="wuGNaIhoMpk5sO4UBxgr3NyW1sFcLgIf"',
      ],
    },
    testFiles: [require.resolve('..')],
    junit: {
      reportName: 'Entity Analytics - Watchlists Integration Tests - ESS Env - Trial License',
    },
  };
}
