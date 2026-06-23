/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_default_app_state.ts

import expect from '@kbn/expect';
import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects([
    'appMenu',
    'common',
    'discover',
    'svlCommonPage',
    'unifiedFieldList',
    'header',
  ]);
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const queryBar = getService('queryBar');
  const monacoEditor = getService('monacoEditor');
  const kibanaServer = getService('kibanaServer');
  const retry = getService('retry');

  describe('extension getDefaultAppState', () => {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
    });

    afterEach(async () => {
      await kibanaServer.uiSettings.unset('defaultColumns');
    });

    async function expectColumns(columns: string[]) {
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await retry.try(async () => {
        const actualColumns = await PageObjects.discover.getColumnHeaders();
        expect(actualColumns).to.eql(columns);
      });
    }

    function expectBreakdown(breakdown: string) {
      return retry.try(async () => {
        const breakdownFieldValue = await PageObjects.discover.getBreakdownFieldValue();
        expect(breakdownFieldValue).to.be(breakdown);
      });
    }

    describe('ES|QL mode', () => {
      it('should render default state', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: {
            esql: 'from my-example-logs',
          },
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await expectColumns(['@timestamp', 'log.level', 'message']);
        await dataGrid.clickGridSettings();
        const rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        const rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(5);
        await expectBreakdown('Breakdown by log.level');
      });

      it('should render default state when switching index patterns', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: {
            esql: 'from my-example-*',
          },
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await expectColumns(['@timestamp', 'Summary']);
        await dataGrid.clickGridSettings();
        let rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        let rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(3);
        await monacoEditor.setCodeEditorValue('from my-example-logs');
        await queryBar.clickQuerySubmitButton();
        await expectColumns(['@timestamp', 'log.level', 'message']);
        await dataGrid.clickGridSettings();
        rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(5);
        await expectBreakdown('Breakdown by log.level');
      });

      it('should reset default state when clicking "New"', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: {
            esql: 'from my-example-logs',
          },
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.unifiedFieldList.clickFieldListItemRemove('log.level');
        await PageObjects.unifiedFieldList.clickFieldListItemRemove('message');
        await expectColumns(['@timestamp', 'Summary']);
        await dataGrid.clickGridSettings();
        await dataGrid.changeRowHeightValue('Auto');
        let rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Auto');
        await PageObjects.appMenu.clickMenuItem('discoverNewButton');
        await expectColumns(['@timestamp', 'log.level', 'message']);
        await dataGrid.clickGridSettings();
        rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        const rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(5);
        await expectBreakdown('Breakdown by log.level');
      });

      it('should merge and dedup configured default columns with default profile columns', async () => {
        await kibanaServer.uiSettings.update({
          defaultColumns: ['bad_column', 'data_stream.type', 'message'],
        });
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: {
            esql: 'from my-example-logs',
          },
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await expectColumns(['@timestamp', 'log.level', 'message', 'data_stream.type']);
      });
    });

    describe('data view mode', () => {
      it('should render default state', async () => {
        await PageObjects.common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataViews.switchToAndValidate('my-example-logs');
        await expectColumns(['@timestamp', 'log.level', 'message']);
        await dataGrid.clickGridSettings();
        const rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        const rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(5);
        await expectBreakdown('Breakdown by log.level');
      });

      it('should render default state when switching data views', async () => {
        await PageObjects.common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataViews.switchToAndValidate('my-example-*');
        await expectColumns(['@timestamp', 'Summary']);
        await dataGrid.clickGridSettings();
        let rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        let rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(3);
        await dataViews.switchToAndValidate('my-example-logs');
        await expectColumns(['@timestamp', 'log.level', 'message']);
        await dataGrid.clickGridSettings();
        rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(5);
        await expectBreakdown('Breakdown by log.level');
      });

      it('should reset default state when clicking "New"', async () => {
        await PageObjects.common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataViews.switchToAndValidate('my-example-logs');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.unifiedFieldList.clickFieldListItemRemove('log.level');
        await PageObjects.unifiedFieldList.clickFieldListItemRemove('message');
        await expectColumns(['@timestamp', 'Summary']);
        await dataGrid.clickGridSettings();
        await dataGrid.changeRowHeightValue('Auto');
        let rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Auto');
        await PageObjects.appMenu.clickMenuItem('discoverNewButton');
        await expectColumns(['@timestamp', 'log.level', 'message']);
        await dataGrid.clickGridSettings();
        rowHeightValue = await dataGrid.getCurrentRowHeightValue();
        expect(rowHeightValue).to.be('Custom');
        const rowHeightNumber = await dataGrid.getCustomRowHeightNumber();
        expect(rowHeightNumber).to.be(5);
        await expectBreakdown('Breakdown by log.level');
      });

      it('should merge and dedup configured default columns with default profile columns', async () => {
        await kibanaServer.uiSettings.update({
          defaultColumns: ['bad_column', 'data_stream.type', 'message'],
        });
        await PageObjects.common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataViews.switchToAndValidate('my-example-logs');
        await expectColumns(['@timestamp', 'log.level', 'message', 'data_stream.type']);
      });
    });
  });
}
