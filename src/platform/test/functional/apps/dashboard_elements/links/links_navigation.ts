/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const browser = getService('browser');
  const esArchiver = getService('esArchiver');
  const security = getService('security');
  const filterBar = getService('filterBar');
  const testSubjects = getService('testSubjects');
  const kibanaServer = getService('kibanaServer');
  const dashboardAddPanel = getService('dashboardAddPanel');

  const { dashboard, common, header, timePicker } = getPageObjects([
    'dashboard',
    'common',
    'header',
    'timePicker',
  ]);

  const FROM_TIME = 'Oct 22, 2018 @ 00:00:00.000';
  const TO_TIME = 'Dec 3, 2018 @ 00:00:00.000';

  // Failing: See https://github.com/elastic/kibana/issues/274945
  describe.skip('links panel navigation', () => {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.setRoles([
        'kibana_admin',
        'kibana_sample_admin',
        'test_logstash_reader',
      ]);
      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
      });
      await common.setTime({
        from: FROM_TIME,
        to: TO_TIME,
      });
    });

    after(async () => {
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern'
      );
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
      );
      await kibanaServer.uiSettings.unset('defaultIndex');
      await common.unsetTime();
      await security.testUser.restoreDefaults();
    });

    describe('embeddable panel', () => {
      afterEach(async () => {
        await dashboard.clickDiscardChanges();
      });

      it('adds links panel to top of dashboard', async () => {
        await dashboard.loadDashboardInEditMode('links 003');
        await dashboardAddPanel.addEmbeddable('a few horizontal links', 'links');
        const topPanelTitle = (await dashboard.getPanelTitles())[0];
        expect(topPanelTitle).to.equal('a few horizontal links');
      });
    });

    describe('dashboard links', () => {
      afterEach(async () => {
        // close any new tabs that were opened
        const windowHandlers = await browser.getAllWindowHandles();
        if (windowHandlers.length > 1) {
          await browser.closeCurrentWindow();
          await browser.switchToWindow(windowHandlers[0]);
        }
      });

      it('should disable link if dashboard does not exist', async () => {
        await dashboard.loadSavedDashboard('links 001');
        await dashboard.waitForRenderComplete();
        expect(await testSubjects.exists('dashboardLink--Error fetching dashboard--error')).to.be(
          true
        );
        expect(
          await testSubjects.isEnabled('dashboardLink--Error fetching dashboard--error')
        ).to.be(false);
      });

      describe('useFilters', function () {
        // FIPS mode with trial license triggers a different dashboard save flow causing
        // clickDiscardChanges() to time out waiting for dashboardQuickSaveMenuItem-secondary-button
        this.tags('skipFIPS');

        it('useFilters should pass filter pills and query', async () => {
          /**
           * dashboard links002 has a saved filter and query bar.
           * The link to dashboard links001 only has useFilters enabled
           * so the link should pass the filters and query to dashboard links001
           * but should not override the date range.
           */
          await dashboard.loadSavedDashboard('links 002');
          await dashboard.waitForRenderComplete();
          await testSubjects.clickWhenNotDisabled('dashboardLink--links 001');
          await header.waitUntilLoadingHasFinished();
          expect(await dashboard.getDashboardIdFromCurrentUrl()).to.equal(
            '0930f310-5bc2-11ee-9a85-7b86504227bc'
          );
          await dashboard.waitForRenderComplete();
          // Should pass the filters
          expect(await filterBar.getFilterCount()).to.equal(2);
          const filterLabels = await filterBar.getFiltersLabel();
          expect(
            filterLabels.includes('This filter should only pass from links002 to links001')
          ).to.equal(true);
          expect(
            filterLabels.includes('This filter should not pass from links001 to links002')
          ).to.equal(true);

          // Should not pass the date range
          const time = await timePicker.getTimeConfig();
          expect(time.start).to.be('Oct 31, 2018 @ 00:00:00.000');
          expect(time.end).to.be('Nov 1, 2018 @ 00:00:00.000');

          await dashboard.clickDiscardChanges();
        });
      });

      it('useTimeRange should pass date range', async () => {
        /**
         * dashboard links001 has saved filters and a saved date range.
         * dashboard links002 has a different saved date range than links001.
         * The link to dashboard links002 only has useTimeRange enabled
         * so the link should override the date range on dashboard links002
         * but should not pass its filters.
         */
        await dashboard.loadSavedDashboard('links 001');
        await dashboard.waitForRenderComplete();
        await testSubjects.clickWhenNotDisabled('dashboardLink--links 002');
        await header.waitUntilLoadingHasFinished();
        expect(await dashboard.getDashboardIdFromCurrentUrl()).to.equal(
          '24751520-5bc2-11ee-9a85-7b86504227bc'
        );

        await dashboard.waitForRenderComplete();
        // Should pass the date range
        const time = await timePicker.getTimeConfig();
        expect(time.start).to.be('Oct 31, 2018 @ 00:00:00.000');
        expect(time.end).to.be('Nov 1, 2018 @ 00:00:00.000');

        // Should not pass the filters
        expect(await filterBar.getFilterCount()).to.equal(1);
        const filterLabels = await filterBar.getFiltersLabel();
        expect(
          filterLabels.includes('This filter should only pass from links002 to links001')
        ).to.equal(true);
        expect(
          filterLabels.includes('This filter should not pass from links001 to links002')
        ).to.equal(false);

        await dashboard.clickDiscardChanges();
      });

      it('openInNewTab should create an external link', async () => {
        /**
         * The link to dashboard links003 only has openInNewTab enabled.
         * Clicking the link should open a new tab.
         * Other dashboards should not pass their filters or date range
         * to dashboard links003.
         */
        await dashboard.loadSavedDashboard('links 001');
        await dashboard.waitForRenderComplete();
        await testSubjects.clickWhenNotDisabled('dashboardLink--links 003');
        await header.waitUntilLoadingHasFinished();

        // Should have opened another tab
        const windowHandlers = await browser.getAllWindowHandles();
        expect(windowHandlers.length).to.equal(2);
        await browser.switchToWindow(windowHandlers[1]);
        expect(await dashboard.getDashboardIdFromCurrentUrl()).to.equal(
          '27398c50-5bc2-11ee-9a85-7b86504227bc'
        );

        await dashboard.waitForRenderComplete();
        // Should not pass any filters
        expect((await filterBar.getFiltersLabel()).length).to.equal(0);

        // Should not pass any date range
        const time = await timePicker.getTimeConfig();
        expect(time.start).to.be('Dec 24, 2018 @ 00:00:00.000');
        expect(time.end).to.be('Dec 26, 2018 @ 00:00:00.000');
      });
    });

    describe('external links', () => {
      before(async () => {
        await dashboard.loadSavedDashboard('dashboard with external links');
      });

      afterEach(async () => {
        // close any new tabs that were opened
        const windowHandlers = await browser.getAllWindowHandles();
        if (windowHandlers.length > 1) {
          await browser.closeCurrentWindow();
          await browser.switchToWindow(windowHandlers[0]);
        }
      });

      it('should disable link if forbidden by external url policy', async () => {
        const button = await testSubjects.find('externalLink--external link violation--error');
        const isDisabled = await button.getAttribute('disabled');
        expect(isDisabled).to.be('true');
      });

      it('should create an external link when openInNewTab is enabled', async () => {
        await testSubjects.clickWhenNotDisabled('externalLink--opens in new tab');

        // Should have opened another tab
        const windowHandlers = await browser.getAllWindowHandles();
        expect(windowHandlers.length).to.equal(2);
        await browser.switchToWindow(windowHandlers[1]);
        const currentUrl = await browser.getCurrentUrl();
        expect(currentUrl).to.be('https://example.com/1');
      });

      it('should open in same tab when openInNewTab is disabled', async () => {
        await testSubjects.clickWhenNotDisabled('externalLink--opens in same tab');

        // Should have opened in the same tab
        const windowHandlers = await browser.getAllWindowHandles();
        expect(windowHandlers.length).to.equal(1);
        await browser.switchToWindow(windowHandlers[0]);
        const currentUrl = await browser.getCurrentUrl();
        expect(currentUrl).to.be('https://example.com/2');
      });
    });
  });
}
