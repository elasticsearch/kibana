/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { globalSetupHook, tags } from '@kbn/scout-security';

// UI tests in this config use page.route() to mock anomaly API responses,
// so no shared Elasticsearch data needs to be loaded globally.
globalSetupHook('Setup', { tag: tags.deploymentAgnostic }, async ({ log }) => {
  log.info('[setup] Entity anomaly UI tests: no shared data ingestion required');
});
