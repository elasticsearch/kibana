/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../ftr_provider_context';

const ADD_TO_CASE_SELECTOR = 'add-to-case-action';
const SELECT_CASE_MODAL = 'all-cases-modal';

export function ObservabilityAlertsAddToCaseProvider({ getService }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');

  const getAddToCaseSelector = async () => {
    return await testSubjects.find(ADD_TO_CASE_SELECTOR);
  };

  const getAddToCaseSelectorOrFail = async () => {
    return await testSubjects.existOrFail(ADD_TO_CASE_SELECTOR);
  };

  const missingAddToCaseSelectorOrFail = async () => {
    return await testSubjects.missingOrFail(ADD_TO_CASE_SELECTOR);
  };

  const addToCaseButtonClick = async () => {
    return await (await getAddToCaseSelector()).click();
  };

  const getAddToExistingCaseModalOrFail = async () => {
    return await testSubjects.existOrFail(SELECT_CASE_MODAL);
  };

  return {
    getAddToCaseSelector,
    getAddToCaseSelectorOrFail,
    missingAddToCaseSelectorOrFail,
    addToCaseButtonClick,
    getAddToExistingCaseModalOrFail,
  };
}
