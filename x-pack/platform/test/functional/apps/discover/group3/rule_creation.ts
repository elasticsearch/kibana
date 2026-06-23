/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';
import { openDiscoverSearchThresholdRuleFlyout } from '../open_search_threshold_rule_flyout';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  describe('Discover rule creation', function () {
    const { common } = getPageObjects(['common', 'settings', 'shareSavedObjectsToSpace']);
    const testSubjects = getService('testSubjects');
    const retry = getService('retry');
    const esArchiver = getService('esArchiver');
    const kibanaServer = getService('kibanaServer');

    before('initialize tests', async () => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/logstash_functional'
      );
      await kibanaServer.uiSettings.replace({ defaultIndex: 'logstash-*' });
    });

    after('clean up archives', async () => {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
    });

    it('navigate to Discover', () => {
      return common.navigateToApp('discover');
    });

    it('begin creating rule', async () => {
      await openDiscoverSearchThresholdRuleFlyout({ testSubjects, retry });
      await testSubjects.click('ruleFormStep-details');
    });

    it('should have the "Related dashboards" section', async () => {
      const linkedDashboardsElement = await testSubjects.find('ruleLinkedDashboards');
      expect(linkedDashboardsElement).to.be.ok();
      expect(await linkedDashboardsElement.isDisplayed()).to.be(true);
    });
  });
}
