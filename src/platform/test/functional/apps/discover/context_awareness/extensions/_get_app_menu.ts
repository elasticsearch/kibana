/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/context_awareness/extensions/_get_app_menu.ts

import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { appMenu, common, discover, header } = getPageObjects([
    'appMenu',
    'common',
    'timePicker',
    'discover',
    'header',
  ]);
  const testSubjects = getService('testSubjects');

  describe('extension getAppMenu', () => {
    it('should render the main actions and the action from root profile', async () => {
      const state = kbnRison.encode({
        dataSource: { type: 'esql' },
        query: { esql: 'from logstash* | sort @timestamp desc' },
      });
      await common.navigateToActualUrl('discover', `?_a=${state}`, {
        ensureCurrentUrl: false,
      });
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await appMenu.existOrFail('discoverNewButton');
      await appMenu.existOrFail('discoverAlertsButton');
      await appMenu.existOrFail('example-custom-root-submenu');
    });

    it('should render custom actions', async () => {
      const state = kbnRison.encode({
        dataSource: { type: 'esql' },
        query: { esql: 'from my-example-logs | sort @timestamp desc' },
      });
      await common.navigateToActualUrl('discover', `?_a=${state}`, {
        ensureCurrentUrl: false,
      });
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await appMenu.existOrFail('discoverNewButton');
      await appMenu.existOrFail('discoverAlertsButton');
      await appMenu.existOrFail('example-custom-root-submenu');
      await appMenu.existOrFail('example-custom-action');

      await appMenu.clickMenuItem('example-custom-root-submenu');
      await testSubjects.existOrFail('example-custom-root-action12');

      await testSubjects.click('example-custom-root-action12');
      await testSubjects.existOrFail('example-custom-root-action12-flyout');
      await testSubjects.click('euiFlyoutCloseButton');

      await appMenu.clickMenuItem('discoverAlertsButton');
      await testSubjects.existOrFail('example-custom-action-under-alerts');
    });
  });
}
