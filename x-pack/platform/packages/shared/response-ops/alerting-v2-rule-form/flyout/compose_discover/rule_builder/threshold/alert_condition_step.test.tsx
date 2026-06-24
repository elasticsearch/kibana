/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { QueryClientProvider } from '@kbn/react-query';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { createTestQueryClient, createMockServices } from '../../../../test_utils';
import { RuleFormProvider } from '../../../../form/contexts';
import { BuilderStateProvider } from '../builder_state_context';
import { RuleBuilderAlertConditionStep } from './alert_condition_step';
import {
  Aggregation,
  Comparator,
  DEFAULT_THRESHOLD_FORM_VALUES,
  type ThresholdFormValues,
} from './form_types';
import type { ComposeFormValues } from '../../compose_form_types';
import type { ComposeDiscoverState } from '../../types';
import { createInitialState } from '../../use_compose_discover_state';

jest.mock('../../../../form/hooks/use_index_sources', () => ({
  useIndexSources: jest.fn(() => ({
    data: [{ label: 'logs-*' }],
    isLoading: false,
  })),
}));

jest.mock('../../../../form/hooks/use_data_fields', () => ({
  useDataFields: jest.fn(() => ({
    data: {
      '@timestamp': { name: '@timestamp', type: 'date' },
      'service.name': { name: 'service.name', type: 'keyword' },
    },
  })),
}));

const makeBuilderState = (overrides: Partial<ThresholdFormValues> = {}): ThresholdFormValues => ({
  ...DEFAULT_THRESHOLD_FORM_VALUES,
  indexPattern: 'logs-*',
  stats: [{ id: 'stat-1', label: 'count', aggregation: Aggregation.COUNT }],
  alertConditions: [{ id: 'cond-1', metric: 'count', comparator: Comparator.GT, threshold: [100] }],
  ...overrides,
});

const BASE_COMPOSE_VALUES: ComposeFormValues = {
  kind: 'alert',
  metadata: { name: 'Test rule', enabled: true },
  timeField: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: { format: 'composed', base: 'FROM logs-*', breach: { segment: 'WHERE count > 100' } },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
  artifacts: [],
  runbookArtifacts: [],
  dashboardArtifacts: [],
};

const createState = (overrides: Partial<ComposeDiscoverState> = {}): ComposeDiscoverState => ({
  ...createInitialState({ mode: 'create' }),
  queryCommitted: true,
  ...overrides,
});

const Wrapper: React.FC<{
  builderState: ThresholdFormValues;
  onBuilderStateChange: (s: ThresholdFormValues) => void;
  children: React.ReactNode;
}> = ({ builderState, onBuilderStateChange, children }) => {
  const form = useForm<ComposeFormValues>({ defaultValues: BASE_COMPOSE_VALUES });
  const queryClient = createTestQueryClient();
  const services = createMockServices();

  return (
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <FormProvider {...form}>
          <RuleFormProvider services={services} meta={{ layout: 'flyout' }}>
            <BuilderStateProvider
              builderState={builderState}
              setBuilderState={onBuilderStateChange as (s: unknown) => void}
            >
              {children}
            </BuilderStateProvider>
          </RuleFormProvider>
        </FormProvider>
      </QueryClientProvider>
    </IntlProvider>
  );
};

describe('RuleBuilderAlertConditionStep', () => {
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps alert condition metric when removing a duplicate-label stat', () => {
    let builderState = makeBuilderState();
    const onBuilderStateChange = jest.fn((next: ThresholdFormValues) => {
      builderState = next;
    });

    const { rerender } = render(
      <Wrapper builderState={builderState} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByTestId('ruleBuilderAddStat'));
    expect(onBuilderStateChange).toHaveBeenCalled();
    const afterAdd = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterAdd.stats).toHaveLength(2);
    expect(afterAdd.stats[1].label).toBe('count_2');

    rerender(
      <Wrapper builderState={afterAdd} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByTestId('ruleBuilderRemoveStat-1'));
    const afterRemove = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterRemove.stats).toHaveLength(1);
    expect(afterRemove.alertConditions[0].metric).toBe('count');
  });

  it('keeps alert condition metric when renaming a duplicate-label stat before removal', () => {
    let builderState = makeBuilderState({
      stats: [
        { id: 'stat-1', label: 'count', aggregation: Aggregation.COUNT },
        { id: 'stat-2', label: 'count', aggregation: Aggregation.COUNT },
      ],
    });
    const onBuilderStateChange = jest.fn((next: ThresholdFormValues) => {
      builderState = next;
    });

    const { rerender } = render(
      <Wrapper builderState={builderState} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.change(screen.getByTestId('ruleBuilderStatLabel-1'), {
      target: { value: 'errors' },
    });
    const afterRename = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterRename.alertConditions[0].metric).toBe('count');

    rerender(
      <Wrapper builderState={afterRename} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByTestId('ruleBuilderRemoveStat-1'));
    const afterRemove = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterRemove.stats).toHaveLength(1);
    expect(afterRemove.alertConditions[0].metric).toBe('count');
  });

  it('reassigns alert condition metric when the referenced stat is removed', () => {
    let builderState = makeBuilderState({
      stats: [
        { id: 'stat-1', label: 'count', aggregation: Aggregation.COUNT },
        { id: 'stat-2', label: 'errors', aggregation: Aggregation.COUNT },
      ],
      alertConditions: [
        { id: 'cond-1', metric: 'errors', comparator: Comparator.GT, threshold: [100] },
      ],
    });
    const onBuilderStateChange = jest.fn((next: ThresholdFormValues) => {
      builderState = next;
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByTestId('ruleBuilderRemoveStat-1'));
    const afterRemove = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterRemove.stats).toHaveLength(1);
    expect(afterRemove.alertConditions[0].metric).toBe('count');
  });

  it('shows required validation when a stat label is empty', () => {
    const builderState = makeBuilderState({
      stats: [{ id: 'stat-1', label: '', aggregation: Aggregation.COUNT }],
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByText('Label is required.')).toBeInTheDocument();
  });

  it('shows required validation when a stat field is missing', () => {
    const builderState = makeBuilderState({
      stats: [{ id: 'stat-1', label: 'avg_val', aggregation: Aggregation.AVG }],
    });

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByText('Field is required.')).toBeInTheDocument();
  });
});
