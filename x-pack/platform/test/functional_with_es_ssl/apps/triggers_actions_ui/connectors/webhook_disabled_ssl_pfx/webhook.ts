/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const retry = getService('retry');
  const pageObjects = getPageObjects(['common', 'triggersActionsUI', 'header']);

  describe('webhook', () => {
    beforeEach(async () => {
      await pageObjects.common.navigateToApp('triggersActionsConnectors');
    });

    it('should not render the pfx tab for ssl auth', async () => {
      await pageObjects.triggersActionsUI.clickCreateConnectorButton();

      // The flyout slides in on open; clicking a card mid-animation drops the click and
      // leaves the form unopened, so wait for the webhook card to stop moving first.
      let previous: { x: number; y: number } | undefined;
      await retry.waitForWithTimeout('webhook card to stop moving', 30000, async () => {
        const { x, y } = await (await testSubjects.find('.webhook-card')).getPosition();
        const settled = x === previous?.x && y === previous?.y;
        previous = { x, y };
        return settled;
      });

      await testSubjects.click('.webhook-card');
      await testSubjects.click('authSSL');

      const certTypeTabs = await find.allByCssSelector(
        '[data-test-subj="webhookCertTypeTabs"] > .euiTab'
      );
      expect(certTypeTabs.length).to.be(1);
      expect(await certTypeTabs[0].getAttribute('data-test-subj')).to.be('webhookCertTypeCRTab');
    });
  });
};
