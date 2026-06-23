/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_app_menu.ts

import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { appMenu, common, discover, header, timePicker, svlCommonPage } = getPageObjects([
    'appMenu',
    'common',
    'timePicker',
    'discover',
    'header',
    'timePicker',
    'svlCommonPage',
  ]);
  const esArchiver = getService('esArchiver');
  const testSubjects = getService('testSubjects');

  describe('extension getAppMenu', () => {
    before(async () => {
      await svlCommonPage.loginAsAdmin();
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
    });

    after(async () => {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
    });

    it('should render the main actions', async () => {
      const state = kbnRison.encode({
        dataSource: { type: 'esql' },
        query: { esql: 'from logstash* | sort @timestamp desc' },
      });
      await common.navigateToActualUrl('discover', `?_a=${state}`, {
        ensureCurrentUrl: false,
      });
      await discover.waitUntilSearchingHasFinished();
      await timePicker.setDefaultAbsoluteRange();
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await appMenu.existOrFail('discoverNewButton');
      await testSubjects.click('app-menu-overflow-button');
      await testSubjects.existOrFail('discoverAlertsButton');
    });

    it('should render custom actions', async () => {
      const state = kbnRison.encode({
        dataSource: { type: 'esql' },
        query: { esql: 'from my-example-logs | sort @timestamp desc' },
      });
      await common.navigateToActualUrl('discover', `?_a=${state}`, {
        ensureCurrentUrl: false,
      });
      await discover.waitUntilSearchingHasFinished();
      await timePicker.setDefaultAbsoluteRange();
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await appMenu.existOrFail('discoverNewButton');
      await testSubjects.click('app-menu-overflow-button');
      await testSubjects.existOrFail('discoverAlertsButton');
      await testSubjects.existOrFail('example-custom-action');

      await testSubjects.click('discoverAlertsButton');
      await testSubjects.existOrFail('example-custom-action-under-alerts');
    });
  });
}
