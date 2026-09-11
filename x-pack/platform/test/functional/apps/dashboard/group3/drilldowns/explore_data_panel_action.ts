/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

const ACTION_ID = 'ACTION_EXPLORE_DATA';
const ACTION_TEST_SUBJ = `embeddablePanelAction-${ACTION_ID}`;

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const drilldowns = getService('dashboardDrilldownsManage');
  const { dashboard, discover, timePicker } = getPageObjects([
    'dashboard',
    'discover',
    'common',
    'timePicker',
  ]);
  const panelActions = getService('dashboardPanelActions');
  const dashboardCustomizePanel = getService('dashboardCustomizePanel');
  const testSubjects = getService('testSubjects');
  const kibanaServer = getService('kibanaServer');

  /**
   * Purpose: Explore data drilldown smoke test
   *
   * Migration: Migrate to scout - move to lens scout tests since drilldown is regsitered by in lens plugin
   */
  describe('Explore underlying data - panel action', function () {
    before(
      'change default index pattern to verify action navigates to correct index pattern',
      async () => {
        await kibanaServer.uiSettings.replace({ defaultIndex: 'logstash*' });
        await dashboard.navigateToApp();
        await dashboard.preserveCrossAppState();
      }
    );

    after('set back default index pattern and clean-up custom time range on panel', async () => {
      await kibanaServer.uiSettings.replace({ defaultIndex: 'logstash-*' });
      await dashboard.navigateToApp();
      await dashboard.loadDashboardInEditMode(drilldowns.DASHBOARD_WITH_PIE_CHART_NAME);

      await panelActions.customizePanel();
      await dashboardCustomizePanel.disableCustomTimeRange();
      await dashboardCustomizePanel.clickSaveButton();
      await dashboard.saveDashboard('Dashboard with Pie Chart', {
        saveAsNew: false,
        exitFromEditMode: true,
      });
    });

    it('action exists in panel context menu', async () => {
      await dashboard.loadSavedDashboard(drilldowns.DASHBOARD_WITH_PIE_CHART_NAME);
      await panelActions.expectExistsPanelAction(ACTION_TEST_SUBJ);
    });

    it('is a link <a> element', async () => {
      await panelActions.openContextMenuByTitle('Visualization PieChart');
      const actionElement = await testSubjects.find(ACTION_TEST_SUBJ);
      const tag = await actionElement.getTagName();

      expect(tag.toLowerCase()).to.be('a');
    });

    it('navigates to Discover app to index pattern of the panel on action click', async () => {
      await testSubjects.clickWhenNotDisabledWithoutRetry(ACTION_TEST_SUBJ);
      await discover.waitForDiscoverAppOnScreen();

      const el = await testSubjects.find('discover-dataView-switch-link');
      const text = await (await el.findByTestSubject('fullText')).getVisibleText();

      expect(text).to.be('logstash-*');
    });

    it('carries over panel time range', async () => {
      await dashboard.navigateToApp();

      await dashboard.loadDashboardInEditMode(drilldowns.DASHBOARD_WITH_PIE_CHART_NAME);

      await panelActions.customizePanel();
      await dashboardCustomizePanel.enableCustomTimeRange();
      await dashboardCustomizePanel.openDatePickerQuickMenu();
      await dashboardCustomizePanel.clickCommonlyUsedTimeRange('Last_90 days');
      await dashboardCustomizePanel.clickSaveButton();

      await dashboard.saveDashboard('Dashboard with Pie Chart', {
        saveAsNew: false,
        exitFromEditMode: true,
      });

      await panelActions.clickPanelAction(ACTION_TEST_SUBJ);
      await discover.waitForDiscoverAppOnScreen();

      const text = await timePicker.getShowDatesButtonText();
      const lowercaseText = text.toLowerCase();

      expect(lowercaseText.includes('last 90 days')).to.be(true);
    });
  });
}
