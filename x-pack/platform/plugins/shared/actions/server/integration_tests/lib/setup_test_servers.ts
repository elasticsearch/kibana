/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createTestServers,
  createRootWithCorePlugins,
  getSupertest,
} from '@kbn/core-test-helpers-kbn-server';

// Until the licensing plugin's first fetch resolves, the security auth gate rejects
// every authenticated request with a 503, so wait for the license before returning.
async function waitForLicense(root: ReturnType<typeof createRootWithCorePlugins>) {
  const deadline = Date.now() + 60_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    ({ status: lastStatus } = await getSupertest(root, 'get', '/api/licensing/info'));
    if (lastStatus === 200) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for license to become available (last status ${lastStatus})`);
}

export async function setupTestServers(settings = {}) {
  const { startES } = createTestServers({
    adjustTimeout: (t) => jest.setTimeout(t),
    settings: {
      es: {
        license: 'trial',
      },
    },
  });

  const esServer = await startES();

  const root = createRootWithCorePlugins(settings, { oss: false });

  await root.preboot();
  const coreSetup = await root.setup();
  const coreStart = await root.start();

  await waitForLicense(root);

  return {
    esServer,
    kibanaServer: {
      root,
      coreSetup,
      coreStart,
      stop: async () => await root.shutdown(),
    },
  };
}
