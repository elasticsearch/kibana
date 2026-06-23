/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/context_awareness/extensions/_get_row_additional_leading_controls.ts

import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, header, unifiedTabs } = getPageObjects([
    'common',
    'discover',
    'header',
    'unifiedTabs',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const browser = getService('browser');

  describe('extension getRowAdditionalLeadingControls', () => {
    describe('ES|QL mode', () => {
      it('should render logs controls for logs data source', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs | sort @timestamp desc' },
        });
        await common.navigateToApp('discover', {
          hash: `/?_a=${state}`,
        });
        await discover.waitUntilSearchingHasFinished();
        await testSubjects.existOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.existOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });

      it('should not render logs controls for non-logs data source', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-metrics | sort @timestamp desc' },
        });
        await common.navigateToApp('discover', {
          hash: `/?_a=${state}`,
        });
        await discover.waitUntilSearchingHasFinished();
        await testSubjects.missingOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.missingOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });
    });

    describe('data view mode', () => {
      it('should render logs controls for logs data source', async () => {
        await common.navigateToApp('discover');
        await unifiedTabs.closeTabPreviewWithEsc();
        await dataViews.switchTo('my-example-logs');
        await discover.waitUntilSearchingHasFinished();
        await testSubjects.existOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.existOrFail('unifiedDataTable_additionalRowControl_actionsMenu');

        // check Surrounding docs page
        await dataGrid.clickRowToggle();
        const [, surroundingActionEl] = await dataGrid.getRowActions();
        await surroundingActionEl.click();
        await header.waitUntilLoadingHasFinished();
        await browser.refresh();
        await header.waitUntilLoadingHasFinished();

        await testSubjects.existOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.existOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });

      it('should not render logs controls for non-logs data source', async () => {
        await common.navigateToApp('discover');
        await unifiedTabs.closeTabPreviewWithEsc();
        await dataViews.switchTo('my-example-metrics');
        await discover.waitUntilSearchingHasFinished();
        await testSubjects.missingOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.missingOrFail('unifiedDataTable_additionalRowControl_actionsMenu');

        // check Surrounding docs page
        await dataGrid.clickRowToggle();
        const [, surroundingActionEl] = await dataGrid.getRowActions();
        await surroundingActionEl.click();
        await header.waitUntilLoadingHasFinished();
        await browser.refresh();
        await header.waitUntilLoadingHasFinished();

        await testSubjects.missingOrFail('exampleLogsControl_chartBarVerticalStack');
        await testSubjects.missingOrFail('unifiedDataTable_additionalRowControl_actionsMenu');
      });
    });
  });
}
