/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_doc_viewer.ts

import kbnRison from '@kbn/rison';
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, unifiedTabs, svlCommonPage } = getPageObjects([
    'common',
    'discover',
    'unifiedTabs',
    'svlCommonPage',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const esql = getService('esql');

  describe('extension getDocViewer', function () {
    before(async () => {
      await svlCommonPage.loginAsAdmin();
    });

    describe('ES|QL mode', () => {
      it('should not render custom doc viewer view', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-* | sort @timestamp desc' },
        });
        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await discover.waitUntilTabIsLoaded();
        await dataGrid.clickRowToggle({ rowIndex: 0 });
        await testSubjects.existOrFail('docViewerTab-doc_view_table');
        await testSubjects.existOrFail('docViewerTab-doc_view_source');
        await testSubjects.missingOrFail('docViewerTab-doc_view_example');
        expect(await testSubjects.getVisibleText('docViewerRowDetailsTitle')).to.be('Result');
      });

      it('should render custom doc viewer view', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs | sort @timestamp desc' },
        });
        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await discover.waitUntilTabIsLoaded();
        await dataGrid.clickRowToggle({ rowIndex: 0 });
        await testSubjects.existOrFail('docViewerTab-doc_view_table');
        await testSubjects.existOrFail('docViewerTab-doc_view_source');
        await testSubjects.existOrFail('docViewerTab-doc_view_example');
        expect(await testSubjects.getVisibleText('docViewerRowDetailsTitle')).to.contain(
          'Record #1'
        );
      });

      it('should update the ES|QL query when clicking custom "Update ES|QL query" button', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs | sort @timestamp desc' },
        });
        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await discover.waitUntilTabIsLoaded();
        await dataGrid.clickRowToggle({ rowIndex: 0, defaultTabId: 'doc_view_example' });
        await testSubjects.click('exampleDataSourceProfileDocViewUpdateEsqlQuery');
        await discover.waitUntilTabIsLoaded();
        expect(await unifiedTabs.getTabLabels()).to.eql(['Untitled']);
        expect(await unifiedTabs.getSelectedTabLabel()).to.be('Untitled');
        expect(await esql.getEsqlEditorQuery()).to.be('FROM my-example-logs | LIMIT 5');
      });

      it('should open a new tab when clicking custom "Open new tab" button', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs | sort @timestamp desc' },
        });
        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await discover.waitUntilTabIsLoaded();
        await dataGrid.clickRowToggle({ rowIndex: 0, defaultTabId: 'doc_view_example' });
        await testSubjects.click('exampleDataSourceProfileDocViewOpenNewTab');
        await discover.waitUntilTabIsLoaded();
        expect(await unifiedTabs.getTabLabels()).to.eql(['Untitled', 'My new tab']);
        expect(await unifiedTabs.getSelectedTabLabel()).to.be('My new tab');
        expect(await esql.getEsqlEditorQuery()).to.be('FROM my-example-logs | LIMIT 5');
      });
    });

    describe('data view mode', () => {
      it('should not render custom doc viewer view', async () => {
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await dataViews.switchTo('my-example-*');
        await discover.waitUntilTabIsLoaded();
        await dataGrid.clickRowToggle({ rowIndex: 0 });
        await testSubjects.existOrFail('docViewerTab-doc_view_table');
        await testSubjects.existOrFail('docViewerTab-doc_view_source');
        await testSubjects.missingOrFail('docViewerTab-doc_view_example');
        expect(await testSubjects.getVisibleText('docViewerRowDetailsTitle')).to.be('Document');
      });

      it('should render custom doc viewer view', async () => {
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await dataViews.switchTo('my-example-logs');
        await discover.waitUntilTabIsLoaded();
        await dataGrid.clickRowToggle({ rowIndex: 0 });
        await testSubjects.existOrFail('docViewerTab-doc_view_table');
        await testSubjects.existOrFail('docViewerTab-doc_view_source');
        await testSubjects.existOrFail('docViewerTab-doc_view_example');
        expect(await testSubjects.getVisibleText('docViewerRowDetailsTitle')).to.be(
          'Record #my-example-logs::XdQFDpABfGznVC1bCHLo::'
        );
      });
    });
  });
}
