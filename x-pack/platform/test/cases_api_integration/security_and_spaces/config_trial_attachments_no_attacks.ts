/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTestConfig } from '../common/config';

// Attachments framework ON, but `attackAttachmentsEnabled` OFF. `security.attack` is a
// unified-only attachment type registered by security_solution only when that experimental
// flag is on, so this config is what proves the flag actually gates server-side writes.
// The flag-ON counterpart runs under `config_trial_attachments.ts`.
export default createTestConfig('security_and_spaces', {
  license: 'trial',
  ssl: true,
  testFiles: [require.resolve('./tests/common/attachments_framework_no_attacks')],
  publicBaseUrl: true,
  kbnServerArgs: ['--xpack.cases.attachments.enabled=true'],
  experimentalFeatures: ['entityAttachmentsEnabled'],
});
