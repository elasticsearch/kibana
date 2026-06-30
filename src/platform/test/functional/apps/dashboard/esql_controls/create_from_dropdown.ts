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
  const retry = getService('retry');
  const kibanaServer = getService('kibanaServer');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const { dashboard, timePicker } = getPageObjects(['dashboard', 'timePicker']);
  const testSubjects = getService('testSubjects');
  const esql = getService('esql');

  describe('dashboard - add an ES|QL control from the controls dropdown', function () {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
      });
    });

    after(async () => {
      await dashboard.navigateToApp();
    });

    it('should add an ES|QL control', async () => {
      await dashboard.navigateToApp();
      await dashboard.clickNewDashboard();
      await timePicker.setDefaultDataRange();
      await dashboard.switchToEditMode();
      const panelCountBefore = await dashboard.getPanelCount();

      await dashboardAddPanel.clickAddVariableControlPanel();
      // Flyout is open
      await esql.waitESQLEditorLoaded('ESQLEditor');
      await esql.setEsqlEditorQuery('FROM logstash-* | STATS BY geo.dest');

      // run the query
      await testSubjects.click('ESQLEditor-run-query-button');
      await testSubjects.existOrFail('esqlValuesPreviewStrings');
      await testSubjects.click('saveEsqlControlsFlyoutButton');

      await dashboard.waitForRenderComplete();
      await retry.try(async () => {
        // Creating a control from the dropdown adds it directly to the pinned control group, not as a panel
        // Expect control group to be visible, and no additional panels to be created
        expect(await dashboard.getPanelCount()).to.be(panelCountBefore);
        const controlGroupVisible = await testSubjects.exists('controls-group-wrapper');
        expect(controlGroupVisible).to.be(true);
      });
    });
  });
}
