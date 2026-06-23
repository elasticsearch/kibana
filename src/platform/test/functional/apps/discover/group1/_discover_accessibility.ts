/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';

import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import type { FtrProviderContext } from '../ftr_provider_context';
import { openDiscoverSearchThresholdRuleFlyout } from '../open_search_threshold_rule_flyout';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const browser = getService('browser');
  const log = getService('log');
  const kibanaServer = getService('kibanaServer');
  const find = getService('find');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const { common } = getPageObjects(['common']);

  const defaultSettings = {
    defaultIndex: 'logstash-*',
  };

  const hasFocus = async (testSubject: string) => {
    const targetElement = await testSubjects.find(testSubject);
    const activeElement = await find.activeElement();
    return (await targetElement._webElement.getId()) === (await activeElement._webElement.getId());
  };

  describe('discover accessibility', () => {
    before(async () => {
      log.debug('load kibana index with default index pattern');
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await common.navigateToApp('discover');
    });

    after(async () => {
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
    });

    describe('top nav menu buttons', () => {
      const focusAndPressButton = async (buttonTestSubject: string | WebElementWrapper) => {
        const button =
          typeof buttonTestSubject === 'string'
            ? await testSubjects.find(buttonTestSubject)
            : buttonTestSubject;
        await button.focus();
        await browser.pressKeys(browser.keys.ENTER);
      };

      const expectButtonToLoseAndRegainFocusWhenOverlayIsOpenedAndClosed = async (
        menuButtonTestSubject: string,
        isInOverflowMenu: boolean = false,
        hasPopoverItems: boolean = false
      ) => {
        if (isInOverflowMenu) {
          await focusAndPressButton('app-menu-overflow-button');
        }
        if (!hasPopoverItems) {
          await focusAndPressButton(menuButtonTestSubject);
        }

        await retry.try(async () => {
          expect(await hasFocus(menuButtonTestSubject)).to.be(false);
        });
        // Small delay to allow the overlay to open fully
        await new Promise((resolve) => setTimeout(resolve, 500));
        await browser.pressKeys(browser.keys.ESCAPE);
        await retry.try(async () => {
          expect(
            await hasFocus(isInOverflowMenu ? 'app-menu-overflow-button' : menuButtonTestSubject)
          ).to.be(true);
        });
      };

      it('should return focus to the open button when dismissing the open search flyout', () =>
        expectButtonToLoseAndRegainFocusWhenOverlayIsOpenedAndClosed('discoverOpenButton', true));

      it('should return focus to the alerts button when dismissing the alerts popover', () =>
        expectButtonToLoseAndRegainFocusWhenOverlayIsOpenedAndClosed(
          'discoverAlertsButton',
          true,
          true
        ));

      it('should return focus to the alerts button when dismissing the create rule flyout', async () => {
        await openDiscoverSearchThresholdRuleFlyout({ testSubjects, retry });
        await testSubjects.existOrFail('euiFlyoutCloseButton');
        await testSubjects.click('euiFlyoutCloseButton');
        await testSubjects.missingOrFail('euiFlyoutCloseButton');
        await testSubjects.existOrFail('app-menu-overflow-button');

        await retry.try(async () => {
          expect(await hasFocus('app-menu-overflow-button')).to.be(true);
        });
      });

      it('should return focus to the share button when dismissing the share popover', () =>
        expectButtonToLoseAndRegainFocusWhenOverlayIsOpenedAndClosed('shareTopNavButton'));

      it('should return focus to the save button when dismissing the save modal', () =>
        expectButtonToLoseAndRegainFocusWhenOverlayIsOpenedAndClosed('discoverSaveButton'));
    });
  });
}
