/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): x-pack/platform/test/examples/search_examples/partial_results_example.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const PageObjects = getPageObjects(['common', 'svlCommonPage']);
  const retry = getService('retry');

  describe('Partial results example', () => {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
      await PageObjects.common.navigateToApp('searchExamples');
      await testSubjects.click('/search');
    });

    it('should update a progress bar', async () => {
      await testSubjects.click('responseTab');
      const progressBar = await testSubjects.find('progressBar');

      const value = await progressBar.getAttribute('value');
      expect(value).to.be('0');

      await testSubjects.click('requestFibonacci');

      await retry.waitFor('update progress bar', async () => {
        const newValue = (await progressBar.getAttribute('value')) ?? '';
        return parseFloat(newValue) > 0;
      });
    });
  });
}
