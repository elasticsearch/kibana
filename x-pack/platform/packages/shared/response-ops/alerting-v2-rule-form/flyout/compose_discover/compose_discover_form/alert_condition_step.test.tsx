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
import type { FormValues, RuleQuery } from '../../../form/types';
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

const BASE_COMPOSE_VALUES: FormValues = {
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
  formValueOverrides: Partial<FormValues> = {},
  services: RuleFormServices = createMockServices()
) => {
  const queryClient = createTestQueryClient();
  const defaultValues: FormValues = {
    ...BASE_COMPOSE_VALUES,
    ...formValueOverrides,
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const form = useForm<FormValues>({ defaultValues });
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
  formValueOverrides?: Partial<FormValues>;
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
    it('shows the before-apply summary state when query is not committed (alert)', () => {
      renderStep({ queryCommitted: false });

      expect(screen.getByTestId('esqlQuerySummarySection-before_apply')).toBeInTheDocument();
      expect(screen.getByText('Open the editor to write your ES|QL query')).toBeInTheDocument();
      expect(screen.getByTestId('esqlSummaryOpenEditor')).toBeInTheDocument();
    });

    it('shows standalone query summary for signal kind', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'signal', query: STANDALONE_QUERY } }
      );

      expect(screen.getByTestId('composeDiscoverEditQuery')).toBeInTheDocument();
    });

    it('shows the success state with base and alert condition for alert kind', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY } }
      );

      expect(screen.getByTestId('esqlQuerySummarySection-success')).toBeInTheDocument();
      expect(screen.getByText('Base query')).toBeInTheDocument();
      expect(screen.getByText('Alert condition')).toBeInTheDocument();
      expect(screen.getByTestId('esqlSummaryOpenEditor')).toBeInTheDocument();
    });

    it('shows split-failed callout when base query is empty', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY_EMPTY_BASE } }
      );

      expect(screen.getByTestId('esqlQuerySummarySection-split_failed')).toBeInTheDocument();
      expect(
        screen.getByText(/Couldn't automatically separate base query from alert condition/)
      ).toBeInTheDocument();
    });

    it('shows the no-alert-condition callout when base is present but alert condition is empty', () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            kind: 'alert',
            query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '' } },
          },
        }
      );

      expect(screen.getByTestId('esqlSummaryNoAlertConditionCallout')).toBeInTheDocument();
      expect(screen.getByText('No alert condition')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Without an alert condition, every row returned by the base query is treated as a breach.'
        )
      ).toBeInTheDocument();
    });

    it('shows the no-alert-condition state for an alert persisted as a standalone query', () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            kind: 'alert',
            query: { format: 'standalone', breach: { query: 'FROM logs-* | STATS c = COUNT(*)' } },
          },
        }
      );

      expect(screen.getByTestId('esqlQuerySummarySection-no_alert_condition')).toBeInTheDocument();
      expect(screen.getByTestId('esqlSummaryNoAlertConditionCallout')).toBeInTheDocument();
      // The standalone breach query is surfaced as the base query block.
      expect(screen.getByText(/FROM logs-\* \| STATS c = COUNT/)).toBeInTheDocument();
    });

    it('shows the empty-query callout when both base and alert condition are empty', () => {
      renderStep(
        { queryCommitted: true },
        {
          formValueOverrides: {
            kind: 'alert',
            query: { format: 'composed', base: '', breach: { segment: '' } },
          },
        }
      );

      expect(screen.getByTestId('esqlQuerySummarySection-empty')).toBeInTheDocument();
      expect(screen.getByTestId('esqlSummaryEmptyCallout')).toBeInTheDocument();
      expect(screen.queryByTestId('esqlSummaryNoAlertConditionCallout')).not.toBeInTheDocument();
    });

    it('does not show the no-alert-condition callout when both queries are defined', () => {
      renderStep(
        { queryCommitted: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY } }
      );

      expect(screen.queryByTestId('esqlSummaryNoAlertConditionCallout')).not.toBeInTheDocument();
    });
  });

  describe('editor buttons', () => {
    it('disables the edit CTA when child flyout is open (alert before apply)', () => {
      renderStep({ queryCommitted: false, childOpen: true });

      expect(screen.getByTestId('esqlSummaryOpenEditor')).toBeDisabled();
    });

    it('disables "Edit query" when child flyout is open (signal)', () => {
      renderStep(
        { queryCommitted: true, childOpen: true },
        { formValueOverrides: { kind: 'signal', query: STANDALONE_QUERY } }
      );

      expect(screen.getByTestId('composeDiscoverEditQuery')).toBeDisabled();
    });

    it('disables the edit CTA when child flyout is open (alert committed)', () => {
      renderStep(
        { queryCommitted: true, childOpen: true },
        { formValueOverrides: { kind: 'alert', query: COMPOSED_QUERY } }
      );

      expect(screen.getByTestId('esqlSummaryOpenEditor')).toBeDisabled();
    });

    it('dispatches OPEN_CHILD_FOR_STEP on edit CTA click', () => {
      const { dispatch, state } = renderStep({ queryCommitted: false, childOpen: false });

      fireEvent.click(screen.getByTestId('esqlSummaryOpenEditor'));

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
