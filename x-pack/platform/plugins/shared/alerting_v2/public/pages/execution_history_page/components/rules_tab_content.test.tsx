/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import { UnifiedDataTable } from '@kbn/unified-data-table';
import type { RuleExecutionView } from '@kbn/alerting-v2-schemas';
import { RulesTabContent } from './rules_tab_content';

const mockUseFetchRuleExecutions = jest.fn();
const mockRefetch = jest.fn();
const mockUseAlertingRulesCache = jest.fn();

let mockCanReadRules = true;

jest.mock('@kbn/core-di-browser', () => ({
  useService: (token: unknown) => {
    if (token === 'settings') {
      return { client: { get: () => 'YYYY-MM-DD HH:mm' } };
    }
    if (token === 'http') {
      return {};
    }
    if (typeof token === 'function') {
      return {
        canRead: () => mockCanReadRules,
        canWrite: () => mockCanReadRules,
        can: () => mockCanReadRules,
      };
    }
    return {};
  },
  CoreStart: (key: string) => key,
}));

jest.mock('@kbn/unified-data-table', () => {
  const ReactActual = jest.requireActual('react');
  return {
    DataLoadingState: { loading: 'loading', loaded: 'loaded' },
    ROWS_HEIGHT_OPTIONS: { auto: -1, single: 1, default: 3 },
    UnifiedDataTable: jest.fn(({ rows, columns, externalCustomRenderers }: Record<string, any>) =>
      ReactActual.createElement(
        'div',
        { 'data-test-subj': 'unifiedDataTable' },
        rows.map((row: any) =>
          ReactActual.createElement(
            'div',
            { key: row.id, role: 'row' },
            columns.map((columnId: string) => {
              const Renderer = externalCustomRenderers?.[columnId];
              return ReactActual.createElement(
                'div',
                { key: columnId, role: 'cell' },
                Renderer
                  ? ReactActual.createElement(Renderer, { row, columnId })
                  : String(row.flattened?.[columnId] ?? '')
              );
            })
          )
        )
      )
    ),
  };
});

jest.mock('@kbn/cell-actions', () => ({
  CellActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../data_view', () => ({
  ...jest.requireActual('../data_view'),
  useRuleExecutionsDataView: () => ({ dataView: {}, error: undefined }),
}));

jest.mock('../hooks/use_unified_data_table_services', () => ({
  useUnifiedDataTableServices: () => ({}),
}));

jest.mock('../../../hooks/use_fetch_rule_executions', () => ({
  useFetchRuleExecutions: (...args: unknown[]) => mockUseFetchRuleExecutions(...args),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_alerting_rules_cache', () => ({
  useAlertingRulesCache: (...args: unknown[]) => mockUseAlertingRulesCache(...args),
}));

const buildItem = (overrides: Partial<RuleExecutionView> = {}): RuleExecutionView => ({
  id: 'exec-1',
  rule: { id: 'rule-1', version: null },
  space_id: 'default',
  started_at: '2026-05-05T10:00:00.000Z',
  ended_at: '2026-05-05T10:00:01.500Z',
  timings: { duration: 1500, scheduled_delay: 0 },
  outcome: 'success',
  reason: 'Completed successfully',
  error: null,
  ...overrides,
});

const mockResult = (
  overrides: Partial<{
    data: { items: RuleExecutionView[]; total: number; page: number; per_page: number };
    isFetching: boolean;
    isError: boolean;
  }> = {}
) => {
  mockUseFetchRuleExecutions.mockReturnValue({
    data: { items: [], total: 0, page: 1, per_page: 10 },
    isFetching: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
};

const mockOnRuleClick = jest.fn();

const renderComponent = () =>
  render(
    <I18nProvider>
      <RulesTabContent onRuleClick={mockOnRuleClick} />
    </I18nProvider>
  );

// Latest props the component handed to the (stubbed) grid.
const lastGridProps = () => {
  const calls = jest.mocked(UnifiedDataTable).mock.calls;
  return calls[calls.length - 1][0] as Record<string, any>;
};

const withRows = (items: RuleExecutionView[], total = items.length) => ({
  data: { items, total, page: 1, per_page: 10 },
});

describe('RulesTabContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanReadRules = true;
    mockUseAlertingRulesCache.mockReturnValue({
      rulesCache: {
        'rule-1': { id: 'rule-1', metadata: { name: 'My Rule' } },
      },
      loading: false,
      error: undefined,
    });
  });

  it('renders the table and outcome filter', () => {
    mockResult(withRows([buildItem()]));
    renderComponent();

    expect(screen.getByTestId('ruleExecutionHistoryTable')).toBeInTheDocument();
    expect(screen.getByTestId('ruleExecutionHistoryOutcomeFilter')).toBeInTheDocument();
  });

  it('calls useFetchRuleExecutions with default params (page 1, perPage 10, default sort)', () => {
    mockResult();
    renderComponent();

    expect(mockUseFetchRuleExecutions).toHaveBeenCalledWith({
      page: 1,
      perPage: 10,
      outcome: undefined,
      sort: 'startedAt',
      sortOrder: 'desc',
    });
  });

  it('shows the empty state when there are no items', () => {
    mockResult();
    renderComponent();

    expect(screen.getByTestId('ruleExecutionHistoryEmptyPrompt')).toBeInTheDocument();
  });

  it('renders rows with timestamp, rule name, duration, outcome badge, and message', () => {
    mockResult(withRows([buildItem()]));
    renderComponent();

    expect(screen.getByText(/2026-05-05/)).toBeInTheDocument();
    expect(screen.getByText('My Rule')).toBeInTheDocument();
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('Completed successfully')).toBeInTheDocument();
  });

  it('calls onRuleClick when the rule name link is clicked', async () => {
    mockResult(withRows([buildItem()]));
    renderComponent();

    await userEvent.click(screen.getByText('My Rule'));
    expect(mockOnRuleClick).toHaveBeenCalledWith('rule-1');
  });

  it('shows rule id as plain text when rule is not in cache', () => {
    mockUseAlertingRulesCache.mockReturnValue({
      rulesCache: {},
      loading: false,
      error: undefined,
    });
    mockResult(withRows([buildItem({ rule: { id: 'rule-orphan', version: null } })]));
    renderComponent();

    expect(screen.getByText('rule-orphan')).toBeInTheDocument();
    expect(
      screen.queryByTestId('ruleExecutionHistoryRuleLink-rule-orphan')
    ).not.toBeInTheDocument();
  });

  it('shows error message when outcome is failure', () => {
    mockResult(
      withRows([
        buildItem({
          outcome: 'failure',
          reason: null,
          error: { message: 'Index not found', stack_trace: null },
        }),
      ])
    );
    renderComponent();

    expect(screen.getByText('failure')).toBeInTheDocument();
    expect(screen.getByText('Index not found')).toBeInTheDocument();
  });

  it('shows "Rule executed successfully" when outcome is success and no reason or error', () => {
    mockResult(withRows([buildItem({ outcome: 'success', reason: null, error: null })]));
    renderComponent();

    expect(screen.getByText('Rule executed successfully')).toBeInTheDocument();
  });

  it('shows em dash when outcome is failure but neither reason nor error.message is present', () => {
    mockResult(withRows([buildItem({ outcome: 'failure', reason: null, error: null })]));
    renderComponent();

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the error state with retry when isError is true', async () => {
    mockResult({ isError: true });
    renderComponent();

    expect(screen.getByText(/Failed to load execution history/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retry);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('changing the outcome filter resets to page 1 and keeps the current sort', async () => {
    mockResult();
    renderComponent();

    await userEvent.selectOptions(
      screen.getByTestId('ruleExecutionHistoryOutcomeFilter'),
      'failure'
    );

    await waitFor(() => {
      expect(mockUseFetchRuleExecutions).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 10,
        outcome: ['failure'],
        sort: 'startedAt',
        sortOrder: 'desc',
      });
    });
  });

  it('shows filtered empty state when outcome filter is active and no rows', async () => {
    mockResult();
    renderComponent();

    await userEvent.selectOptions(
      screen.getByTestId('ruleExecutionHistoryOutcomeFilter'),
      'success'
    );

    expect(screen.getByTestId('executionHistoryFilteredEmptyPrompt')).toBeInTheDocument();
  });

  it('formats duration in ms for sub-second values', () => {
    mockResult(withRows([buildItem({ timings: { duration: 250, scheduled_delay: 0 } })]));
    renderComponent();

    expect(screen.getByText('250 ms')).toBeInTheDocument();
  });

  describe('sorting', () => {
    it('wires the grid onSort to the fetch hook and resets to page 1', async () => {
      mockResult(withRows([buildItem()]));
      renderComponent();

      act(() => {
        lastGridProps().onSort([['duration', 'asc']]);
      });

      await waitFor(() => {
        expect(mockUseFetchRuleExecutions).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 1, sort: 'duration', sortOrder: 'asc' })
        );
      });
    });

    it('restores the default sort when the grid sort is cleared', async () => {
      mockResult(withRows([buildItem()]));
      renderComponent();

      act(() => {
        lastGridProps().onSort([['duration', 'asc']]);
      });
      act(() => {
        lastGridProps().onSort([]);
      });

      await waitFor(() => {
        expect(mockUseFetchRuleExecutions).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: 'startedAt', sortOrder: 'desc' })
        );
      });
    });
  });

  describe('pagination', () => {
    it('renders the per-page options control', () => {
      mockResult(
        withRows(
          Array.from({ length: 10 }, (_, idx) =>
            buildItem({ id: `exec-${idx}`, started_at: `2026-05-05T10:0${idx}:00.000Z` })
          ),
          150
        )
      );
      renderComponent();

      expect(screen.getByTestId('tablePaginationPopoverButton')).toBeInTheDocument();
    });

    it('caps the page count at the API result window limit', () => {
      // total is far past the window; with the default perPage of 10 and a 10_000 cap the last
      // page is 1000 (0-indexed button 999), proving the total was clamped before computing the
      // page count (uncapped it would be 120_000 pages).
      mockResult({
        data: { items: [buildItem()], total: 1_200_000, page: 1, per_page: 10 },
      });
      renderComponent();

      expect(screen.getByTestId('pagination-button-999')).toBeInTheDocument();
      expect(screen.queryByTestId('pagination-button-1000')).not.toBeInTheDocument();
    });
  });

  describe('when the user cannot read rules', () => {
    beforeEach(() => {
      mockCanReadRules = false;
    });

    it('does not request rule names (empty ruleIds) and renders rule ids as plain text', () => {
      mockUseAlertingRulesCache.mockReturnValue({
        rulesCache: {},
        loading: false,
        error: undefined,
      });
      mockResult(withRows([buildItem()]));
      renderComponent();

      expect(mockUseAlertingRulesCache).toHaveBeenLastCalledWith(
        expect.objectContaining({ ruleIds: [] })
      );
      expect(screen.getByText('rule-1')).toBeInTheDocument();
      expect(screen.queryByTestId('ruleExecutionHistoryRuleLink-rule-1')).not.toBeInTheDocument();
    });
  });
});
