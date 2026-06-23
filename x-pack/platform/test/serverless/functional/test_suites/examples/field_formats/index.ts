/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/examples/field_formats/index.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const PageObjects = getPageObjects(['common', 'svlCommonPage']);

  describe('Field formats example', function () {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
      await PageObjects.common.navigateToApp('fieldFormatsExample');
    });

    it('renders field formats example 1', async () => {
      const formattedValues = await Promise.all(
        (
          await testSubjects.findAll('example1 sample formatted')
        ).map((wrapper) => wrapper.getVisibleText())
      );
      expect(formattedValues).to.eql(['1000.00B', '97.66KB', '95.37MB']);
    });

    it('renders field formats example 2', async () => {
      const formattedValues = await Promise.all(
        (
          await testSubjects.findAll('example2 sample formatted')
        ).map((wrapper) => wrapper.getVisibleText())
      );
      expect(formattedValues).to.eql(['$1,000.00', '$100,000.00', '$100,000,000.00']);
    });
  });
}
