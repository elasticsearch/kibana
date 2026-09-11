/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTestConfig } from '../../../../common/config';

export default createTestConfig('spaces_only', {
  disabledPlugins: ['security'],
  license: 'trial',
  enableActionsProxy: false,
  verificationMode: 'none',
  useDedicatedTaskRunner: false,
  ruleChangeTrackingScope: ['stack'],
  testFiles: [require.resolve('./change_tracking/enabled.ts')],
  reportName: 'X-Pack Alerting API Integration Tests - Change Tracking Enabled',
});
