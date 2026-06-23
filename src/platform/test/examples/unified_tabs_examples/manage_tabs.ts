/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { Key } from 'selenium-webdriver';
import { TABS_BAR_HEIGHT } from '@kbn/unified-tabs';
import type { FtrProviderContext } from '../../functional/ftr_provider_context';

const MIN_TAB_WIDTH = 114;

// eslint-disable-next-line import/no-default-export
export default ({ getService, getPageObjects }: FtrProviderContext) => {
  const { common, header, unifiedTabs } = getPageObjects(['common', 'header', 'unifiedTabs']);
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const browser = getService('browser');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');

  const openTabContextMenuWithKeyboard = async () => {
    await browser
      .getActions()
      .keyDown(Key.SHIFT)
      .sendKeys(browser.keys.F10)
      .keyUp(Key.SHIFT)
      .perform();

    await retry.waitFor('open tab context menu', async () => {
      return await testSubjects.exists('unifiedTabs_tabMenuItem_enterRenamingMode');
    });
  };

  describe('Managing Unified Tabs', () => {
    before(async () => {
      await browser.setWindowSize(1200, 800);
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover.json'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.uiSettings.replace({ defaultIndex: 'logstash-*' });
    });

    beforeEach(async () => {
      await common.navigateToApp('unifiedTabsExamples');
      await header.waitUntilLoadingHasFinished();
    });

    after(async () => {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
      await kibanaServer.savedObjects.cleanStandardList();
    });

    it('should show tabs in a responsive way', async () => {
      // Check that the constant telling the height of the tabs bar is thrustworthy
      expect(Math.round(await unifiedTabs.getTabsBarHeight())).to.be(TABS_BAR_HEIGHT);

      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      expect(await unifiedTabs.isScrollable()).to.be(false);
      expect((await unifiedTabs.getTabWidths()).every((width) => width === MIN_TAB_WIDTH)).to.be(
        true
      );

      await unifiedTabs.editTabLabel(0, 'Very long tab label');
      expect((await unifiedTabs.getTabWidths()).at(0)).to.be.greaterThan(150);
      expect(
        (await unifiedTabs.getTabWidths()).slice(1).every((width) => width === MIN_TAB_WIDTH)
      ).to.be(true);

      await unifiedTabs.createNewTab();
      await unifiedTabs.createNewTab();
      expect((await unifiedTabs.getTabWidths()).at(0)).to.be.greaterThan(MIN_TAB_WIDTH);
      expect((await unifiedTabs.getTabWidths()).at(0)).to.be.lessThan(158);
      expect(
        (await unifiedTabs.getTabWidths()).slice(1).every((width) => width === MIN_TAB_WIDTH)
      ).to.be(true);

      await unifiedTabs.createNewTab();
      await unifiedTabs.createNewTab();
      await unifiedTabs.createNewTab();
      expect(await unifiedTabs.getNumberOfTabs()).to.be(12);
      await unifiedTabs.waitForScrollButtons();
      expect((await unifiedTabs.getTabWidths()).every((width) => width === MIN_TAB_WIDTH)).to.be(
        true
      );
    });

    it('can edit tab label', async () => {
      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 1');
      await unifiedTabs.editTabLabel(3, 'Test label');
      expect(await unifiedTabs.getTabLabels()).to.eql([
        'Untitled 1',
        'Untitled 2',
        'Untitled 3',
        'Test label',
        'Untitled 5',
        'Untitled 6',
        'Untitled 7',
      ]);
    });

    it('can edit tab label with keyboard events', async () => {
      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      await unifiedTabs.createNewTab();
      await openTabContextMenuWithKeyboard();
      await browser.pressKeys(browser.keys.ARROW_DOWN);
      await browser.pressKeys(browser.keys.ENTER);
      await unifiedTabs.enterNewTabLabel('Test label');
      expect(await unifiedTabs.getTabLabels()).to.eql([
        'Untitled 1',
        'Untitled 2',
        'Untitled 3',
        'Untitled 4',
        'Untitled 5',
        'Untitled 6',
        'Untitled 7',
        'Test label',
      ]);
    });

    it('should support mouse events for navigating between tabs', async () => {
      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 1');
      await unifiedTabs.createNewTab();
      expect(await unifiedTabs.getNumberOfTabs()).to.be(8);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 8');
      await unifiedTabs.selectTab(5);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 6');
      await unifiedTabs.selectTab(6);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 7');
      await unifiedTabs.closeTab(6);
      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 8');
      await unifiedTabs.openTabMenu(6);
      expect(await unifiedTabs.getContextMenuItems()).to.eql([
        'Rename',
        'Duplicate',
        'Close other tabs',
      ]);
    });

    it('should support keyboard events for navigating between tabs', async () => {
      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 1');
      await unifiedTabs.createNewTab();
      expect(await unifiedTabs.getNumberOfTabs()).to.be(8);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 8');
      await browser.pressKeys(browser.keys.ARROW_LEFT);
      await browser.pressKeys(browser.keys.ARROW_LEFT);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 6');
      await browser.pressKeys(browser.keys.ARROW_RIGHT);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 7');
      await browser.pressKeys(browser.keys.DELETE);
      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 8');
      await openTabContextMenuWithKeyboard();
      expect(await unifiedTabs.getContextMenuItems()).to.eql([
        'Rename',
        'Duplicate',
        'Close other tabs',
      ]);
    });

    it('should support drag and drop for reordering tabs', async () => {
      expect(await unifiedTabs.getNumberOfTabs()).to.be(7);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 1');
      await unifiedTabs.createNewTab();
      expect(await unifiedTabs.getNumberOfTabs()).to.be(8);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 8');
      expect(await unifiedTabs.getTabLabels()).to.eql([
        'Untitled 1',
        'Untitled 2',
        'Untitled 3',
        'Untitled 4',
        'Untitled 5',
        'Untitled 6',
        'Untitled 7',
        'Untitled 8',
      ]);
      await browser.pressKeys(browser.keys.ARROW_LEFT);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 7');
      await browser.pressKeys(browser.keys.SPACE);
      await browser.pressKeys(browser.keys.ARROW_LEFT);
      await browser.pressKeys(browser.keys.ARROW_LEFT);
      await browser.pressKeys(browser.keys.SPACE);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 7');
      expect(await unifiedTabs.getTabLabels()).to.eql([
        'Untitled 1',
        'Untitled 2',
        'Untitled 3',
        'Untitled 4',
        'Untitled 7',
        'Untitled 5',
        'Untitled 6',
        'Untitled 8',
      ]);
      await browser.pressKeys(browser.keys.ARROW_RIGHT);
      expect((await unifiedTabs.getSelectedTab())?.label).to.be('Untitled 5');
      await browser.pressKeys(browser.keys.SPACE);
      await browser.pressKeys(browser.keys.ARROW_RIGHT);
      await browser.pressKeys(browser.keys.SPACE);
      expect(await unifiedTabs.getTabLabels()).to.eql([
        'Untitled 1',
        'Untitled 2',
        'Untitled 3',
        'Untitled 4',
        'Untitled 7',
        'Untitled 6',
        'Untitled 5',
        'Untitled 8',
      ]);
    });
  });
};
