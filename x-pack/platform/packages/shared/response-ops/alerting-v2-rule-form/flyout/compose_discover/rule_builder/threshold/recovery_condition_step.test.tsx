/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { BuilderRecoveryForm } from './recovery_condition_step';
import { BuilderStateProvider } from '../builder_state_context';
import type { ThresholdFormValues } from './form_types';
import { Comparator, DEFAULT_THRESHOLD_FORM_VALUES } from './form_types';
import type { FormValues } from '../../../../form/types';
import type { ComposeDiscoverState } from '../../types';
import { createInitialState } from '../../use_compose_discover_state';

const makeBuilderState = (overrides: Partial<ThresholdFormValues> = {}): ThresholdFormValues => ({
  ...DEFAULT_THRESHOLD_FORM_VALUES,
  ...overrides,
});

const BASE_COMPOSE_VALUES: FormValues = {
  kind: 'alert',
  metadata: { name: 'Test rule', enabled: true },
  timeField: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: { format: 'composed', base: '', breach: { segment: '' } },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
  artifacts: [],
  runbookArtifacts: [],
  dashboardArtifacts: [],
};

const createState = (overrides: Partial<ComposeDiscoverState> = {}): ComposeDiscoverState => ({
  ...createInitialState({ mode: 'create' }),
  ...overrides,
});

const Wrapper: React.FC<{
  builderState: ThresholdFormValues;
  onBuilderStateChange: (s: ThresholdFormValues) => void;
  children: React.ReactNode;
}> = ({ builderState, onBuilderStateChange, children }) => {
  const form = useForm<FormValues>({ defaultValues: BASE_COMPOSE_VALUES });

  return (
    <IntlProvider locale="en">
      <FormProvider {...form}>
        <BuilderStateProvider
          builderState={builderState}
          setBuilderState={onBuilderStateChange as (s: unknown) => void}
        >
          {children}
        </BuilderStateProvider>
      </FormProvider>
    </IntlProvider>
  );
};

describe('BuilderRecoveryForm', () => {
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when recovery config is not set and no valid alert conditions exist', () => {
    const setBuilderState = jest.fn();
    const builderState = makeBuilderState({
      alertConditions: [{ id: '1', metric: '', comparator: Comparator.GT, threshold: [] }],
      recovery: undefined,
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={setBuilderState}>
        <BuilderRecoveryForm state={createState()} dispatch={dispatch} />
      </Wrapper>
    );

    expect(setBuilderState).toHaveBeenCalled();
    const call = setBuilderState.mock.calls[0][0] as ThresholdFormValues;
    expect(call.recovery).toBeDefined();
    expect(call.recovery!.conditions.length).toBe(1);
  });

  it('renders recovery conditions with title and add button', () => {
    const builderState = makeBuilderState({
      recovery: {
        conditions: [{ id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] }],
        conditionOperator: 'AND',
      },
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <BuilderRecoveryForm state={createState()} dispatch={dispatch} />
      </Wrapper>
    );

    expect(screen.getByText('Recovery threshold conditions')).toBeTruthy();
    expect(screen.getByTestId('ruleBuilderRecoveryMetric-0')).toBeTruthy();
    expect(screen.getByTestId('ruleBuilderRecoveryComparator-0')).toBeTruthy();
    expect(screen.getByTestId('ruleBuilderRecoveryThreshold-0')).toBeTruthy();
    expect(screen.getByTestId('ruleBuilderAddRecoveryCondition')).toBeTruthy();
  });

  it('shows operator toggle when multiple conditions exist', () => {
    const builderState = makeBuilderState({
      recovery: {
        conditions: [
          { id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] },
          { id: '2', metric: 'errors', comparator: Comparator.LT, threshold: [5] },
        ],
        conditionOperator: 'AND',
      },
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <BuilderRecoveryForm state={createState()} dispatch={dispatch} />
      </Wrapper>
    );

    expect(screen.getByTestId('ruleBuilderRecoveryConditionOperator')).toBeTruthy();
    expect(screen.getByTestId('ruleBuilderRecoveryMetric-0')).toBeTruthy();
    expect(screen.getByTestId('ruleBuilderRecoveryMetric-1')).toBeTruthy();
  });

  it('does not show operator toggle for a single condition', () => {
    const builderState = makeBuilderState({
      recovery: {
        conditions: [{ id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] }],
        conditionOperator: 'AND',
      },
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <BuilderRecoveryForm state={createState()} dispatch={dispatch} />
      </Wrapper>
    );

    expect(screen.queryByTestId('ruleBuilderRecoveryConditionOperator')).toBeNull();
  });

  it('calls setBuilderState when add condition button is clicked', () => {
    const setBuilderState = jest.fn();
    const builderState = makeBuilderState({
      recovery: {
        conditions: [{ id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] }],
        conditionOperator: 'AND',
      },
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={setBuilderState}>
        <BuilderRecoveryForm state={createState()} dispatch={dispatch} />
      </Wrapper>
    );

    fireEvent.click(screen.getByTestId('ruleBuilderAddRecoveryCondition'));

    expect(setBuilderState).toHaveBeenCalled();
    const lastCall = setBuilderState.mock.calls[setBuilderState.mock.calls.length - 1][0];
    expect(lastCall.recovery.conditions.length).toBe(2);
  });

  it('calls setBuilderState when remove condition button is clicked', () => {
    const setBuilderState = jest.fn();
    const builderState = makeBuilderState({
      recovery: {
        conditions: [
          { id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] },
          { id: '2', metric: 'errors', comparator: Comparator.LT, threshold: [5] },
        ],
        conditionOperator: 'AND',
      },
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={setBuilderState}>
        <BuilderRecoveryForm state={createState()} dispatch={dispatch} />
      </Wrapper>
    );

    fireEvent.click(screen.getByTestId('ruleBuilderRemoveRecoveryCondition-0'));

    expect(setBuilderState).toHaveBeenCalled();
    const lastCall = setBuilderState.mock.calls[setBuilderState.mock.calls.length - 1][0];
    expect(lastCall.recovery.conditions.length).toBe(1);
  });

  it('derives recovery conditions from alert conditions on init', () => {
    const setBuilderState = jest.fn();
    const builderState = makeBuilderState({
      alertConditions: [{ id: '1', metric: 'count', comparator: Comparator.GT, threshold: [100] }],
      recovery: undefined,
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={setBuilderState}>
        <BuilderRecoveryForm state={createState()} dispatch={dispatch} />
      </Wrapper>
    );

    expect(setBuilderState).toHaveBeenCalled();
    const call = setBuilderState.mock.calls[0][0] as ThresholdFormValues;
    expect(call.recovery!.conditions[0].metric).toBe('count');
    expect(call.recovery!.conditions[0].comparator).toBe(Comparator.LTE);
    expect(call.recovery!.conditions[0].threshold).toEqual([100]);
  });

  it('disables preview button when childOpen is true', () => {
    const builderState = makeBuilderState({
      recovery: {
        conditions: [{ id: '1', metric: 'count', comparator: Comparator.LTE, threshold: [100] }],
        conditionOperator: 'AND',
      },
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <BuilderRecoveryForm state={createState({ childOpen: true })} dispatch={dispatch} />
      </Wrapper>
    );

    const previewBtn = screen.getByTestId('ruleBuilderRecoveryPreview');
    expect(previewBtn).toBeDisabled();
  });
});
