/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EvaluatorsPage } from '.';
import { useDeleteEvaluator, useEvaluators } from '../../hooks/use_evaluators_api';
import { useEvalsPermissions } from '../../hooks/use_evals_permissions';

jest.mock('../../hooks/use_evaluators_api');
jest.mock('../../hooks/use_evals_permissions');
jest.mock('./evaluator_editor_flyout', () => ({
  EvaluatorEditorFlyout: ({ mode, evaluatorName }: { mode: string; evaluatorName?: string }) => (
    <div data-test-subj="mockEditorFlyout">{`${mode}:${evaluatorName ?? ''}`}</div>
  ),
}));

const mockAddSuccess = jest.fn();
jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: () => ({ services: { notifications: { toasts: { addSuccess: mockAddSuccess } } } }),
}));

const mockedUseEvaluators = jest.mocked(useEvaluators);
const mockedUseDeleteEvaluator = jest.mocked(useDeleteEvaluator);
const mockedUsePermissions = jest.mocked(useEvalsPermissions);

const BUILT_IN = {
  name: 'groundedness',
  version: '1.0.0',
  kind: 'llm',
  origin: 'built_in',
  description: 'Measures grounding in tool output',
  evidence_schema: { required: ['input', 'response'] },
};

const CODE_BUILT_IN = {
  name: 'latency',
  version: '1.0.0',
  kind: 'code',
  origin: 'built_in',
  description: 'Returns total trace latency',
};

const USER_DEFINED = {
  name: 'tone-judge',
  version: '1.2.0',
  kind: 'llm',
  origin: 'user_defined',
  description: 'Rates tone of the response',
  evidence_schema: { required: ['response'] },
  reference_data_schema: { required: ['expected'] },
};

const renderPage = (evaluators: unknown[] = [BUILT_IN, CODE_BUILT_IN, USER_DEFINED]) => {
  mockedUseEvaluators.mockReturnValue({
    data: { evaluators },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useEvaluators>);
  return render(<EvaluatorsPage />);
};

const rowNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('rowheader')[0]?.textContent?.trim());

const setFilter = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/** EuiBasicTable renders its actions twice, for the desktop and mobile layouts. */
const clickAction = (testSubj: string) => {
  fireEvent.click(screen.getAllByTestId(testSubj)[0]);
};

describe('EvaluatorsPage', () => {
  const deleteMutateAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    deleteMutateAsync.mockResolvedValue({ success: true, deleted: 1 });
    mockedUseDeleteEvaluator.mockReturnValue({
      mutateAsync: deleteMutateAsync,
      isLoading: false,
    } as unknown as ReturnType<typeof useDeleteEvaluator>);
    mockedUsePermissions.mockReturnValue({ canRead: true, canManage: true });
  });

  it('lists every evaluator with its kind, origin and version', () => {
    renderPage();

    const table = within(screen.getByRole('table'));
    expect(rowNames()).toEqual(['groundedness', 'latency', 'tone-judge']);
    expect(table.getAllByText('User-defined')).toHaveLength(1);
    expect(table.getAllByText('Built-in')).toHaveLength(2);
    expect(table.getByText('1.2.0')).toBeInTheDocument();
  });

  it('summarises the inputs an evaluator requires', () => {
    renderPage();

    expect(screen.getByText('Trace: response')).toBeInTheDocument();
    expect(screen.getByText('Reference: expected')).toBeInTheDocument();
    // A code evaluator declares no schema, so it needs nothing from the caller.
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('searches by name and by description, ignoring case', () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Search evaluators'), {
      target: { value: 'GROUND' },
    });
    expect(rowNames()).toEqual(['groundedness']);

    fireEvent.change(screen.getByPlaceholderText('Search evaluators'), {
      target: { value: 'rates tone' },
    });
    expect(rowNames()).toEqual(['tone-judge']);
  });

  it('filters by kind and by origin', () => {
    renderPage();

    setFilter('Kind', 'code');
    expect(rowNames()).toEqual(['latency']);

    setFilter('Kind', 'all');
    setFilter('Origin', 'user_defined');
    expect(rowNames()).toEqual(['tone-judge']);
  });

  it('offers management actions only for user-defined evaluators', () => {
    renderPage();

    const userDefinedRow = within(screen.getByRole('row', { name: /tone-judge/ }));
    expect(userDefinedRow.getAllByTestId('evalsEvaluatorEdit').length).toBeGreaterThan(0);
    expect(userDefinedRow.getAllByTestId('evalsEvaluatorDelete').length).toBeGreaterThan(0);

    const builtInRow = within(screen.getByRole('row', { name: /groundedness/ }));
    expect(builtInRow.queryByTestId('evalsEvaluatorEdit')).not.toBeInTheDocument();
    expect(builtInRow.queryByTestId('evalsEvaluatorDelete')).not.toBeInTheDocument();
  });

  it('names the row in each action label so the actions are distinguishable', () => {
    renderPage();

    // Asserted on the rendered label text rather than the accessible name: Kibana's jest
    // setup stubs `useGeneratedHtmlId`, so every `aria-labelledby` resolves to one id.
    const userDefinedRow = within(screen.getByRole('row', { name: /tone-judge/ }));
    expect(userDefinedRow.getAllByText('Edit tone-judge').length).toBeGreaterThan(0);
    expect(userDefinedRow.getAllByText('Delete tone-judge').length).toBeGreaterThan(0);
  });

  it('hides every management affordance without the manage privilege', () => {
    mockedUsePermissions.mockReturnValue({ canRead: true, canManage: false });
    renderPage();

    expect(screen.queryByRole('button', { name: 'Create evaluator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit tone-judge' })).not.toBeInTheDocument();
  });

  it('invites the user to create one when the space has no custom evaluators', () => {
    renderPage([BUILT_IN, CODE_BUILT_IN]);

    setFilter('Origin', 'user_defined');

    expect(screen.getByText('No custom evaluators yet')).toBeInTheDocument();
    expect(screen.getByTestId('evalsEvaluatorEmptyCreate')).toBeInTheDocument();
  });

  it('calls a filtered-away set a no-match rather than claiming none exist', () => {
    renderPage();

    // User-defined evaluators exist, they are just never of kind `code`.
    setFilter('Origin', 'user_defined');
    setFilter('Kind', 'code');

    expect(screen.getByText('No evaluators found')).toBeInTheDocument();
    expect(screen.queryByText('No custom evaluators yet')).not.toBeInTheDocument();
  });

  it('restores the full list from the empty state', () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Search evaluators'), {
      target: { value: 'nothing matches this' },
    });
    fireEvent.click(screen.getByTestId('evalsEvaluatorClearFilters'));

    expect(rowNames()).toEqual(['groundedness', 'latency', 'tone-judge']);
  });

  it('opens the editor in create mode, and in edit mode for a chosen evaluator', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Create evaluator' }));
    expect(screen.getByTestId('mockEditorFlyout')).toHaveTextContent('create:');

    clickAction('evalsEvaluatorEdit');
    expect(screen.getByTestId('mockEditorFlyout')).toHaveTextContent('edit:tone-judge');
  });

  it('deletes only after the confirmation is accepted', async () => {
    renderPage();

    clickAction('evalsEvaluatorDelete');
    expect(
      screen.getByText('Delete every stored version of tone-judge? This action cannot be undone.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteMutateAsync).not.toHaveBeenCalled();

    clickAction('evalsEvaluatorDelete');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith('tone-judge'));
    expect(mockAddSuccess).toHaveBeenCalledWith('Deleted evaluator tone-judge');
  });

  it('reports a failed delete without leaving the modal open', async () => {
    deleteMutateAsync.mockRejectedValueOnce(new Error('index is read-only'));
    renderPage();

    clickAction('evalsEvaluatorDelete');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('index is read-only')).toBeInTheDocument());
    expect(mockAddSuccess).not.toHaveBeenCalled();
  });

  it('surfaces a load failure with a way to retry', () => {
    const refetch = jest.fn();
    mockedUseEvaluators.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('cluster unavailable'),
      refetch,
    } as unknown as ReturnType<typeof useEvaluators>);
    render(<EvaluatorsPage />);

    expect(screen.getByText('Unable to load evaluators')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
