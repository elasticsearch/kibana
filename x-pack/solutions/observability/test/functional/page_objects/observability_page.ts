/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../ftr_provider_context';

export function ObservabilityPageProvider({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const textValue = 'Foobar';
  const PageObjects = getPageObjects(['common', 'header']);

  return {
    async clickSolutionNavigationEntry(appId: string, navId: string) {
      await testSubjects.click(`observability-nav-${appId}-${navId}`);
    },

    async expectCreateCaseButtonEnabled() {
      const button = await testSubjects.find('createNewCaseBtn', 20000);
      const disabledAttr = await button.getAttribute('disabled');
      expect(disabledAttr).to.be(null);
    },

    async expectCreateCaseButtonMissing() {
      await testSubjects.missingOrFail('createNewCaseBtn');
    },

    async expectReadOnlyGlassesBadge() {
      await testSubjects.existOrFail('headerBadge');
    },

    async expectNoReadOnlyCallout() {
      await testSubjects.missingOrFail('caseCallout-e41900b01c9ef0fa81dd6ff326083fb3');
    },

    async expectNoDataPage() {
      await testSubjects.existOrFail('kbnNoDataPage');
    },

    async expectCreateCase() {
      await testSubjects.existOrFail('case-creation-form-steps');
    },

    async expectAddCommentButton() {
      await PageObjects.header.waitUntilLoadingHasFinished();
      await testSubjects.setValue('add-comment', textValue);
      const button = await testSubjects.find('submit-comment', 20000);
      const disabledAttr = await button.getAttribute('disabled');
      expect(disabledAttr).to.be(null);
    },

    async expectAddCommentButtonMissing() {
      await testSubjects.missingOrFail('submit-comment');
    },

    async expectForbidden() {
      const h2 = await testSubjects.find('noFeaturePermissions', 20000);
      const text = await h2.getVisibleText();
      expect(text).to.contain('Kibana feature privileges required');
    },

    async getDatePickerRangeText() {
      if (await testSubjects.exists('dateRangePickerControlButton', { timeout: 2000 })) {
        // New DateRangePicker renders the humanised range as the control button's
        // visible text (the `dateRangePickerValueDisplay` node), e.g. "Last 15
        // minutes". The button has no `value` attribute.
        return await testSubjects.getVisibleText('dateRangePickerValueDisplay');
      }
      const datePickerButton = await testSubjects.find('superDatePickerShowDatesButton');
      return await datePickerButton.getVisibleText();
    },
  };
}
