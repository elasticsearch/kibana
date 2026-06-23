/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTestConfig } from '../../../../../config/serverless/config.base';

export default createTestConfig({
  kbnTestServerArgs: [
    `--xpack.securitySolutionServerless.productTypes=${JSON.stringify([
      { product_line: 'security', product_tier: 'complete' },
      { product_line: 'endpoint', product_tier: 'complete' },
      { product_line: 'cloud', product_tier: 'complete' },
    ])}`,
    // Merge with enableExperimental from config/serverless/config.base (last flag wins there too).
    `--xpack.securitySolution.enableExperimental=${JSON.stringify([
      'endpointExceptionsMovedUnderManagement',
      'entityAnalyticsWatchlistEnabled',
      'entityAnalyticsEntityStoreV2',
    ])}`,
    '--xpack.encryptedSavedObjects.encryptionKey="wuGNaIhoMpk5sO4UBxgr3NyW1sFcLgIf"',
  ],
  testFiles: [require.resolve('..')],
  junit: {
    reportName: 'Entity Analytics - Watchlists Integration Tests - Serverless Env - Complete Tier',
  },
});
