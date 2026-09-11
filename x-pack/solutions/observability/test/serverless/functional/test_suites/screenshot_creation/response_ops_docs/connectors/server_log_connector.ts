/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const svlCommonScreenshots = getService('svlCommonScreenshots');
  const screenshotDirectories = ['response_ops_docs', 'observability_connectors'];
  const pageObjects = getPageObjects(['common', 'header', 'svlCommonPage']);
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');

  // The card grid reflows as action types resolve; a click on a still-moving card is silently dropped, so wait for its position to settle first (FTR lacks Playwright's actionability wait).
  const clickCardWhenSettled = async (cardSubj: string): Promise<void> => {
    let previous: { x: number; y: number; height: number; width: number } | undefined;
    await retry.waitFor(`${cardSubj} to stop moving`, async () => {
      const { x, y, height, width } = await (await testSubjects.find(cardSubj)).getPosition();
      const settled =
        previous?.x === x &&
        previous?.y === y &&
        previous?.height === height &&
        previous?.width === width;
      previous = { x, y, height, width };
      return settled;
    });
    await testSubjects.click(cardSubj);
  };

  describe('server log connector', function () {
    beforeEach(async () => {
      await pageObjects.svlCommonPage.loginWithPrivilegedRole();
    });

    it('server log connector screenshots', async () => {
      await pageObjects.common.navigateToApp('connectors');
      await pageObjects.header.waitUntilLoadingHasFinished();
      await testSubjects.click('createConnectorButton');
      await clickCardWhenSettled('.server-log-card');
      await testSubjects.setValue('nameInput', 'Server log test connector');
      await svlCommonScreenshots.takeScreenshot('serverlog-connector', screenshotDirectories);
      const saveTestButton = await testSubjects.find('create-connector-flyout-save-test-btn');
      await saveTestButton.click();
      await svlCommonScreenshots.takeScreenshot('serverlog-params-test', screenshotDirectories);
      const flyOutCancelButton = await testSubjects.find('euiFlyoutCloseButton');
      await flyOutCancelButton.click();
    });
  });
}
