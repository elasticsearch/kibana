/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { QuerySandbox } from './query_sandbox';
import type { QuerySandboxProps } from './query_sandbox';
import type { QueryExecutionResult } from './use_query_execution';

const mockRun = jest.fn();

const defaultExecutionResult: QueryExecutionResult = {
  columns: [],
  rows: [],
  totalRowCount: 0,
  isLoading: false,
  isError: false,
  error: null,
  run: mockRun,
  hasRun: false,
  lastExecutedQuery: null,
};

let mockExecutionResult = { ...defaultExecutionResult };

jest.mock('./use_query_execution', () => ({
  useQueryExecution: () => mockExecutionResult,
}));

jest.mock('@kbn/esql-utils', () => ({
  ...jest.requireActual('@kbn/esql-utils'),
  getESQLTimeFieldFromQuery: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../form/hooks/use_data_fields', () => ({
  useDataFields: () => ({ data: {}, isLoading: false }),
}));

jest.mock('../../form/contexts/rule_form_context', () => ({
  useRuleFormServices: () => ({
    http: {},
    data: { search: { search: jest.fn() } },
    dataViews: {},
    lens: { EmbeddableComponent: () => null, stateHelperApi: jest.fn() },
  }),
}));

jest.mock('./compose_discover_chart', () => ({
  ComposeDiscoverChart: () => <div data-test-subj="mockComposeDiscoverChart" />,
}));

jest.mock('./compose_discover_tabs', () => {
  const actual = jest.requireActual('./compose_discover_tabs');
  return {
    ...actual,
    ComposeDiscoverTabs: () => <div data-test-subj="mockComposeDiscoverTabs" />,
  };
});

jest.mock('@kbn/code-editor', () => ({
  CodeEditor: ({ value }: { value: string }) => <pre data-test-subj="mockCodeEditor">{value}</pre>,
  ESQL_LANG_ID: 'esql',
}));

const defaultProps: QuerySandboxProps = {
  query: 'FROM logs-* | STATS count() BY host.name',
  timeField: '@timestamp',
  dateRange: { dateStart: 'now-15m', dateEnd: 'now' },
  onDateRangeChange: jest.fn(),
};

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderSandbox = (overrides: Partial<QuerySandboxProps> = {}) =>
  render(
    <QueryClientProvider client={testQueryClient}>
      <I18nProvider>
        <QuerySandbox {...defaultProps} {...overrides} />
      </I18nProvider>
    </QueryClientProvider>
  );

describe('QuerySandbox', () => {
  beforeEach(() => {
    mockRun.mockClear();
    mockExecutionResult = { ...defaultExecutionResult };
    jest.clearAllMocks();
  });

  it('renders the sandbox container', () => {
    renderSandbox();
    expect(screen.getByTestId('querySandbox')).toBeInTheDocument();
  });

  it('renders the search button', () => {
    renderSandbox();
    expect(screen.getByTestId('querySandboxRunQuery')).toBeInTheDocument();
  });

  it('renders the time field selector', () => {
    renderSandbox();
    expect(screen.getByTestId('querySandboxTimeField')).toBeInTheDocument();
  });

  it('renders the single code editor when tabProps is absent', () => {
    renderSandbox();
    expect(screen.getByTestId('mockCodeEditor')).toBeInTheDocument();
    expect(screen.getByTestId('mockCodeEditor')).toHaveTextContent(
      'FROM logs-* | STATS count() BY host.name'
    );
    expect(screen.queryByTestId('mockComposeDiscoverTabs')).not.toBeInTheDocument();
  });

  it('renders ComposeDiscoverTabs when tabProps is provided', () => {
    renderSandbox({
      tabProps: {
        tabs: ['base', 'alert'],
        activeTab: 'alert',
        onTabChange: jest.fn(),
        baseQuery: 'FROM logs-*',
        alertBlock: '| WHERE count > 100',
        recoveryBlock: '',
        onBaseQueryChange: jest.fn(),
        onAlertBlockChange: jest.fn(),
        onRecoveryBlockChange: jest.fn(),
      },
    });
    expect(screen.getByTestId('mockComposeDiscoverTabs')).toBeInTheDocument();
    expect(screen.queryByTestId('mockCodeEditor')).not.toBeInTheDocument();
  });

  it('renders tab bar when tabProps is provided', () => {
    renderSandbox({
      tabProps: {
        tabs: ['base', 'alert'],
        activeTab: 'alert',
        onTabChange: jest.fn(),
        baseQuery: 'FROM logs-*',
        alertBlock: '| WHERE count > 100',
        recoveryBlock: '',
        onBaseQueryChange: jest.fn(),
        onAlertBlockChange: jest.fn(),
        onRecoveryBlockChange: jest.fn(),
      },
    });
    expect(screen.getByTestId('querySandboxTab-base')).toBeInTheDocument();
    expect(screen.getByTestId('querySandboxTab-alert')).toBeInTheDocument();
  });

  it('shows "Run your query" prompt when hasRun is false', () => {
    renderSandbox();
    expect(screen.getByText('Run your query to see results')).toBeInTheDocument();
  });

  it('calls run on mount when autoRun is true', async () => {
    renderSandbox({ autoRun: true });
    await waitFor(() => {
      expect(mockRun).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call run on mount when autoRun is false', () => {
    renderSandbox({ autoRun: false });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('shows loading spinner when loading after a run', () => {
    mockExecutionResult = { ...defaultExecutionResult, hasRun: true, isLoading: true };
    renderSandbox();
    const spinners = screen.getAllByRole('progressbar');
    expect(spinners.length).toBeGreaterThanOrEqual(2);
  });

  it('shows error callout when query errors', () => {
    mockExecutionResult = {
      ...defaultExecutionResult,
      hasRun: true,
      isError: true,
      error: 'Something went wrong',
    };
    renderSandbox();
    expect(screen.getByText('Query error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows "No results" when query returns empty rows', () => {
    mockExecutionResult = { ...defaultExecutionResult, hasRun: true, rows: [] };
    renderSandbox();
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('renders chart and grid when results are present', () => {
    mockExecutionResult = {
      ...defaultExecutionResult,
      hasRun: true,
      columns: [{ id: 'host.name', displayAsText: 'host.name', esType: 'keyword' }],
      rows: [{ 'host.name': 'server-01' }],
      totalRowCount: 1,
      lastExecutedQuery: 'FROM logs-*',
    };
    renderSandbox();
    expect(screen.getByTestId('mockComposeDiscoverChart')).toBeInTheDocument();
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('shows result count with plural form', () => {
    mockExecutionResult = {
      ...defaultExecutionResult,
      hasRun: true,
      columns: [{ id: 'host.name', displayAsText: 'host.name', esType: 'keyword' }],
      rows: [{ 'host.name': 'server-01' }, { 'host.name': 'server-02' }],
      totalRowCount: 2,
      lastExecutedQuery: 'FROM logs-*',
    };
    renderSandbox();
    expect(screen.getByText('2 results')).toBeInTheDocument();
  });

  it('disables time field selector when onTimeFieldChange is absent', () => {
    renderSandbox();
    expect(screen.getByTestId('querySandboxTimeField')).toBeDisabled();
  });

  it('enables time field selector when onTimeFieldChange is provided', () => {
    renderSandbox({ onTimeFieldChange: jest.fn() });
    expect(screen.getByTestId('querySandboxTimeField')).not.toBeDisabled();
  });

  describe('alert query tab', () => {
    const tabPropsBase = {
      tabs: ['base', 'alert'] as const,
      onTabChange: jest.fn(),
      alertBlock: '',
      recoveryBlock: '',
      onBaseQueryChange: jest.fn(),
      onAlertBlockChange: jest.fn(),
      onRecoveryBlockChange: jest.fn(),
    };

    it('disables the alert tab when the base query is empty', () => {
      renderSandbox({
        tabProps: {
          ...tabPropsBase,
          tabs: ['base', 'alert'],
          activeTab: 'base',
          baseQuery: '',
        },
      });

      expect(screen.getByTestId('querySandboxTab-alert')).toBeDisabled();
      expect(screen.getByTestId('querySandboxTab-base')).not.toBeDisabled();
    });

    it('enables the alert tab when the base query is populated', () => {
      renderSandbox({
        tabProps: {
          ...tabPropsBase,
          tabs: ['base', 'alert'],
          activeTab: 'base',
          baseQuery: 'FROM logs-*',
        },
      });

      expect(screen.getByTestId('querySandboxTab-alert')).not.toBeDisabled();
    });

    it('switches to the base tab when alert is active without a base query', () => {
      const onTabChange = jest.fn();

      renderSandbox({
        tabProps: {
          ...tabPropsBase,
          tabs: ['base', 'alert'],
          activeTab: 'alert',
          baseQuery: '',
          onTabChange,
        },
      });

      expect(onTabChange).toHaveBeenCalledWith('base');
    });
  });
});
