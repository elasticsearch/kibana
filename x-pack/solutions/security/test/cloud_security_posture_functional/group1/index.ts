/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../ftr_provider_context';

// eslint-disable-next-line import/no-default-export
export default function ({ getPageObjects, loadTestFile }: FtrProviderContext) {
  const pageObjects = getPageObjects(['cspSecurity']);
  describe('Cloud Security Posture - Group 1 (Rules)', function () {
    before(async () => {
      await pageObjects.cspSecurity.createRoles();
      await pageObjects.cspSecurity.createUsers();
    });

    loadTestFile(require.resolve('./pages/rules/rules_counters'));
    loadTestFile(require.resolve('./pages/rules/rules_table'));
    loadTestFile(require.resolve('./pages/rules/rules_table_headers'));
    loadTestFile(require.resolve('./pages/findings_onboarding_smoke'));
  });
}
