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
import type { FormValues } from '../../../../form/types';
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

const BASE_COMPOSE_VALUES: FormValues = {
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
  const form = useForm<FormValues>({ defaultValues: BASE_COMPOSE_VALUES });
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

  it('adds a second stat and shows remove buttons for both', () => {
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

    expect(screen.getByTestId('ruleBuilderStatAgg-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ruleBuilderStatAgg-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ruleBuilderRemoveStat-0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ruleBuilderAddStat'));
    const afterAdd = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterAdd.stats).toHaveLength(2);

    rerender(
      <Wrapper builderState={afterAdd} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('ruleBuilderStatAgg-1')).toBeInTheDocument();
    expect(screen.getByTestId('ruleBuilderRemoveStat-0')).toBeInTheDocument();
    expect(screen.getByTestId('ruleBuilderRemoveStat-1')).toBeInTheDocument();
  });

  it('adds and removes alert conditions with operator toggle', () => {
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

    expect(screen.getByTestId('ruleBuilderConditionMetric-0')).toBeInTheDocument();
    expect(screen.queryByTestId('ruleBuilderConditionMetric-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ruleBuilderConditionOperator')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ruleBuilderAddCondition'));
    const afterAdd = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterAdd.alertConditions).toHaveLength(2);

    rerender(
      <Wrapper builderState={afterAdd} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('ruleBuilderConditionMetric-1')).toBeInTheDocument();
    expect(screen.getByTestId('ruleBuilderConditionOperator')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ruleBuilderRemoveCondition-1'));
    const afterRemove = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterRemove.alertConditions).toHaveLength(1);

    rerender(
      <Wrapper builderState={afterRemove} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.queryByTestId('ruleBuilderConditionOperator')).not.toBeInTheDocument();
  });

  it('adds and removes evaluations and reflects label in condition metric dropdown', () => {
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

    expect(screen.queryByTestId('ruleBuilderEvalLabel-0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ruleBuilderAddEvaluation'));
    const afterAdd = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterAdd.evaluations).toHaveLength(1);

    rerender(
      <Wrapper builderState={afterAdd} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('ruleBuilderEvalLabel-0')).toBeInTheDocument();
    expect(screen.getByTestId('ruleBuilderEvalExpression-0')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('ruleBuilderEvalLabel-0'), {
      target: { value: 'error_rate' },
    });
    const afterLabel = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;

    rerender(
      <Wrapper builderState={afterLabel} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    const metricSelect = screen.getByTestId('ruleBuilderConditionMetric-0');
    const options = Array.from(metricSelect.querySelectorAll('option'));
    expect(options.some((o) => o.textContent === 'error_rate')).toBe(true);

    fireEvent.click(screen.getByTestId('ruleBuilderRemoveEval-0'));
    const afterRemove = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(afterRemove.evaluations).toHaveLength(0);
  });

  it('sets and displays filter input value', () => {
    const onBuilderStateChange = jest.fn();
    const builderState = makeBuilderState();

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    const filterInput = screen.getByTestId('ruleBuilderFilter');
    fireEvent.change(filterInput, { target: { value: 'host.name == "api"' } });

    expect(onBuilderStateChange).toHaveBeenCalled();
    const call = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    expect(call.filterQuery).toBe('host.name == "api"');
  });

  it('shows stat field combo box when aggregation requires a field', () => {
    const builderState = makeBuilderState({
      stats: [
        { id: 'stat-1', label: 'avg_latency', aggregation: Aggregation.AVG, field: undefined },
      ],
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

    expect(screen.getByTestId('ruleBuilderStatField-0')).toBeInTheDocument();
  });

  it('hides stat field combo box for COUNT aggregation', () => {
    const builderState = makeBuilderState();

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.queryByTestId('ruleBuilderStatField-0')).not.toBeInTheDocument();
  });

  it('shows second threshold input for between comparator and hides it for single comparator', () => {
    const builderState = makeBuilderState({
      alertConditions: [
        { id: 'cond-1', metric: 'count', comparator: Comparator.BETWEEN, threshold: [10, 50] },
      ],
    });

    const { rerender } = render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('ruleBuilderConditionThresholdTo-0')).toBeInTheDocument();

    const singleComparator = makeBuilderState({
      alertConditions: [
        { id: 'cond-1', metric: 'count', comparator: Comparator.GT, threshold: [100] },
      ],
    });

    rerender(
      <Wrapper builderState={singleComparator} onBuilderStateChange={jest.fn()}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.queryByTestId('ruleBuilderConditionThresholdTo-0')).not.toBeInTheDocument();
  });

  it('disables preview button when childOpen is true', () => {
    const builderState = makeBuilderState();

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <RuleBuilderAlertConditionStep
          state={createState({ childOpen: true })}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('ruleBuilderOpenPreview')).toBeDisabled();
  });

  it('enables preview button when childOpen is false', () => {
    const builderState = makeBuilderState();

    render(
      <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
        <RuleBuilderAlertConditionStep
          state={createState({ childOpen: false })}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('ruleBuilderOpenPreview')).not.toBeDisabled();
  });

  describe('recovery condition sync', () => {
    const makeStateWithRecovery = (overrides: Partial<ThresholdFormValues> = {}) =>
      makeBuilderState({
        recovery: {
          conditionOperator: 'AND',
          conditions: [
            { id: 'rec-1', metric: 'count', comparator: Comparator.LT, threshold: [100] },
          ],
        },
        ...overrides,
      });

    it('updates recovery condition metric when a stat is renamed', () => {
      let builderState = makeStateWithRecovery();
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

      fireEvent.change(screen.getByTestId('ruleBuilderStatLabel-0'), {
        target: { value: 'error_count' },
      });

      const after = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(after.alertConditions[0].metric).toBe('error_count');
      expect(after.recovery?.conditions[0].metric).toBe('error_count');
    });

    it('reconciles recovery condition metric when a stat is removed', () => {
      let builderState = makeStateWithRecovery({
        stats: [
          { id: 'stat-1', label: 'count', aggregation: Aggregation.COUNT },
          { id: 'stat-2', label: 'errors', aggregation: Aggregation.COUNT },
        ],
        alertConditions: [
          { id: 'cond-1', metric: 'errors', comparator: Comparator.GT, threshold: [100] },
        ],
        recovery: {
          conditionOperator: 'AND',
          conditions: [
            { id: 'rec-1', metric: 'errors', comparator: Comparator.LT, threshold: [100] },
          ],
        },
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

      const after = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(after.stats).toHaveLength(1);
      expect(after.alertConditions[0].metric).toBe('count');
      expect(after.recovery?.conditions[0].metric).toBe('count');
    });

    it('updates recovery condition metric when an evaluation is renamed', () => {
      let builderState = makeBuilderState({
        evaluations: [{ id: 'eval-1', label: 'rate', expression: 'errors / count' }],
        alertConditions: [
          { id: 'cond-1', metric: 'rate', comparator: Comparator.GT, threshold: [1] },
        ],
        recovery: {
          conditionOperator: 'AND',
          conditions: [{ id: 'rec-1', metric: 'rate', comparator: Comparator.LT, threshold: [1] }],
        },
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

      fireEvent.change(screen.getByTestId('ruleBuilderEvalLabel-0'), {
        target: { value: 'error_rate' },
      });

      const after = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(after.alertConditions[0].metric).toBe('error_rate');
      expect(after.recovery?.conditions[0].metric).toBe('error_rate');
    });

    it('reconciles recovery condition metric when an evaluation is removed', () => {
      let builderState = makeBuilderState({
        evaluations: [{ id: 'eval-1', label: 'rate', expression: 'errors / count' }],
        alertConditions: [
          { id: 'cond-1', metric: 'rate', comparator: Comparator.GT, threshold: [1] },
        ],
        recovery: {
          conditionOperator: 'AND',
          conditions: [{ id: 'rec-1', metric: 'rate', comparator: Comparator.LT, threshold: [1] }],
        },
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

      fireEvent.click(screen.getByTestId('ruleBuilderRemoveEval-0'));

      const after = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(after.evaluations).toHaveLength(0);
      expect(after.alertConditions[0].metric).toBe('count');
      expect(after.recovery?.conditions[0].metric).toBe('count');
    });
  });
});
