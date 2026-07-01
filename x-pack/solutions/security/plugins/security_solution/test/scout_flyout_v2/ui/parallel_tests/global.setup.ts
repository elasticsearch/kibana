/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { globalSetupHook } from '@kbn/scout-security';
import { archives } from '@kbn/scout-security/src/playwright/constants';

globalSetupHook('Ingest archives to Elasticsearch', async ({ esArchiver, log }) => {
  const archivesToIngest = [archives.ES.AUDITBEAT];

  log.debug('[setup] loading archives test data (only if indexes do not exist)...');
  for (const archive of archivesToIngest) {
    await esArchiver.loadIfNeeded(archive);
  }
});
