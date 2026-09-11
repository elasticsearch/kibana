/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import {
  getImportedDashboardId,
  openInlineEditorAndWaitVisible,
  spaceTest,
  testData,
} from '../../fixtures';

spaceTest.describe('Lens Convert to ES|QL button', { tag: '@local-stateful-classic' }, () => {
  let dashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(
      testData.KBN_ARCHIVE_PATHS.ESQL_CONVERSION_DASHBOARD
    );
    dashboardId = getImportedDashboardId(imported, 'ES|QL Conversion Dashboard');

    await scoutSpace.uiSettings.set({
      defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'should not display button for inline visualizations when feature flag is set to false',
    async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsPrivilegedUser();

      const { dashboard, lens } = pageObjects;

      await dashboard.openDashboardWithIdInEditMode(dashboardId);
      await dashboard.waitForPanelsToLoad(4);

      await openInlineEditorAndWaitVisible(
        pageObjects,
        testData.ESQL_CONVERSION_PANEL_IDS.INLINE_METRIC
      );

      await expect(lens.workspace.convertToEsqlButton).toBeHidden();
    }
  );
});
