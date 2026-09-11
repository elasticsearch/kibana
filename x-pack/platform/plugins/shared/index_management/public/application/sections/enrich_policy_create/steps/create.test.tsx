/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import { getESPolicyCreationApiCall } from '../../../../../common/lib';
import type { DraftPolicy } from '../create_policy_context';
import { CreatePolicyContext } from '../create_policy_context';
import { CreateStep } from './create';

const draft: DraftPolicy = {
  name: 'test_policy',
  type: 'match',
  sourceIndices: ['test-1'],
  matchField: 'first_name',
  enrichFields: ['age'],
};

const renderCreateStep = ({ isLoading = false }: { isLoading?: boolean } = {}) => {
  const onSubmit = jest.fn();
  const onBack = jest.fn();

  render(
    <I18nProvider>
      <CreatePolicyContext.Provider
        value={{
          draft,
          updateDraft: jest.fn(),
          completionState: { configurationStep: true, fieldsSelectionStep: true },
          updateCompletionState: jest.fn(),
        }}
      >
        <CreateStep onSubmit={onSubmit} onBack={onBack} isLoading={isLoading} />
      </CreatePolicyContext.Provider>
    </I18nProvider>
  );

  return { onSubmit, onBack };
};

describe('<CreateStep />', () => {
  describe('WHEN the step is rendered', () => {
    it('SHOULD show the policy summary', () => {
      renderCreateStep();

      const summary = screen.getByTestId('enrichPolicySummaryList');
      expect(within(summary).getByTestId('policyNameValue')).toHaveTextContent('test_policy');
      expect(within(summary).getByTestId('policyTypeValue')).toHaveTextContent('match');
      expect(within(summary).getByTestId('policyIndicesValue')).toHaveTextContent('test-1');
      expect(within(summary).getByTestId('policyMatchFieldValue')).toHaveTextContent('first_name');
      expect(within(summary).getByTestId('policyEnrichFieldsValue')).toHaveTextContent('age');
    });

    it('SHOULD show the creation request in the request tab', async () => {
      renderCreateStep();

      fireEvent.click(screen.getByTestId('requestTab'));

      const requestBody = await screen.findByTestId('requestBody');
      expect(requestBody).toHaveTextContent(getESPolicyCreationApiCall('test_policy'));
      expect(requestBody).toHaveTextContent('"match_field": "first_name"');
      expect(requestBody).toHaveTextContent('"enrich_fields": [ "age" ]');
    });

    it('SHOULD go back to the previous step with the back button', () => {
      const { onBack } = renderCreateStep();

      fireEvent.click(screen.getByTestId('backButton'));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('WHEN the create buttons are clicked', () => {
    it('SHOULD create the policy without executing it', () => {
      const { onSubmit } = renderCreateStep();

      fireEvent.click(screen.getByTestId('createButton'));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith();
    });

    it('SHOULD create and execute the policy', () => {
      const { onSubmit } = renderCreateStep();

      fireEvent.click(screen.getByTestId('createAndExecuteButton'));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(true);
    });
  });

  describe('WHEN the policy is being created', () => {
    it('SHOULD disable the create buttons', () => {
      renderCreateStep({ isLoading: true });

      expect(screen.getByTestId('createButton')).toBeDisabled();
      expect(screen.getByTestId('createAndExecuteButton')).toBeDisabled();
    });
  });
});
