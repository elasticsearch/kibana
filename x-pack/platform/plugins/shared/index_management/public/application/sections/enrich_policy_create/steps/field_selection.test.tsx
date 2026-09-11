/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { SetStateAction } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { EuiComboBoxTestHarness } from '@kbn/test-eui-helpers';

import { getFieldsFromIndices } from '../../../services/api';
import type { CompletionState, DraftPolicy } from '../create_policy_context';
import { CreatePolicyContext } from '../create_policy_context';
import { FieldSelectionStep } from './field_selection';

jest.mock('../../../services/api', () => ({
  ...jest.requireActual('../../../services/api'),
  getFieldsFromIndices: jest.fn(),
}));

const getFieldsFromIndicesMock = jest.mocked(getFieldsFromIndices);

const configuredDraft: DraftPolicy = {
  name: 'test_policy',
  type: 'match',
  sourceIndices: ['test-1'],
};
const fieldsFromIndices = {
  commonFields: [],
  indices: [
    {
      index: 'test-1',
      fields: [
        { name: 'first_name', type: 'keyword', normalizedType: 'keyword' },
        { name: 'age', type: 'long', normalizedType: 'number' },
      ],
    },
  ],
};

const resolveSetStateAction = <S,>(action: SetStateAction<S>, previous: S): S =>
  typeof action === 'function' ? (action as (prev: S) => S)(previous) : action;

const renderFieldSelectionStep = async (draft: DraftPolicy = configuredDraft) => {
  const completionState: CompletionState = { configurationStep: true, fieldsSelectionStep: false };
  const onNext = jest.fn();
  const onBack = jest.fn();
  const updateDraft = jest.fn<void, [SetStateAction<DraftPolicy>]>();
  const updateCompletionState = jest.fn<void, [SetStateAction<CompletionState>]>();

  render(
    <I18nProvider>
      <CreatePolicyContext.Provider
        value={{ draft, updateDraft, completionState, updateCompletionState }}
      >
        <FieldSelectionStep onNext={onNext} onBack={onBack} />
      </CreatePolicyContext.Provider>
    </I18nProvider>
  );
  // The step loads the fields of the selected indices on mount; settle that update first.
  await act(async () => {});

  return {
    onNext,
    onBack,
    getUpdatedDraft: () => resolveSetStateAction(updateDraft.mock.lastCall![0], draft),
    getUpdatedCompletionState: () =>
      resolveSetStateAction(updateCompletionState.mock.lastCall![0], completionState),
  };
};

const clickNext = () => fireEvent.click(screen.getByTestId('nextButton'));

describe('<FieldSelectionStep />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFieldsFromIndicesMock.mockResolvedValue({ data: fieldsFromIndices, error: null });
  });

  describe('WHEN the step is rendered', () => {
    it('SHOULD load the fields of the selected source indices', async () => {
      await renderFieldSelectionStep();

      expect(getFieldsFromIndicesMock).toHaveBeenCalledWith(['test-1']);
      expect(screen.queryByTestId('noCommonFieldsError')).not.toBeInTheDocument();
    });

    it('SHOULD go back to the previous step with the back button', async () => {
      const { onBack } = await renderFieldSelectionStep();

      fireEvent.click(screen.getByTestId('backButton'));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('WHEN the selected indices have no common fields', () => {
    it('SHOULD show an error callout', async () => {
      getFieldsFromIndicesMock.mockResolvedValue({
        data: { commonFields: [], indices: [] },
        error: null,
      });

      await renderFieldSelectionStep({ ...configuredDraft, sourceIndices: ['test-1', 'test-2'] });

      expect(await screen.findByTestId('noCommonFieldsError')).toHaveTextContent(
        "The selected indices don't have any fields in common."
      );
    });
  });

  describe('WHEN submitting an empty form', () => {
    it('SHOULD show the validation errors and stay on the step', async () => {
      const { onNext } = await renderFieldSelectionStep();

      clickNext();

      expect(await screen.findByText('A match field is required.')).toBeInTheDocument();
      expect(screen.getByText('At least one enrich field is required.')).toBeInTheDocument();
      expect(onNext).not.toHaveBeenCalled();
    });
  });

  describe('WHEN submitting a filled form', () => {
    it('SHOULD save the selected fields to the draft and go to the next step', async () => {
      const { onNext, getUpdatedDraft, getUpdatedCompletionState } =
        await renderFieldSelectionStep();

      const matchFieldComboBox = new EuiComboBoxTestHarness('matchField');
      await matchFieldComboBox.select('first_name');
      await matchFieldComboBox.waitForClosed();
      const enrichFieldsComboBox = new EuiComboBoxTestHarness('enrichFields');
      await enrichFieldsComboBox.select('age');
      await enrichFieldsComboBox.close();

      clickNext();

      await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
      expect(getUpdatedDraft()).toEqual({
        ...configuredDraft,
        matchField: 'first_name',
        enrichFields: ['age'],
      });
      expect(getUpdatedCompletionState()).toEqual({
        configurationStep: true,
        fieldsSelectionStep: true,
      });
    });
  });
});
