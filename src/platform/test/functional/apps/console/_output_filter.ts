/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const log = getService('log');
  const retry = getService('retry');
  const PageObjects = getPageObjects(['common', 'console']);

  describe('console output filter', function () {
    before(async () => {
      log.debug('navigateTo console');
      await PageObjects.common.navigateToApp('console');
      await PageObjects.console.skipTourIfExists();
    });

    beforeEach(async () => {
      await PageObjects.console.clearEditorText();
      await PageObjects.console.enterText('GET /_search?pretty');
      await PageObjects.console.clickPlayAndWaitForResults();
      // Ensure the filter row is collapsed before each test so toggle state is predictable
      if (await PageObjects.console.isOutputFilterRowVisible()) {
        await PageObjects.console.clickOutputFilterButton();
      }
    });

    it('clicking Filter response expands the filter row', async () => {
      expect(await PageObjects.console.isOutputFilterRowVisible()).to.be(false);
      await PageObjects.console.clickOutputFilterButton();
      await retry.waitFor('filter row to appear', async () => {
        return await PageObjects.console.isOutputFilterRowVisible();
      });
    });

    it('clicking Filter response again collapses the filter row', async () => {
      await PageObjects.console.clickOutputFilterButton();
      await retry.waitFor('filter row to appear', async () => {
        return await PageObjects.console.isOutputFilterRowVisible();
      });
      await PageObjects.console.clickOutputFilterButton();
      await retry.waitFor('filter row to disappear', async () => {
        return !(await PageObjects.console.isOutputFilterRowVisible());
      });
    });

    it('applying a JQ filter changes the output', async () => {
      await PageObjects.console.clickOutputFilterButton();
      await retry.waitFor('filter row to appear', async () => {
        return await PageObjects.console.isOutputFilterRowVisible();
      });

      await PageObjects.console.typeInFilterInput('._shards');
      await PageObjects.console.submitFilter();

      await retry.waitFor('output to be filtered', async () => {
        const output = await PageObjects.console.getOutputText();
        // ._shards returns the value object, so the key "_shards" won't appear —
        // check for "successful" which is unique to the _shards object
        return output.includes('"successful"') && !output.includes('hits');
      });
    });

    it('clearing the filter restores the full output', async () => {
      await PageObjects.console.clickOutputFilterButton();
      await PageObjects.console.typeInFilterInput('._shards');
      await PageObjects.console.submitFilter();

      await retry.waitFor('output to be filtered', async () => {
        const output = await PageObjects.console.getOutputText();
        return !output.includes('hits');
      });

      // Clear the input
      await PageObjects.console.typeInFilterInput('');
      await PageObjects.console.submitFilter();

      await retry.waitFor('output to be restored', async () => {
        const output = await PageObjects.console.getOutputText();
        return output.includes('hits');
      });
    });

    it('shows dot indicator on button when filter is active and row is collapsed', async () => {
      await PageObjects.console.clickOutputFilterButton();
      await PageObjects.console.typeInFilterInput('._shards');
      await PageObjects.console.submitFilter();

      // Collapse the filter row
      await PageObjects.console.clickOutputFilterButton();
      await retry.waitFor('filter row to disappear', async () => {
        return !(await PageObjects.console.isOutputFilterRowVisible());
      });

      expect(await PageObjects.console.isOutputFilterButtonActive()).to.be(true);
    });
  });
}
