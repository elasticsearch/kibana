/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@kbn/react-query';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { createTestQueryClient, createMockServices } from '../../../test_utils';
import { RuleFormProvider, type RuleFormServices } from '../../../form/contexts';
import { createInitialState } from '../use_compose_discover_state';
import type { ComposeDiscoverState } from '../types';
import type { ComposeFormValues, RuleQuery } from '../compose_form_types';
import { RecoveryConditionStep } from './recovery_condition_step';
import { EsqlRecoveryContent } from './esql_recovery_content';

jest.mock('@kbn/code-editor', () => ({
  ...jest.requireActual('@kbn/code-editor'),
  CodeEditor: ({ value }: { value: string }) => <pre data-test-subj="codeEditorMock">{value}</pre>,
}));

const BASE_QUERY = 'FROM logs-*\n| STATS count = COUNT(*) BY host.name';
const ALERT_SEGMENT = 'WHERE count > 100';
const RECOVERY_SEGMENT = 'WHERE count < 100';

const createState = (overrides: Partial<ComposeDiscoverState> = {}): ComposeDiscoverState => ({
  ...createInitialState({ mode: 'create' }),
  ...overrides,
});

const BASE_COMPOSE_VALUES: ComposeFormValues = {
  kind: 'alert',
  metadata: { name: '', enabled: true },
  timeField: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: { format: 'composed', base: '', breach: { segment: '' } },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
};

const createComposeFormWrapper = (
  queryOverride?: RuleQuery,
  services: RuleFormServices = createMockServices()
) => {
  const queryClient = createTestQueryClient();
  const defaultValues: ComposeFormValues = {
    ...BASE_COMPOSE_VALUES,
    ...(queryOverride ? { query: queryOverride } : {}),
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const form = useForm<ComposeFormValues>({ defaultValues });
    return (
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <FormProvider {...form}>
            <RuleFormProvider services={services} meta={{ layout: 'flyout' }}>
              {children}
            </RuleFormProvider>
          </FormProvider>
        </QueryClientProvider>
      </IntlProvider>
    );
  };

  return Wrapper;
};

const CUSTOM_RECOVERY_QUERY: RuleQuery = {
  format: 'composed',
  base: BASE_QUERY,
  breach: { segment: ALERT_SEGMENT },
  recovery: { segment: RECOVERY_SEGMENT },
};

const CUSTOM_NO_RECOVERY_QUERY: RuleQuery = {
  format: 'composed',
  base: BASE_QUERY,
  breach: { segment: ALERT_SEGMENT },
};

const renderRecoveryStep = (
  stateOverrides: Partial<ComposeDiscoverState> = {},
  queryOverride?: RuleQuery
) => {
  const state = createState({
    queryCommitted: true,
    ...stateOverrides,
  });
  const dispatch = jest.fn();
  const onRecoveryTypeChange = jest.fn();
  const services = createMockServices();

  render(
    <RecoveryConditionStep
      state={state}
      dispatch={dispatch}
      onRecoveryTypeChange={onRecoveryTypeChange}
      renderCustomRecovery={EsqlRecoveryContent}
    />,
    { wrapper: createComposeFormWrapper(queryOverride, services) }
  );

  return { dispatch, state, onRecoveryTypeChange };
};

describe('RecoveryConditionStep', () => {
  it('renders the recovery type selector in default mode', () => {
    renderRecoveryStep({ recoveryType: 'default' });

    expect(screen.getByTestId('composeDiscoverRecoveryType')).toBeInTheDocument();
  });

  it('does not render query summaries or edit button in default mode', () => {
    renderRecoveryStep({ recoveryType: 'default' });

    expect(screen.queryByText('Base query')).not.toBeInTheDocument();
    expect(screen.queryByText('Recovery condition')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composeDiscoverEditRecovery')).not.toBeInTheDocument();
  });

  it('renders query summaries and edit button in custom mode', () => {
    renderRecoveryStep({ recoveryType: 'custom' }, CUSTOM_RECOVERY_QUERY);

    expect(screen.getByText('Base query')).toBeInTheDocument();
    expect(screen.getByText('Recovery condition')).toBeInTheDocument();
    expect(screen.getByTestId('composeDiscoverEditRecovery')).toBeInTheDocument();
  });

  it('shows "Custom condition set" badge when recovery block is populated', () => {
    renderRecoveryStep({ recoveryType: 'custom' }, CUSTOM_RECOVERY_QUERY);

    expect(screen.getByText('Custom condition set')).toBeInTheDocument();
  });

  it('does not show badge when recovery block is empty', () => {
    renderRecoveryStep({ recoveryType: 'custom' }, CUSTOM_NO_RECOVERY_QUERY);

    expect(screen.queryByText('Custom condition set')).not.toBeInTheDocument();
  });

  it('disables the edit button when the child flyout is open', () => {
    renderRecoveryStep({ recoveryType: 'custom', childOpen: true }, CUSTOM_RECOVERY_QUERY);

    expect(screen.getByTestId('composeDiscoverEditRecovery')).toBeDisabled();
  });

  it('dispatches OPEN_CHILD_FOR_STEP on edit button click', () => {
    const { dispatch, state } = renderRecoveryStep(
      { recoveryType: 'custom', childOpen: false, step: 1 },
      CUSTOM_RECOVERY_QUERY
    );

    fireEvent.click(screen.getByTestId('composeDiscoverEditRecovery'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_CHILD_FOR_STEP',
      step: state.step,
      isAlert: true,
    });
  });
});
