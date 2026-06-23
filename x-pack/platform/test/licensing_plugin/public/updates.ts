/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { ILicense } from '@kbn/licensing-types';
import type { FtrProviderContext } from '../services';
import { createScenario } from '../scenario';
import '@kbn/core-provider-plugin/types';

// eslint-disable-next-line import/no-default-export
export default function (ftrContext: FtrProviderContext) {
  const { getService } = ftrContext;
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const scenario = createScenario(ftrContext);

  const fetchLatestLicense = async (): Promise<ILicense> => {
    // make sure license ids are aligned between ES and Kibana
    await scenario.waitForPluginToDetectLicenseUpdate();

    return await browser.executeAsync(async function refreshAndFetchLicense(cb) {
      const {
        start: { core, plugins },
        testUtils,
      } = window._coreProvider;
      const licensing: LicensingPluginStart = plugins.licensing;

      // this call enforces signature check to detect license update and causes license re-fetch
      await core.http.get('/');

      // trigger a manual refresh, just to be sure
      await licensing.refresh();

      // wait a bit to make sure any older values have passed through the replay(1)
      await testUtils.delay(1000);

      cb(await licensing.getLicense());
    });
  };

  // Failing: See https://github.com/elastic/kibana/issues/271887
  describe.skip('changes in license types', function () {
    this.tags('skipFIPS');

    before(async function setup() {
      await scenario.setup();
    });

    after(async function teardown() {
      await scenario.teardown();
    });

    it('are reflected in the start contract', async function updateAndCheckLicense() {
      // fetch default license
      let license = await fetchLatestLicense();
      expect(license.type).to.be('basic');

      // ensure consecutive fetch still yields 'basic'
      license = await fetchLatestLicense();
      expect(license.type).to.be('basic');

      // switch to trial (can do it only once)
      await scenario.startTrial();
      license = await fetchLatestLicense();
      expect(license.type).to.be('trial');

      // ensure consecutive fetch still yields 'trial'
      license = await fetchLatestLicense();
      expect(license.type).to.be('trial');

      // switch back to basic
      await scenario.startBasic();
      license = await fetchLatestLicense();
      expect(license.type).to.be('basic');

      // banner shown only when license expired not just deleted
      await testSubjects.missingOrFail('licenseExpiredBanner');
    });
  });
}
