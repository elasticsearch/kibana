/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { globalSetupHook, SECURITY_ARCHIVES } from '@kbn/scout-security';

globalSetupHook('Ingest archives to Elasticsearch', async ({ esArchiver, log }) => {
  log.debug('[setup] loading archives test data (only if indexes do not exist)...');
  await esArchiver.loadIfNeeded(SECURITY_ARCHIVES.AUDITBEAT);
});
