/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@kbn/react-query';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { createTestQueryClient, createMockServices } from '../../../test_utils';
import { RuleFormProvider, type RuleFormServices } from '../../../form/contexts';
import { createInitialState } from '../use_compose_discover_state';
import type { ComposeDiscoverState } from '../types';
import type { ComposeFormValues, RuleQuery } from '../compose_form_types';
import { AlertConditionStep } from './alert_condition_step';
import { ComposeDiscoverTimeFieldContextProvider } from '../compose_discover_time_field_context';

jest.mock('@kbn/code-editor', () => ({
  ...jest.requireActual('@kbn/code-editor'),
  CodeEditor: ({ value }: { value: string }) => <pre data-test-subj="codeEditorMock">{value}</pre>,
}));

jest.mock('@kbn/esql-utils', () => ({
  getEsqlColumns: jest.fn(async () => []),
}));

const BASE_QUERY = 'FROM logs-*';
const ALERT_BLOCK = '| WHERE count > 100';

const createState = (overrides: Partial<ComposeDiscoverState> = {}): ComposeDiscoverState => ({
  ...createInitialState({ mode: 'create' }),
  ...overrides,
});

const BASE_COMPOSE_VALUES: ComposeFormValues = {
  kind: 'alert',
  metadata: { name: '', enabled: true },
  timeField: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: {
    format: 'composed',
    base: BASE_QUERY,
    breach: { segment: ALERT_BLOCK },
  },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
};

const createComposeFormWrapper = (
  formValueOverrides: Partial<ComposeFormValues> = {},
  services: RuleFormServices = createMockServices()
) => {
  const queryClient = createTestQueryClient();
  const defaultValues: ComposeFormValues = {
    ...BASE_COMPOSE_VALUES,
    ...formValueOverrides,
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const form = useForm<ComposeFormValues>({ defaultValues });
    return (
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <FormProvider {...form}>
            <RuleFormProvider services={services} meta={{ layout: 'flyout' }}>
              <ComposeDiscoverTimeFieldContextProvider
                value={{
                  timeFieldOptions: [{ value: '@timestamp', text: '@timestamp' }],
                  isTimeFieldResolved: true,
                }}
              >
                {children}
              </ComposeDiscoverTimeFieldContextProvider>
            </RuleFormProvider>
          </FormProvider>
        </QueryClientProvider>
      </IntlProvider>
    );
  };

  return Wrapper;
};

interface RenderOptions {
  isEditing?: boolean;
  formValueOverrides?: Partial<ComposeFormValues>;
}

const renderStep = (
  stateOverrides: Partial<ComposeDiscoverState> = {},
  { isEditing = false, formValueOverrides = {} }: RenderOptions = {}
) => {
  const state = createState({
    queryCommitted: true,
    ...stateOverrides,
  });
  const dispatch = jest.fn();
  const services = createMockServices();

  render(
    <AlertConditionStep
      state={state}
      dispatch={dispatch}
      services={services}
      isEditing={isEditing}
    />,
    { wrapper: createComposeFormWrapper(formValueOverrides, services) }
  );

  return { dispatch, state };
};

const STANDALONE_QUERY: RuleQuery = {
  format: 'standalone',
  breach: { query: 'FROM logs-* | LIMIT 10' },
};

const COMPOSED_QUERY: RuleQuery = {
  format: 'composed',
  base: 'FROM logs-* | STATS count = COUNT(*) BY host.name',
  breach: { segment: '| WHERE count > 100' },
};

const COMPOSED_QUERY_EMPTY_BASE: RuleQuery = {
  format: 'composed',
  base: '',
  breach: { segment: '| WHERE count > 100' },
};

describe('AlertConditionStep', () => {
  describe('query display', () => {
    it('shows "No query defined yet" when query is not committed', () => {
      renderStep({ queryCommitted: false });

      expect(screen.getByText('No query defined yet')).toBeInTheDocument();
      expect(screen.getByTestId('composeDiscoverOpenEditor')).toBeInTheDocument();
    });

    it('shows standalone query summary for signal kind', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'signal', query: STANDALONE_QUERY } }
      );

      expect(screen.getByTestId('composeDiscoverEditQuery')).toBeInTheDocument();
    });

    it('shows base and alert condition summaries for alert kind', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY } }
      );

      expect(screen.getByText('Base query')).toBeInTheDocument();
      expect(screen.getByText('Alert condition')).toBeInTheDocument();
      expect(screen.getByTestId('composeDiscoverEditQueries')).toBeInTheDocument();
    });

    it('shows split-failed callout when base query is empty', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY_EMPTY_BASE } }
      );

      expect(
        screen.getByText(/Couldn't automatically separate base query from alert condition/)
      ).toBeInTheDocument();
    });

    it('shows alert-condition-missing callout when base query is present but alert condition is empty', () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            kind: 'alert',
            query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '' } },
          },
        }
      );

      expect(screen.getByTestId('composeDiscoverAlertQueryMissing')).toBeInTheDocument();
      expect(screen.getByText('Alert condition required')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Define an alert condition in the query editor before continuing to the next step.'
        )
      ).toBeInTheDocument();
    });

    it('does not show alert-condition-missing callout when splitFailed callout is already shown', () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            kind: 'alert',
            query: { format: 'composed', base: '', breach: { segment: '' } },
          },
        }
      );

      expect(
        screen.getByText(/Couldn't automatically separate base query from alert condition/)
      ).toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverAlertQueryMissing')).not.toBeInTheDocument();
    });

    it('does not show alert-query-missing callout when both queries are defined', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY } }
      );

      expect(screen.queryByTestId('composeDiscoverAlertQueryMissing')).not.toBeInTheDocument();
    });

    it('does not show alert-query-missing callout for signal kind', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'signal', query: STANDALONE_QUERY } }
      );

      expect(screen.queryByTestId('composeDiscoverAlertQueryMissing')).not.toBeInTheDocument();
    });

    it('does not show alert-query-missing callout when query is not committed', () => {
      renderStep(
        { queryCommitted: false },
        {
          formValueOverrides: {
            kind: 'alert',
            query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '' } },
          },
        }
      );

      expect(screen.queryByTestId('composeDiscoverAlertQueryMissing')).not.toBeInTheDocument();
    });
  });

  describe('editor buttons', () => {
    it('disables "Open query editor" when child flyout is open', () => {
      renderStep({ queryCommitted: false, childOpen: true });

      expect(screen.getByTestId('composeDiscoverOpenEditor')).toBeDisabled();
    });

    it('disables "Edit query" when child flyout is open', () => {
      renderStep(
        { queryCommitted: true, childOpen: true },
        { formValueOverrides: { kind: 'signal', query: STANDALONE_QUERY } }
      );

      expect(screen.getByTestId('composeDiscoverEditQuery')).toBeDisabled();
    });

    it('disables "Edit queries" when child flyout is open', () => {
      renderStep(
        { queryCommitted: true, childOpen: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY } }
      );

      expect(screen.getByTestId('composeDiscoverEditQueries')).toBeDisabled();
    });

    it('dispatches OPEN_CHILD_FOR_STEP on "Open query editor" click', () => {
      const { dispatch, state } = renderStep({ queryCommitted: false, childOpen: false });

      fireEvent.click(screen.getByTestId('composeDiscoverOpenEditor'));

      expect(dispatch).toHaveBeenCalledWith({
        type: 'OPEN_CHILD_FOR_STEP',
        step: state.step,
        isAlert: true,
      });
    });
  });

  describe('time field', () => {
    it('renders the time field selector', () => {
      renderStep({ queryCommitted: true });

      expect(screen.getByTestId('composeDiscoverTimeField')).toBeInTheDocument();
    });

    it('disables time field when child flyout is open', () => {
      renderStep({ queryCommitted: true, childOpen: true });

      expect(screen.getByTestId('composeDiscoverTimeField')).toBeDisabled();
    });
  });

  describe('group fields', () => {
    it('renders the group fields selector', () => {
      renderStep({ queryCommitted: true });

      expect(screen.getByTestId('composeDiscoverGroupFields')).toBeInTheDocument();
    });
  });

  describe('group-by auto-population in tracking mode', () => {
    it('extracts BY columns from the base query (composed format)', async () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            query: {
              format: 'composed',
              base: 'FROM logs-*\n| STATS count = COUNT(*) BY host.name',
              breach: { segment: '| WHERE count > 100' },
            },
          },
        }
      );

      await waitFor(() => {
        expect(screen.getByText('host.name')).toBeInTheDocument();
      });
    });

    it('extracts multiple BY columns from the base query', async () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            query: {
              format: 'composed',
              base: 'FROM kibana_sample_data_ecommerce\n| STATS total = SUM(taxful_total_price) BY customer_gender, day_of_week',
              breach: { segment: '| WHERE total > 1000' },
            },
          },
        }
      );

      await waitFor(() => {
        expect(screen.getByText('customer_gender')).toBeInTheDocument();
        expect(screen.getByText('day_of_week')).toBeInTheDocument();
      });
    });

    it('clears group fields when the base query has no STATS BY', async () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            query: {
              format: 'composed',
              base: 'FROM logs-*\n| STATS count = COUNT(*)',
              breach: { segment: '| WHERE count > 100' },
            },
          },
        }
      );

      const comboBox = screen.getByTestId('composeDiscoverGroupFields');
      await waitFor(() => {
        expect(comboBox).toBeInTheDocument();
      });
      expect(comboBox.querySelectorAll('[data-test-subj="euiComboBoxPill"]')).toHaveLength(0);
    });
  });
});
