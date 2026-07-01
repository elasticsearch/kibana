/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { createInitialState } from './use_compose_discover_state';
import type { ComposeDiscoverState, StepDefinition } from './types';
import type { FormValues } from '../../form/types';
import { ComposeDiscoverFooter, type ComposeDiscoverFooterProps } from './compose_discover_footer';

const ALERT_CONDITION_STEP: StepDefinition = {
  id: 'alertCondition',
  title: 'Alert Condition',
  render: () => null,
};

const BUILDER_CONDITION_STEP: StepDefinition = {
  id: 'builderCondition',
  title: 'Alert Condition',
  render: () => null,
};

const DETAILS_STEP: StepDefinition = {
  id: 'details',
  title: 'Details & Artifacts',
  render: () => null,
};

const createState = (overrides: Partial<ComposeDiscoverState> = {}): ComposeDiscoverState => ({
  ...createInitialState({ mode: 'create' }),
  ...overrides,
});

const Wrapper = ({
  formValues,
  children,
}: {
  formValues: Partial<FormValues>;
  children: React.ReactNode;
}) => {
  const defaults: FormValues = {
    kind: 'alert',
    metadata: { name: '', enabled: true },
    timeField: '@timestamp',
    schedule: { every: '1m', lookback: '5m' },
    query: { format: 'composed', base: '', breach: { segment: '' } },
    stateTransitionAlertDelayMode: 'immediate',
    stateTransitionRecoveryDelayMode: 'immediate',
    ...formValues,
  };
  const form = useForm<FormValues>({ defaultValues: defaults });
  return (
    <IntlProvider locale="en">
      <FormProvider {...form}>{children}</FormProvider>
    </IntlProvider>
  );
};

const renderFooter = ({
  stateOverrides = {},
  formValues = {},
  propsOverrides = {},
}: {
  stateOverrides?: Partial<ComposeDiscoverState>;
  formValues?: Partial<FormValues>;
  propsOverrides?: Partial<ComposeDiscoverFooterProps>;
} = {}) => {
  const onNext = jest.fn();
  const onFinalSubmit = jest.fn();
  const onYamlSave = jest.fn();
  const dispatch = jest.fn();

  const props: ComposeDiscoverFooterProps = {
    uiState: createState({ queryCommitted: true, childOpen: false, ...stateOverrides }),
    dispatch,
    currentStep: ALERT_CONDITION_STEP,
    isLastStep: false,
    isCreate: true,
    hasValidationErrors: false,
    yamlHasErrors: false,
    isBuilderMode: false,
    isBuilderStepValid: true,
    isSaving: false,
    onNext,
    onFinalSubmit,
    onYamlSave,
    ...propsOverrides,
  };

  render(
    <Wrapper formValues={formValues}>
      <ComposeDiscoverFooter {...props} />
    </Wrapper>
  );

  return { onNext, onFinalSubmit, onYamlSave, dispatch };
};

describe('ComposeDiscoverFooter', () => {
  describe('form stepper mode', () => {
    it('renders Next button when not on last step', () => {
      renderFooter();
      expect(screen.getByTestId('composeDiscoverNext')).toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverSubmit')).not.toBeInTheDocument();
    });

    it('renders Submit button on last step', () => {
      renderFooter({ propsOverrides: { isLastStep: true } });
      expect(screen.getByTestId('composeDiscoverSubmit')).toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverNext')).not.toBeInTheDocument();
    });

    it('shows "Create rule" label in create mode', () => {
      renderFooter({ propsOverrides: { isLastStep: true, isCreate: true } });
      expect(screen.getByTestId('composeDiscoverSubmit')).toHaveTextContent('Create rule');
    });

    it('shows "Save rule" label when not in create mode', () => {
      renderFooter({ propsOverrides: { isLastStep: true, isCreate: false } });
      expect(screen.getByTestId('composeDiscoverSubmit')).toHaveTextContent('Save rule');
    });

    it('calls onNext when Next is clicked', () => {
      const { onNext } = renderFooter({
        formValues: {
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '| WHERE x > 1' } },
        },
      });
      fireEvent.click(screen.getByTestId('composeDiscoverNext'));
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('calls onFinalSubmit when Submit is clicked', () => {
      const { onFinalSubmit } = renderFooter({
        propsOverrides: { isLastStep: true },
        stateOverrides: { queryCommitted: true },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '| WHERE x > 1' } },
        },
      });
      fireEvent.click(screen.getByTestId('composeDiscoverSubmit'));
      expect(onFinalSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not show Back button on first step', () => {
      renderFooter({ stateOverrides: { step: 0 } });
      expect(screen.queryByTestId('composeDiscoverBack')).not.toBeInTheDocument();
    });

    it('shows Back button on step > 0', () => {
      renderFooter({ stateOverrides: { step: 1 } });
      expect(screen.getByTestId('composeDiscoverBack')).toBeInTheDocument();
    });

    it('dispatches GO_BACK when Back is clicked', () => {
      const { dispatch } = renderFooter({ stateOverrides: { step: 1 } });
      fireEvent.click(screen.getByTestId('composeDiscoverBack'));
      expect(dispatch).toHaveBeenCalledWith({ type: 'GO_BACK', isBuilderMode: false });
    });
  });

  describe('Cancel button', () => {
    it('does not render a Cancel button', () => {
      renderFooter();
      expect(screen.queryByTestId('composeDiscoverCancel')).not.toBeInTheDocument();
    });
  });

  describe('YAML mode', () => {
    it('renders YAML submit button instead of stepper controls', () => {
      renderFooter({ stateOverrides: { yamlMode: true } });
      expect(screen.getByTestId('composeDiscoverYamlSubmit')).toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverNext')).not.toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverCancel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverBack')).not.toBeInTheDocument();
    });

    it('calls onYamlSave when YAML submit is clicked', () => {
      const { onYamlSave } = renderFooter({
        stateOverrides: { yamlMode: true, queryCommitted: true },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '| WHERE x > 1' } },
        },
      });
      fireEvent.click(screen.getByTestId('composeDiscoverYamlSubmit'));
      expect(onYamlSave).toHaveBeenCalledTimes(1);
    });

    it('enables YAML save for a non-representable alert + standalone rule', () => {
      const { onYamlSave } = renderFooter({
        stateOverrides: { yamlMode: true, queryCommitted: true, mode: 'edit' },
        propsOverrides: { isCreate: false },
        formValues: {
          kind: 'alert',
          query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverYamlSubmit')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('composeDiscoverYamlSubmit'));
      expect(onYamlSave).toHaveBeenCalledTimes(1);
    });

    it('disables YAML submit when hasValidationErrors is true', () => {
      renderFooter({
        stateOverrides: { yamlMode: true },
        propsOverrides: { hasValidationErrors: true },
      });
      expect(screen.getByTestId('composeDiscoverYamlSubmit')).toBeDisabled();
    });

    it('disables YAML submit when yamlHasErrors is true', () => {
      renderFooter({
        stateOverrides: { yamlMode: true },
        propsOverrides: { yamlHasErrors: true },
      });
      expect(screen.getByTestId('composeDiscoverYamlSubmit')).toBeDisabled();
    });

    it('does not call onYamlSave when the disabled button is clicked', () => {
      const { onYamlSave } = renderFooter({
        stateOverrides: { yamlMode: true },
        propsOverrides: { yamlHasErrors: true },
      });
      fireEvent.click(screen.getByTestId('composeDiscoverYamlSubmit'));
      expect(onYamlSave).not.toHaveBeenCalled();
    });
  });

  describe('Next button disabled states', () => {
    it('disables Next when query is not committed', () => {
      renderFooter({ stateOverrides: { queryCommitted: false } });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('disables Next when child flyout is open', () => {
      renderFooter({
        stateOverrides: { childOpen: true },
        formValues: {
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '| WHERE x > 1' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('disables Next when hasValidationErrors is true', () => {
      renderFooter({ propsOverrides: { hasValidationErrors: true } });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('disables Next for a base-only alert (no alert condition) persisted as standalone', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true },
        formValues: {
          kind: 'alert',
          query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        },
      });
      // Per #621/#623 an alert needs a valid alert condition to advance; no_where blocks Next.
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('disables Next for an empty standalone alert in edit mode', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true, mode: 'edit' },
        formValues: {
          kind: 'alert',
          query: { format: 'standalone', breach: { query: '' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('disables Next for a composed alert with base but no breach segment in edit mode', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true, mode: 'edit' },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('disables Next for an alert whose split failed (base missing)', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: '', breach: { segment: '| WHERE x > 1' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('disables Next when both base and breach segments are empty', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: '', breach: { segment: '' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('enables Next when both base and breach queries are defined', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '| WHERE x > 1' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).not.toBeDisabled();
    });

    it('enables Next for signal kind even without breach segment', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true },
        formValues: {
          kind: 'signal',
          query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).not.toBeDisabled();
    });

    it('does not apply breach query check on non-alertCondition steps', () => {
      renderFooter({
        stateOverrides: { queryCommitted: true },
        propsOverrides: { currentStep: DETAILS_STEP },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).not.toBeDisabled();
    });
  });

  describe('Back button disabled state', () => {
    it('disables Back when child flyout is open', () => {
      renderFooter({ stateOverrides: { step: 1, childOpen: true } });
      expect(screen.getByTestId('composeDiscoverBack')).toBeDisabled();
    });

    it('does not disable Back when child flyout is open in builder mode', () => {
      renderFooter({
        stateOverrides: { step: 1, childOpen: true },
        propsOverrides: { isBuilderMode: true },
      });
      expect(screen.getByTestId('composeDiscoverBack')).not.toBeDisabled();
    });
  });

  describe('Builder mode validation', () => {
    it('disables Next when isBuilderStepValid is false', () => {
      renderFooter({
        propsOverrides: {
          currentStep: BUILDER_CONDITION_STEP,
          isBuilderMode: true,
          isBuilderStepValid: false,
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });

    it('enables Next when isBuilderStepValid is true', () => {
      renderFooter({
        propsOverrides: {
          currentStep: BUILDER_CONDITION_STEP,
          isBuilderMode: true,
          isBuilderStepValid: true,
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).not.toBeDisabled();
    });

    it('does not block Next due to childOpen in builder mode', () => {
      renderFooter({
        stateOverrides: { childOpen: true },
        propsOverrides: {
          currentStep: BUILDER_CONDITION_STEP,
          isBuilderMode: true,
          isBuilderStepValid: true,
        },
      });
      expect(screen.getByTestId('composeDiscoverNext')).not.toBeDisabled();
    });
  });

  describe('Submit button disabled state', () => {
    it('disables Submit when hasValidationErrors is true', () => {
      renderFooter({
        propsOverrides: { isLastStep: true, hasValidationErrors: true },
      });
      expect(screen.getByTestId('composeDiscoverSubmit')).toBeDisabled();
    });

    it('enables Submit on the last step when there are no validation errors', () => {
      renderFooter({
        propsOverrides: { isLastStep: true },
        stateOverrides: { queryCommitted: true },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '| WHERE x > 1' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverSubmit')).not.toBeDisabled();
    });

    it('disables Submit for a composed alert with base but no breach segment in edit mode', () => {
      renderFooter({
        propsOverrides: { isLastStep: true, isCreate: false },
        stateOverrides: { queryCommitted: true, mode: 'edit' },
        formValues: {
          kind: 'alert',
          query: { format: 'composed', base: 'FROM logs-*', breach: { segment: '' } },
        },
      });
      expect(screen.getByTestId('composeDiscoverSubmit')).toBeDisabled();
    });
  });
});
