/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { SetStateAction } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { EuiComboBoxTestHarness } from '@kbn/test-eui-helpers';
import { applicationServiceMock, docLinksServiceMock } from '@kbn/core/public/mocks';

import type { AppDependencies } from '../../../app_context';
import { AppContextProvider } from '../../../app_context';
import { getMatchingDataStreams, getMatchingIndices } from '../../../services/api';
import { documentationService } from '../../../services/documentation';
import type { CompletionState, DraftPolicy } from '../create_policy_context';
import { CreatePolicyContext } from '../create_policy_context';
import { ConfigurationStep } from './configuration';

jest.mock('@kbn/code-editor');

jest.mock('../../../services/api', () => ({
  ...jest.requireActual('../../../services/api'),
  getMatchingDataStreams: jest.fn(),
  getMatchingIndices: jest.fn(),
}));

const getMatchingDataStreamsMock = jest.mocked(getMatchingDataStreams);
const getMatchingIndicesMock = jest.mocked(getMatchingIndices);

const uploadFileUrl = '/app/home#/tutorial_directory/fileDataViz';

const resolveSetStateAction = <S,>(action: SetStateAction<S>, previous: S): S =>
  typeof action === 'function' ? (action as (prev: S) => S)(previous) : action;

const renderConfigurationStep = async () => {
  const draft: DraftPolicy = {};
  const completionState: CompletionState = { configurationStep: false, fieldsSelectionStep: false };
  const onNext = jest.fn();
  const updateDraft = jest.fn<void, [SetStateAction<DraftPolicy>]>();
  const updateCompletionState = jest.fn<void, [SetStateAction<CompletionState>]>();
  const application = applicationServiceMock.createStartContract();
  application.getUrlForApp.mockReturnValue(uploadFileUrl);
  const appDependencies = { core: { application } } as unknown as AppDependencies;

  render(
    <I18nProvider>
      <AppContextProvider value={appDependencies}>
        <CreatePolicyContext.Provider
          value={{ draft, updateDraft, completionState, updateCompletionState }}
        >
          <ConfigurationStep onNext={onNext} />
        </CreatePolicyContext.Provider>
      </AppContextProvider>
    </I18nProvider>
  );
  // The indices selector loads its options on mount; settle that update before interacting.
  await act(async () => {});

  return {
    application,
    onNext,
    getUpdatedDraft: () => resolveSetStateAction(updateDraft.mock.lastCall![0], draft),
    getUpdatedCompletionState: () =>
      resolveSetStateAction(updateCompletionState.mock.lastCall![0], completionState),
  };
};

const clickNext = () => fireEvent.click(screen.getByTestId('nextButton'));

describe('<ConfigurationStep />', () => {
  beforeAll(() => {
    documentationService.setup(docLinksServiceMock.createStartContract());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getMatchingIndicesMock.mockResolvedValue({
      data: { indices: ['test-1', 'test-2'] },
      error: null,
    });
    getMatchingDataStreamsMock.mockResolvedValue({
      data: { dataStreams: ['test-3'] },
      error: null,
    });
  });

  describe('WHEN the step is rendered', () => {
    it('SHOULD show the type popover and the upload file and match_all query links', async () => {
      const { application } = await renderConfigurationStep();

      expect(screen.getByTestId('typePopoverIcon')).toBeInTheDocument();
      expect(screen.getByTestId('uploadFileLink')).toHaveAttribute('href', uploadFileUrl);
      expect(application.getUrlForApp).toHaveBeenCalledWith('home', {
        path: '#/tutorial_directory/fileDataViz',
      });
      expect(screen.getByTestId('matchAllQueryLink')).toHaveAttribute(
        'href',
        documentationService.getMatchAllQueryLink()
      );
    });

    it('SHOULD load the matching indices and data streams as source options', async () => {
      await renderConfigurationStep();

      expect(getMatchingIndicesMock).toHaveBeenCalledWith('*');
      expect(getMatchingDataStreamsMock).toHaveBeenCalledWith('*');
    });
  });

  describe('WHEN submitting an empty form', () => {
    it('SHOULD show the validation errors and stay on the step', async () => {
      const { onNext } = await renderConfigurationStep();

      clickNext();

      expect(await screen.findByText('A policy name value is required.')).toBeInTheDocument();
      expect(screen.getByText('A policy type value is required.')).toBeInTheDocument();
      expect(screen.getByText('At least one source is required.')).toBeInTheDocument();
      expect(onNext).not.toHaveBeenCalled();
    });
  });

  describe('WHEN submitting a filled form', () => {
    it('SHOULD save the configuration to the draft and go to the next step', async () => {
      const { onNext, getUpdatedDraft, getUpdatedCompletionState } =
        await renderConfigurationStep();

      fireEvent.change(within(screen.getByTestId('policyNameField')).getByRole('textbox'), {
        target: { value: 'test_policy' },
      });
      fireEvent.change(screen.getByTestId('policyTypeField'), { target: { value: 'match' } });
      const sourceComboBox = new EuiComboBoxTestHarness('policySourceIndicesField');
      await sourceComboBox.select('test-1');
      await sourceComboBox.close();

      clickNext();

      await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
      expect(getUpdatedDraft()).toEqual({
        name: 'test_policy',
        type: 'match',
        sourceIndices: ['test-1'],
      });
      expect(getUpdatedCompletionState()).toEqual({
        configurationStep: true,
        fieldsSelectionStep: false,
      });
    });
  });
});
