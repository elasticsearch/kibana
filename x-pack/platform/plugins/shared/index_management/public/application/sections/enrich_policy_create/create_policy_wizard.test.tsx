/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { notificationServiceMock, scopedHistoryMock } from '@kbn/core/public/mocks';

import type { AppDependencies } from '../../app_context';
import { AppContextProvider } from '../../app_context';
import { createEnrichPolicy, getFieldsFromIndices } from '../../services/api';
import { NotificationService } from '../../services/notification';
import type { CompletionState, DraftPolicy } from './create_policy_context';
import { CreatePolicyContext } from './create_policy_context';
import { CreatePolicyWizard } from './create_policy_wizard';

jest.mock('@kbn/code-editor');

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  createEnrichPolicy: jest.fn(),
  getFieldsFromIndices: jest.fn(),
}));

const createEnrichPolicyMock = jest.mocked(createEnrichPolicy);
const getFieldsFromIndicesMock = jest.mocked(getFieldsFromIndices);

const completedDraft: DraftPolicy = {
  name: 'test_policy',
  type: 'match',
  sourceIndices: ['test-1'],
  matchField: 'first_name',
  enrichFields: ['age'],
};

/**
 * Same state shape as `CreatePolicyContextProvider`, but seeded with a completed draft so the step
 * forms are pre-filled and the wizard can be walked with the Next/Back buttons alone.
 */
const SeededCreatePolicyProvider = ({ children }: { children: React.ReactNode }) => {
  const [draft, updateDraft] = useState<DraftPolicy>(completedDraft);
  const [completionState, updateCompletionState] = useState<CompletionState>({
    configurationStep: false,
    fieldsSelectionStep: false,
  });

  return (
    <CreatePolicyContext.Provider
      value={{ draft, updateDraft, completionState, updateCompletionState }}
    >
      {children}
    </CreatePolicyContext.Provider>
  );
};

const renderCreatePolicyWizard = () => {
  const history = scopedHistoryMock.create();
  const notificationService = new NotificationService(
    notificationServiceMock.createStartContract().toasts
  );
  const showSuccessToast = jest.spyOn(notificationService, 'showSuccessToast');
  const appDependencies = {
    core: { application: { getUrlForApp: jest.fn() } },
    history,
    services: { notificationService },
  } as unknown as AppDependencies;

  render(
    <I18nProvider>
      <AppContextProvider value={appDependencies}>
        <SeededCreatePolicyProvider>
          <CreatePolicyWizard />
        </SeededCreatePolicyProvider>
      </AppContextProvider>
    </I18nProvider>
  );

  return { history, showSuccessToast };
};

const clickNext = async (nextStepTestId: string) => {
  fireEvent.click(screen.getByTestId('nextButton'));
  await screen.findByTestId(nextStepTestId);
};

const clickBack = async (previousStepTestId: string) => {
  fireEvent.click(screen.getByTestId('backButton'));
  await screen.findByTestId(previousStepTestId);
};

const goToCreationStep = async () => {
  await clickNext('fieldSelectionForm');
  await clickNext('creationStep');
};

describe('<CreatePolicyWizard />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFieldsFromIndicesMock.mockResolvedValue({
      data: { commonFields: [], indices: [] },
      error: null,
    });
  });

  describe('WHEN navigating with the next and back buttons', () => {
    it('SHOULD move back and forth between the steps', async () => {
      renderCreatePolicyWizard();
      expect(screen.getByTestId('configurationForm')).toBeInTheDocument();

      await goToCreationStep();

      await clickBack('fieldSelectionForm');
      expect(screen.queryByTestId('creationStep')).not.toBeInTheDocument();

      await clickBack('configurationForm');
      expect(screen.queryByTestId('fieldSelectionForm')).not.toBeInTheDocument();
    });
  });

  describe('WHEN creating the policy fails', () => {
    const createError = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'something went wrong...',
    };

    beforeEach(() => {
      createEnrichPolicyMock.mockResolvedValue({ data: null, error: createError });
    });

    it('SHOULD show an error callout and stay on the creation step', async () => {
      const { history } = renderCreatePolicyWizard();
      await goToCreationStep();

      fireEvent.click(screen.getByTestId('createButton'));

      expect(await screen.findByTestId('errorWhenCreatingCallout')).toHaveTextContent(
        createError.message
      );
      expect(createEnrichPolicyMock).toHaveBeenCalledWith(completedDraft, undefined);
      expect(screen.getByTestId('creationStep')).toBeInTheDocument();
      expect(history.push).not.toHaveBeenCalled();
    });

    it('SHOULD clear the error callout when going back to the previous step', async () => {
      renderCreatePolicyWizard();
      await goToCreationStep();
      fireEvent.click(screen.getByTestId('createButton'));
      await screen.findByTestId('errorWhenCreatingCallout');

      await clickBack('fieldSelectionForm');

      expect(screen.queryByTestId('errorWhenCreatingCallout')).not.toBeInTheDocument();
    });
  });

  describe('WHEN creating the policy succeeds', () => {
    beforeEach(() => {
      createEnrichPolicyMock.mockResolvedValue({ data: { acknowledged: true }, error: null });
    });

    it('SHOULD show a success toast and navigate to the policies list', async () => {
      const { history, showSuccessToast } = renderCreatePolicyWizard();
      await goToCreationStep();

      fireEvent.click(screen.getByTestId('createButton'));

      await waitFor(() => expect(history.push).toHaveBeenCalledWith('/enrich_policies'));
      expect(createEnrichPolicyMock).toHaveBeenCalledWith(completedDraft, undefined);
      expect(showSuccessToast).toHaveBeenCalledWith('Created policy: test_policy');
    });

    it('SHOULD execute the policy after creating it with the create and execute button', async () => {
      const { history, showSuccessToast } = renderCreatePolicyWizard();
      await goToCreationStep();

      fireEvent.click(screen.getByTestId('createAndExecuteButton'));

      await waitFor(() => expect(history.push).toHaveBeenCalledWith('/enrich_policies'));
      expect(createEnrichPolicyMock).toHaveBeenCalledWith(completedDraft, true);
      expect(showSuccessToast).toHaveBeenCalledWith('Created and executed policy: test_policy');
    });
  });
});
