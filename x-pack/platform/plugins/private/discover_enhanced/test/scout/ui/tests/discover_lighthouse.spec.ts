/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lighthouseTest, tags } from '@kbn/scout';
import { testData } from '../fixtures';

lighthouseTest.describe(
  'Discover App - Lighthouse Performance Audit',
  { tag: [...tags.deploymentAgnostic, ...tags.performance] },
  () => {
    lighthouseTest.beforeAll(async ({ esArchiver, kbnClient, uiSettings }) => {
      await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.LOGSTASH);
      await kbnClient.importExport.load(testData.KBN_ARCHIVES.DASHBOARD_DRILLDOWNS);
      await uiSettings.set({
        defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
        'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_DEFAULT_START_TIME}", "to": "${testData.LOGSTASH_DEFAULT_END_TIME}"}`,
      });
    });

    lighthouseTest.afterAll(async ({ kbnClient, uiSettings }) => {
      await uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await kbnClient.savedObjects.cleanStandardList();
    });

    lighthouseTest(
      'runs audit on Discover Page',
      async ({ browserAuth, lighthouse, page, pageObjects }) => {
        await browserAuth.loginAsAdmin();
        await pageObjects.discover.goto({ queryMode: 'classic' });
        await pageObjects.discover.waitForHistogramRendered();
        const currentUrl = page.url();

        // Run the Lighthouse audit on the current page and attach the report
        await lighthouse.runAudit(currentUrl);
      }
    );
  }
);
