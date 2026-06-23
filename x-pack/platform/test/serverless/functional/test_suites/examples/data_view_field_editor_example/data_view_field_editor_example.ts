/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/examples/data_view_field_editor_example/data_view_field_editor_example.ts
import expect from '@kbn/expect';
// TODO: Changed from PluginFunctionalProviderContext to FtrProviderContext in Serverless
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const retry = getService('retry');
  const flyout = getService('flyout');

  describe('data_view_field_editor_example', () => {
    it('finds a data view', async () => {
      await testSubjects.existOrFail('dataViewTitle');
    });

    it('opens the field editor', async () => {
      await testSubjects.click('addField');
      await testSubjects.existOrFail('flyoutTitle');
      await retry.try(async () => {
        await flyout.closeFlyout();
        await testSubjects.missingOrFail('flyoutTitle');
      });
    });

    it('uses preconfigured options for a new field', async () => {
      // find the checkbox label and click it - `testSubjects.setCheckbox()` is not working for our checkbox
      const controlWrapper = await testSubjects.find('preconfiguredControlWrapper');
      const control = await find.descendantDisplayedByCssSelector('label', controlWrapper);
      await control.click();

      await testSubjects.click('addField');
      await testSubjects.existOrFail('flyoutTitle');

      const nameField = await testSubjects.find('nameField');
      const nameInput = await find.descendantDisplayedByCssSelector(
        '[data-test-subj=input]',
        nameField
      );

      expect(await nameInput.getAttribute('value')).to.equal('demotestfield');
    });
  });
}
