/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_row_additional_leading_controls.ts

import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects(['common', 'discover', 'svlCommonPage', 'header']);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const browser = getService('browser');

  describe('extension getRowAdditionalLeadingControls', () => {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
    });
    describe('ES|QL mode', () => {
      it('should render logs controls for logs data source', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs | sort @timestamp desc' },
        });
        await PageObjects.common.navigateToApp('discover', {
          hash: `/?_a=${state}`,
        });
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await testSubjects.existOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.existOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });

      it('should not render logs controls for non-logs data source', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-metrics | sort @timestamp desc' },
        });
        await PageObjects.common.navigateToApp('discover', {
          hash: `/?_a=${state}`,
        });
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await testSubjects.missingOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.missingOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });
    });

    describe('data view mode', () => {
      it('should render logs controls for logs data source', async () => {
        await PageObjects.common.navigateToApp('discover');
        await dataViews.switchTo('my-example-logs');
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await testSubjects.existOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.existOrFail('unifiedDataTable_additionalRowControl_actionsMenu');

        // check Surrounding docs page
        await dataGrid.clickRowToggle();
        const [, surroundingActionEl] = await dataGrid.getRowActions();
        await surroundingActionEl.click();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await browser.refresh();
        await PageObjects.header.waitUntilLoadingHasFinished();

        await testSubjects.existOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.existOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });

      it('should not render logs controls for non-logs data source', async () => {
        await PageObjects.common.navigateToApp('discover');
        await dataViews.switchTo('my-example-metrics');
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await testSubjects.missingOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.missingOrFail('unifiedDataTable_additionalRowControl_actionsMenu');

        // check Surrounding docs page
        await dataGrid.clickRowToggle();
        const [, surroundingActionEl] = await dataGrid.getRowActions();
        await surroundingActionEl.click();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await browser.refresh();
        await PageObjects.header.waitUntilLoadingHasFinished();

        await testSubjects.missingOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.missingOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });
    });
  });
}
