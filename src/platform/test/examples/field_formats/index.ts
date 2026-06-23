/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/examples/field_formats/index.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../functional/ftr_provider_context';

// eslint-disable-next-line import/no-default-export
export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const PageObjects = getPageObjects(['common']);

  describe('Field formats example', function () {
    before(async () => {
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
