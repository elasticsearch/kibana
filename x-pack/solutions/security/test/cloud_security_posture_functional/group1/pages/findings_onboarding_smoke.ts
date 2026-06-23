/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * FTR (L4): one end-to-end smoke for the findings-onboarding empty state.
 *
 * Sibling coverage:
 * - Component rendering + integration link hrefs (CSPM/KSPM/3p):
 *   x-pack/solutions/security/plugins/cloud_security_posture/public/components/no_findings_states/no_findings_states.test.tsx
 * - Status-route state machine (L1):
 *   x-pack/solutions/security/plugins/cloud_security_posture/server/routes/status/status.test.ts
 *
 * Rationale: multiple end-to-end smokes for the same feature is an
 * anti-pattern. Keep this file at exactly one `it(...)`. The remaining
 * empty-state variants (KSPM action, 3p action, "no 3p prompt on
 * unsupported pages") are owned by the L3 file above, which asserts each
 * button's href against MSW-served status responses without booting Kibana.
 * The CSPM happy-path is the one preserved here because it exercises the
 * full real-Kibana pipe — empty-state render, click, real navigation, and
 * the integration installation page actually loading — which the L3 cannot.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

// eslint-disable-next-line import/no-default-export
export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const PageObjects = getPageObjects(['common', 'findings', 'header']);
  const retry = getService('retry');

  describe('Findings Page onboarding (smoke)', function () {
    this.tags(['cloud_security_posture_findings_onboarding']);
    let findings: typeof PageObjects.findings;
    let notInstalledCSP: typeof findings.notInstalledCSP;

    beforeEach(async () => {
      findings = PageObjects.findings;
      notInstalledCSP = findings.notInstalledCSP;

      await findings.waitForPluginInitialized();
    });

    it('navigates from the misconfigurations empty state to the CSPM integration installation page', async () => {
      await findings.navigateToMisconfigurations();
      await retry.try(async () => {
        await PageObjects.header.waitUntilLoadingHasFinished();
      });

      const element = await notInstalledCSP.getElement();
      expect(element).to.not.be(null);

      await notInstalledCSP.navigateToAction('cspm-not-installed-action');

      await PageObjects.common.waitUntilUrlIncludes('add-integration/cspm');
    });
  });
};
