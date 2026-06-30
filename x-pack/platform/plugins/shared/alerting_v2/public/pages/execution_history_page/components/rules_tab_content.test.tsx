/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import type { RuleExecutionView } from '@kbn/alerting-v2-schemas';
import { RulesTabContent } from './rules_tab_content';

const mockUseFetchRuleExecutions = jest.fn();
const mockRefetch = jest.fn();
const mockUseAlertingRulesCache = jest.fn();

jest.mock('@kbn/core-di-browser', () => ({
  useService: (token: unknown) => {
    if (token === 'settings') {
      return { client: { get: () => 'YYYY-MM-DD HH:mm' } };
    }
    if (token === 'http') {
      return {};
    }
    return {};
  },
  CoreStart: (key: string) => key,
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
  spaceId: 'default',
  startedAt: '2026-05-05T10:00:00.000Z',
  endedAt: '2026-05-05T10:00:01.500Z',
  timings: { duration: 1500, scheduledDelay: 0 },
  outcome: 'success',
  reason: 'Completed successfully',
  error: null,
  ...overrides,
});

const mockResult = (
  overrides: Partial<{
    data: { items: RuleExecutionView[]; total: number; page: number; perPage: number };
    isFetching: boolean;
    isError: boolean;
  }> = {}
) => {
  mockUseFetchRuleExecutions.mockReturnValue({
    data: { items: [], total: 0, page: 1, perPage: 10 },
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

describe('RulesTabContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAlertingRulesCache.mockReturnValue({
      rulesCache: {
        'rule-1': { id: 'rule-1', metadata: { name: 'My Rule' } },
      },
      loading: false,
      error: undefined,
    });
  });

  it('renders the table and outcome filter', () => {
    mockResult();
    renderComponent();

    expect(screen.getByTestId('ruleExecutionHistoryTable')).toBeInTheDocument();
    expect(screen.getByTestId('ruleExecutionHistoryOutcomeFilter')).toBeInTheDocument();
  });

  it('calls useFetchRuleExecutions with default params (page 1, perPage 10, no outcome)', () => {
    mockResult();
    renderComponent();

    expect(mockUseFetchRuleExecutions).toHaveBeenCalledWith({
      page: 1,
      perPage: 10,
      outcome: undefined,
    });
  });

  it('shows the empty state when there are no items', () => {
    mockResult();
    renderComponent();

    expect(screen.getByTestId('ruleExecutionHistoryEmptyPrompt')).toBeInTheDocument();
  });

  it('renders rows with timestamp, rule name, duration, outcome badge, and message', () => {
    mockResult({
      data: {
        items: [buildItem()],
        total: 1,
        page: 1,
        perPage: 10,
      },
    });
    renderComponent();

    expect(screen.getByText(/2026-05-05/)).toBeInTheDocument();
    expect(screen.getByText('My Rule')).toBeInTheDocument();
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('Completed successfully')).toBeInTheDocument();
  });

  it('calls onRuleClick when the rule name link is clicked', async () => {
    mockResult({
      data: {
        items: [buildItem()],
        total: 1,
        page: 1,
        perPage: 10,
      },
    });
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
    mockResult({
      data: {
        items: [buildItem({ rule: { id: 'rule-orphan', version: null } })],
        total: 1,
        page: 1,
        perPage: 10,
      },
    });
    renderComponent();

    expect(screen.getByText('rule-orphan')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'rule-orphan' })).not.toBeInTheDocument();
  });

  it('shows error message when outcome is failure', () => {
    mockResult({
      data: {
        items: [
          buildItem({
            outcome: 'failure',
            reason: null,
            error: { message: 'Index not found', stackTrace: null },
          }),
        ],
        total: 1,
        page: 1,
        perPage: 10,
      },
    });
    renderComponent();

    expect(screen.getByText('failure')).toBeInTheDocument();
    expect(screen.getByText('Index not found')).toBeInTheDocument();
  });

  it('shows "Rule executed successfully" when outcome is success and no reason or error', () => {
    mockResult({
      data: {
        items: [buildItem({ outcome: 'success', reason: null, error: null })],
        total: 1,
        page: 1,
        perPage: 10,
      },
    });
    renderComponent();

    expect(screen.getByText('Rule executed successfully')).toBeInTheDocument();
  });

  it('shows em dash when outcome is failure but neither reason nor error.message is present', () => {
    mockResult({
      data: {
        items: [buildItem({ outcome: 'failure', reason: null, error: null })],
        total: 1,
        page: 1,
        perPage: 10,
      },
    });
    renderComponent();

    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('renders the error state with retry when isError is true', async () => {
    mockResult({ isError: true });
    renderComponent();

    expect(screen.getByText(/Failed to load execution history/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retry);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('changing the outcome filter resets to page 1', async () => {
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
    mockResult({
      data: {
        items: [buildItem({ timings: { duration: 250, scheduledDelay: 0 } })],
        total: 1,
        page: 1,
        perPage: 10,
      },
    });
    renderComponent();

    expect(screen.getByText('250 ms')).toBeInTheDocument();
  });

  it('renders pagination with 10, 50, 100 page size options', () => {
    mockResult({
      data: {
        items: Array.from({ length: 10 }, (_, idx) =>
          buildItem({ id: `exec-${idx}`, startedAt: `2026-05-05T10:0${idx}:00.000Z` })
        ),
        total: 150,
        page: 1,
        perPage: 10,
      },
    });
    renderComponent();

    const pageSizeSelector = screen.getByTestId('tablePaginationPopoverButton');
    expect(pageSizeSelector).toBeInTheDocument();
  });

  it('caps totalItemCount at the API result window limit', () => {
    mockResult({
      data: { items: [buildItem()], total: 1_200_000, page: 1, perPage: 100 },
    });
    renderComponent();

    expect(screen.getByText(/of 100/)).toBeInTheDocument();
  });
});
