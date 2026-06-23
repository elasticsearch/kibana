/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/examples/partial_results/index.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const PageObjects = getPageObjects(['common', 'svlCommonPage']);

  describe('Partial Results Example', function () {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
      await PageObjects.common.navigateToApp('partialResultsExample');

      const element = await testSubjects.find('example-help');

      await element.click();
      await element.click();
      await element.click();
    });

    it('should trace mouse events', async () => {
      const events = await Promise.all(
        (
          await testSubjects.findAll('example-column-event')
        ).map((wrapper) => wrapper.getVisibleText())
      );
      expect(events).to.eql(['mousedown', 'mouseup', 'click']);
    });

    it('should keep track of the events number', async () => {
      const counters = await Promise.all(
        (
          await testSubjects.findAll('example-column-count')
        ).map((wrapper) => wrapper.getVisibleText())
      );
      expect(counters).to.eql(['3', '3', '3']);
    });
  });
}
