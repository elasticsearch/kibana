/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { QueryClientProvider } from '@kbn/react-query';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { getDatasets } from '@kbn/esql-utils';
import { createTestQueryClient, createMockServices } from '../../../../test_utils';
import { useDataFields } from '../../../../form/hooks/use_data_fields';
import { useIndexSources } from '../../../../form/hooks/use_index_sources';
import { useResolveTimeField } from '../../use_resolve_time_field';
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
    isError: false,
    isLoading: false,
  })),
}));

jest.mock('@kbn/esql-utils', () => ({
  getDatasets: jest.fn(() => Promise.resolve({ datasets: [] })),
  getESQLTimeFieldFromQuery: jest.fn(() => Promise.resolve(undefined)),
}));

jest.mock('../../use_resolve_time_field', () => ({
  useResolveTimeField: jest.fn(() => ({
    timeFieldOptions: [{ value: '@timestamp', text: '@timestamp' }],
    isTimeFieldResolved: true,
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

  it('updates evaluation expression suggestions when a stat is renamed, added, or removed', async () => {
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

    fireEvent.click(screen.getByTestId('ruleBuilderAddEvaluation'));
    const afterAddEval = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    rerender(
      <Wrapper builderState={afterAddEval} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.focus(screen.getByTestId('ruleBuilderEvalExpression-0'));
    expect(
      await screen.findByTestId('ruleBuilderEvalExpressionSuggestion-0-option-count')
    ).toBeInTheDocument();

    // Renaming the stat should replace it in the suggestions.
    fireEvent.change(screen.getByTestId('ruleBuilderStatLabel-0'), {
      target: { value: 'errors' },
    });
    const afterRename = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    rerender(
      <Wrapper builderState={afterRename} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.focus(screen.getByTestId('ruleBuilderEvalExpression-0'));
    expect(
      await screen.findByTestId('ruleBuilderEvalExpressionSuggestion-0-option-errors')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('ruleBuilderEvalExpressionSuggestion-0-option-count')
    ).not.toBeInTheDocument();

    // Adding a stat should add it to the suggestions.
    fireEvent.click(screen.getByTestId('ruleBuilderAddStat'));
    const afterAddStat = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    rerender(
      <Wrapper builderState={afterAddStat} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    // The new stat gets the default label "count" (the only one still unused after the rename).
    fireEvent.focus(screen.getByTestId('ruleBuilderEvalExpression-0'));
    expect(
      await screen.findByTestId('ruleBuilderEvalExpressionSuggestion-0-option-errors')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('ruleBuilderEvalExpressionSuggestion-0-option-count')
    ).toBeInTheDocument();

    // Removing the newly-added stat should drop it from the suggestions again.
    fireEvent.click(screen.getByTestId('ruleBuilderRemoveStat-1'));
    const afterRemoveStat = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
    rerender(
      <Wrapper builderState={afterRemoveStat} onBuilderStateChange={onBuilderStateChange}>
        <RuleBuilderAlertConditionStep
          state={createState()}
          dispatch={dispatch}
          services={createMockServices()}
        />
      </Wrapper>
    );

    fireEvent.focus(screen.getByTestId('ruleBuilderEvalExpression-0'));
    expect(
      await screen.findByTestId('ruleBuilderEvalExpressionSuggestion-0-option-errors')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('ruleBuilderEvalExpressionSuggestion-0-option-count')
    ).not.toBeInTheDocument();
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

  describe('hook wiring', () => {
    beforeEach(() => {
      (useDataFields as jest.Mock).mockReturnValue({
        data: {
          '@timestamp': { name: '@timestamp', type: 'date' },
          'service.name': { name: 'service.name', type: 'keyword' },
        },
        isError: false,
        isLoading: false,
      });
      (useResolveTimeField as jest.Mock).mockReturnValue({
        timeFieldOptions: [{ value: '@timestamp', text: '@timestamp' }],
        isTimeFieldResolved: true,
      });
    });

    it('passes services.data.search.search to useDataFields', () => {
      const services = createMockServices();
      const builderState = makeBuilderState();

      render(
        <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
          <RuleBuilderAlertConditionStep
            state={createState()}
            dispatch={dispatch}
            services={services}
          />
        </Wrapper>
      );

      expect(useDataFields).toHaveBeenCalledWith(
        expect.objectContaining({ search: services.data.search.search })
      );
    });

    it('passes a getDatasets callback using services.http to useIndexSources', () => {
      const services = createMockServices();
      const builderState = makeBuilderState();

      render(
        <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
          <RuleBuilderAlertConditionStep
            state={createState()}
            dispatch={dispatch}
            services={services}
          />
        </Wrapper>
      );

      const { getDatasets: passedGetDatasets } = (useIndexSources as jest.Mock).mock.calls.at(
        -1
      )?.[0] as { getDatasets: () => Promise<unknown> };
      expect(typeof passedGetDatasets).toBe('function');

      passedGetDatasets();
      expect(getDatasets).toHaveBeenCalledWith(services.http);
    });

    it('shows a warning callout when field discovery fails', () => {
      (useDataFields as jest.Mock).mockReturnValue({
        data: {},
        isError: true,
        isLoading: false,
      });

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

      expect(screen.getByText('Could not load fields for this data source')).toBeInTheDocument();
    });

    it('does not show the warning callout when field discovery succeeds', () => {
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

      expect(
        screen.queryByText('Could not load fields for this data source')
      ).not.toBeInTheDocument();
    });

    it('does not auto-correct timeField while field map is loading', async () => {
      (useDataFields as jest.Mock).mockReturnValue({
        data: {},
        isError: false,
        isLoading: true,
      });

      const onBuilderStateChange = jest.fn();
      const builderState = makeBuilderState({ timeField: 'event.start' });

      render(
        <Wrapper builderState={builderState} onBuilderStateChange={onBuilderStateChange}>
          <RuleBuilderAlertConditionStep
            state={createState()}
            dispatch={dispatch}
            services={createMockServices()}
          />
        </Wrapper>
      );

      await act(async () => {});

      const timeFieldChangeCalls = onBuilderStateChange.mock.calls.filter(
        (args) => args[0]?.timeField !== undefined && args[0]?.timeField !== 'event.start'
      );
      expect(timeFieldChangeCalls).toHaveLength(0);
    });

    it('wires useResolveTimeField with the FROM query, current timeField, and search service', () => {
      const services = createMockServices();
      const builderState = makeBuilderState({ indexPattern: 'logs-*', timeField: '@timestamp' });

      render(
        <Wrapper builderState={builderState} onBuilderStateChange={jest.fn()}>
          <RuleBuilderAlertConditionStep
            state={createState()}
            dispatch={dispatch}
            services={services}
          />
        </Wrapper>
      );

      expect(useResolveTimeField).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'FROM logs-*',
          timeField: '@timestamp',
          search: services.data.search.search,
          http: services.http,
          dataViews: services.dataViews,
        })
      );
    });

    it('renders time-field options from useResolveTimeField', () => {
      (useResolveTimeField as jest.Mock).mockReturnValue({
        timeFieldOptions: [
          { value: 'event_time', text: 'event_time' },
          { value: '@timestamp', text: '@timestamp' },
        ],
        isTimeFieldResolved: true,
      });

      const builderState = makeBuilderState({
        indexPattern: 'federation.orders',
        timeField: 'event_time',
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

      const select = screen.getByTestId('ruleBuilderTimeField') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(['event_time', '@timestamp']);
    });
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

  describe('evaluation expression reference warning', () => {
    it('shows a warning when the expression references an unknown label', () => {
      const builderState = makeBuilderState({
        evaluations: [{ id: 'eval-1', label: 'rate', expression: 'errors / total * 100' }],
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

      expect(screen.getByText('References unknown labels: errors, total')).toBeInTheDocument();
    });

    it('does not show a warning when the expression only references known labels', () => {
      const builderState = makeBuilderState({
        stats: [
          { id: 'stat-1', label: 'count', aggregation: Aggregation.COUNT },
          { id: 'stat-2', label: 'errors', aggregation: Aggregation.COUNT },
        ],
        evaluations: [{ id: 'eval-1', label: 'rate', expression: 'errors / count * 100' }],
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

      expect(screen.queryByText(/References unknown/)).not.toBeInTheDocument();
    });

    it('clears the warning once a renamed stat matches the referenced label', () => {
      let builderState = makeBuilderState({
        evaluations: [{ id: 'eval-1', label: 'rate', expression: 'renamed_count' }],
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

      expect(screen.getByText('References unknown label: renamed_count')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('ruleBuilderStatLabel-0'), {
        target: { value: 'renamed_count' },
      });
      const afterRename = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;

      rerender(
        <Wrapper builderState={afterRename} onBuilderStateChange={onBuilderStateChange}>
          <RuleBuilderAlertConditionStep
            state={createState()}
            dispatch={dispatch}
            services={createMockServices()}
          />
        </Wrapper>
      );

      expect(screen.queryByText(/References unknown/)).not.toBeInTheDocument();
    });

    it('debounces the warning while the user is still typing the expression', () => {
      jest.useFakeTimers();
      try {
        let builderState = makeBuilderState({
          evaluations: [{ id: 'eval-1', label: 'rate', expression: 'count' }],
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

        fireEvent.change(screen.getByTestId('ruleBuilderEvalExpression-0'), {
          target: { value: 'unknown_field' },
        });
        const afterTyping = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;

        rerender(
          <Wrapper builderState={afterTyping} onBuilderStateChange={onBuilderStateChange}>
            <RuleBuilderAlertConditionStep
              state={createState()}
              dispatch={dispatch}
              services={createMockServices()}
            />
          </Wrapper>
        );

        expect(screen.queryByText(/References unknown/)).not.toBeInTheDocument();

        act(() => {
          jest.advanceTimersByTime(500);
        });

        expect(screen.getByText('References unknown label: unknown_field')).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('severity', () => {
    it('enables single severity from the step UI', () => {
      const onBuilderStateChange = jest.fn();
      render(
        <Wrapper builderState={makeBuilderState()} onBuilderStateChange={onBuilderStateChange}>
          <RuleBuilderAlertConditionStep
            state={createState()}
            dispatch={dispatch}
            services={createMockServices()}
          />
        </Wrapper>
      );

      fireEvent.click(screen.getByTestId('ruleBuilderSeverityEnable'));
      const next = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(next.severity).toEqual({ mode: 'single', singleLevelSeverity: 'high', levels: [] });
    });

    it('mirrors the condition threshold onto the lowest multi-severity level', () => {
      const onBuilderStateChange = jest.fn();
      const builderState = makeBuilderState({
        severity: {
          mode: 'multi',
          singleLevelSeverity: 'high',
          levels: [
            { id: 'l1', severity: 'low', threshold: 100 },
            { id: 'l2', severity: 'high', threshold: 200 },
          ],
        },
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

      fireEvent.change(screen.getByTestId('ruleBuilderConditionThreshold-0'), {
        target: { value: '150' },
      });
      const next = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(next.alertConditions[0].threshold).toEqual([150]);
      expect(next.severity?.levels[0].threshold).toBe(150);
      expect(next.severity?.levels[1].threshold).toBe(200);
    });

    it('mirrors the lowest multi-severity level onto the condition threshold', () => {
      const onBuilderStateChange = jest.fn();
      const builderState = makeBuilderState({
        severity: {
          mode: 'multi',
          singleLevelSeverity: 'high',
          levels: [
            { id: 'l1', severity: 'low', threshold: 100 },
            { id: 'l2', severity: 'high', threshold: 200 },
          ],
        },
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

      fireEvent.change(screen.getByTestId('ruleBuilderSeverityThreshold-0'), {
        target: { value: '120' },
      });
      const next = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(next.severity?.levels[0].threshold).toBe(120);
      expect(next.alertConditions[0].threshold).toEqual([120]);
    });

    it('re-normalizes level order when a row is set to an out-of-order severity', () => {
      const onBuilderStateChange = jest.fn();
      const builderState = makeBuilderState({
        severity: {
          mode: 'multi',
          singleLevelSeverity: 'high',
          levels: [
            { id: 'l1', severity: 'low', threshold: 5 },
            { id: 'l2', severity: 'medium', threshold: 10 },
          ],
        },
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

      // Change row 0 (low) to critical — the stored array is kept least-to-most severe,
      // so critical moves to the end and levels[0] stays the least-severe fallback.
      fireEvent.change(screen.getByTestId('ruleBuilderSeverityLevel-0'), {
        target: { value: 'critical' },
      });
      const next = onBuilderStateChange.mock.calls.at(-1)?.[0] as ThresholdFormValues;
      expect(next.severity?.levels.map((l) => l.severity)).toEqual(['medium', 'critical']);
    });
  });
});
