/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_additional_cell_actions.ts

import kbnRison from '@kbn/rison';
import expect from '@kbn/expect';
import type { Alert } from 'selenium-webdriver';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects([
    'common',
    'discover',
    'header',
    'unifiedFieldList',
    'context',
    'svlCommonPage',
  ]);
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const browser = getService('browser');
  const retry = getService('retry');

  const checkAlert = async (text: string) => {
    let alert: Alert | undefined;
    try {
      await retry.waitFor('alert to be present', async () => {
        alert = (await browser.getAlert()) ?? undefined;
        return Boolean(alert);
      });
      expect(await alert?.getText()).to.be(text);
    } finally {
      await alert?.dismiss();
    }
  };

  describe('extension getAdditionalCellActions', () => {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
    });

    describe('ES|QL mode', () => {
      it('should render additional cell actions for logs data source', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs | sort @timestamp desc' },
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        await dataGrid.clickCellExpandPopoverAction('example-data-source-action');
        await checkAlert('Example data source action executed');
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        await dataGrid.clickCellExpandPopoverAction('another-example-data-source-action');
        await checkAlert('Another example data source action executed');
      });

      it('should render additional cell actions for computed columns', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: {
            esql: 'from my-example-logs | sort @timestamp desc | eval foo = "bar"',
          },
          columns: ['foo'],
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: 'foo' });
        await dataGrid.clickCellExpandPopoverAction('example-data-source-action');
        await checkAlert('Example data source action executed');
      });

      it('should not render incompatible cell action for message column', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs | sort @timestamp desc' },
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: 'message' });
        expect(await dataGrid.cellExpandPopoverActionExists('example-data-source-action')).to.be(
          true
        );
        expect(
          await dataGrid.cellExpandPopoverActionExists('another-example-data-source-action')
        ).to.be(false);
      });

      it('should not render cell actions for incompatible data source', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-metrics | sort @timestamp desc' },
        });
        await PageObjects.common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        expect(await dataGrid.cellExpandPopoverActionExists('example-data-source-action')).to.be(
          false
        );
        expect(
          await dataGrid.cellExpandPopoverActionExists('another-example-data-source-action')
        ).to.be(false);
      });
    });

    describe('data view mode', () => {
      it('should render additional cell actions for logs data source', async () => {
        await PageObjects.common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await dataViews.switchTo('my-example-logs');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        await dataGrid.clickCellExpandPopoverAction('example-data-source-action');
        await checkAlert('Example data source action executed');
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        await dataGrid.clickCellExpandPopoverAction('another-example-data-source-action');
        await checkAlert('Another example data source action executed');
        // check Surrounding docs page
        await dataGrid.clickRowToggle();
        const [, surroundingActionEl] = await dataGrid.getRowActions();
        await surroundingActionEl.click();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await browser.refresh();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.context.waitUntilContextLoadingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        await dataGrid.clickCellExpandPopoverAction('example-data-source-action');
        await checkAlert('Example data source action executed');
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        await dataGrid.clickCellExpandPopoverAction('another-example-data-source-action');
        await checkAlert('Another example data source action executed');
      });

      it('should not render incompatible cell action for message column', async () => {
        await PageObjects.common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await dataViews.switchTo('my-example-logs');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: 'message' });
        expect(await dataGrid.cellExpandPopoverActionExists('example-data-source-action')).to.be(
          true
        );
        expect(
          await dataGrid.cellExpandPopoverActionExists('another-example-data-source-action')
        ).to.be(false);
      });

      it('should not render cell actions for incompatible data source', async () => {
        await PageObjects.common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await dataViews.switchTo('my-example-metrics');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await dataGrid.clickCellExpandButton(0, { columnName: '@timestamp' });
        expect(await dataGrid.cellExpandPopoverActionExists('example-data-source-action')).to.be(
          false
        );
        expect(
          await dataGrid.cellExpandPopoverActionExists('another-example-data-source-action')
        ).to.be(false);
      });
    });
  });
}
