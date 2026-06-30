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
import type { PolicyExecutionHistoryItem } from '../../services/execution_history_api';
import type { useFetchRuleExecutions } from '../../hooks/use_fetch_rule_executions';
import { ExecutionHistoryPage } from './execution_history_page';

const mockUseFetchExecutionHistory = jest.fn();
const mockUseFetchRuleExecutions = jest.fn();
const mockRefetch = jest.fn();
const mockRuleRefetch = jest.fn();

jest.mock('../../application/breadcrumb_context', () => ({
  useSetBreadcrumbs: () => jest.fn(),
}));

jest.mock('@kbn/core-di-browser', () => ({
  useService: (token: unknown) => {
    if (token === 'chrome') return { docTitle: { change: jest.fn() } };
    if (token === 'application') {
      return { getUrlForApp: (app: string, opts: { path: string }) => `/app/${app}${opts.path}` };
    }
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

jest.mock('../../hooks/use_fetch_execution_history', () => ({
  useFetchExecutionHistory: (...args: unknown[]) => mockUseFetchExecutionHistory(...args),
}));

jest.mock('../../hooks/use_fetch_rule_executions', () => ({
  useFetchRuleExecutions: (...args: unknown[]) => mockUseFetchRuleExecutions(...args),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_alerting_rules_cache', () => ({
  useAlertingRulesCache: () => ({ rulesCache: {}, loading: false, error: undefined }),
}));

const mockUseCountNewExecutionHistoryEvents = jest.fn();
jest.mock('../../hooks/use_count_new_execution_history_events', () => ({
  useCountNewExecutionHistoryEvents: (...args: unknown[]) =>
    mockUseCountNewExecutionHistoryEvents(...args),
}));

jest.mock(
  '../../components/action_policy/details_flyout/action_policy_details_flyout_container',
  () => ({
    ActionPolicyDetailsFlyoutContainer: ({
      policyId,
      onClose,
    }: {
      policyId: string;
      onClose: () => void;
    }) => (
      <div data-test-subj={`mockFlyout-${policyId}`}>
        <button data-test-subj="mockFlyoutClose" onClick={onClose} type="button">
          close
        </button>
      </div>
    ),
  })
);

jest.mock('../../hooks/use_compose_discover_flyout', () => ({
  useComposeDiscoverFlyout: () => ({
    flyout: null,
    openCreateFlyout: jest.fn(),
    openEditFlyout: jest.fn(),
    openCloneFlyout: jest.fn(),
  }),
}));

jest.mock('../../components/rule/flyouts/rule_summary_flyout_container', () => ({
  RuleSummaryFlyoutContainer: ({
    ruleId,
    onClose,
  }: {
    ruleId: string;
    onClose: () => void;
    onEdit: () => void;
    onClone: () => void;
  }) => (
    <div data-test-subj={`mockRuleFlyout-${ruleId}`}>
      <button data-test-subj="mockRuleFlyoutClose" onClick={onClose} type="button">
        close
      </button>
    </div>
  ),
}));

const buildItem = (
  overrides: Partial<PolicyExecutionHistoryItem> = {}
): PolicyExecutionHistoryItem => ({
  '@timestamp': '2026-05-05T10:00:00.000Z',
  policy: { id: 'policy-1', name: 'My Policy' },
  rule: { id: 'rule-1', name: 'My Rule' },
  outcome: 'dispatched',
  episode_count: 3,
  action_group_count: 2,
  workflows: [{ id: 'wf-1', name: 'My Workflow' }],
  ...overrides,
});

const mockFetchResult = (
  overrides: Partial<{
    data: {
      items: PolicyExecutionHistoryItem[];
      page: number;
      perPage: number;
      totalEvents: number;
      searchMatches: { policies: number; rules: number; cap: number } | null;
    };
    isFetching: boolean;
    isError: boolean;
  }> = {}
) => {
  mockUseFetchExecutionHistory.mockReturnValue({
    data: { items: [], page: 1, perPage: 50, totalEvents: 0, searchMatches: null },
    isFetching: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
};

const renderPage = () =>
  render(
    <I18nProvider>
      <ExecutionHistoryPage />
    </I18nProvider>
  );

const mockRuleFetchResult = (
  overrides: Partial<ReturnType<typeof useFetchRuleExecutions>> = {}
) => {
  mockUseFetchRuleExecutions.mockReturnValue({
    data: { items: [], total: 0, page: 1, perPage: 10 },
    isFetching: false,
    isError: false,
    refetch: mockRuleRefetch,
    ...overrides,
  });
};

const switchToPoliciesTab = async () => {
  await userEvent.click(screen.getByRole('tab', { name: /policies/i }));
};

describe('ExecutionHistoryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCountNewExecutionHistoryEvents.mockReturnValue({ data: { count: 0 } });
    mockRuleFetchResult();
  });

  it('renders the page title and tabs', () => {
    mockFetchResult();
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: /execution history/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /rules/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the experimental badge in the page header', () => {
    mockFetchResult();
    renderPage();

    expect(screen.getByTestId('alertingV2ExperimentalBadge')).toBeInTheDocument();
  });

  it('renders the denormalization info tooltip next to the Policies tab', () => {
    mockFetchResult();
    renderPage();

    expect(screen.getByTestId('executionHistoryDenormalizationTip')).toBeInTheDocument();
  });

  describe('Rules tab (default)', () => {
    it('renders the rules execution history table by default', () => {
      mockRuleFetchResult();
      renderPage();

      expect(screen.getByTestId('ruleExecutionHistoryTable')).toBeInTheDocument();
    });

    it('shows the rules empty state when there are no items', () => {
      mockRuleFetchResult();
      renderPage();

      expect(screen.getByTestId('ruleExecutionHistoryEmptyPrompt')).toBeInTheDocument();
    });

    it('renders the outcome filter for the rules tab', () => {
      mockRuleFetchResult();
      renderPage();

      expect(screen.getByTestId('ruleExecutionHistoryOutcomeFilter')).toBeInTheDocument();
    });

    it('calls useFetchRuleExecutions with default params', () => {
      renderPage();

      expect(mockUseFetchRuleExecutions).toHaveBeenCalledWith({
        page: 1,
        perPage: 10,
        outcome: undefined,
      });
    });
  });

  describe('Policies tab', () => {
    it('shows the 24h time window in the page description', async () => {
      mockFetchResult();
      renderPage();
      await switchToPoliciesTab();

      expect(
        screen.getByText(/Showing dispatcher decisions from the last 24 hours/i)
      ).toBeInTheDocument();
    });

    it('shows the empty state when there are no items', async () => {
      mockFetchResult();
      renderPage();
      await switchToPoliciesTab();

      expect(
        screen.getByText(/No policy execution activity in the last 24 hours/i)
      ).toBeInTheDocument();
    });

    it('formats the timestamp using the user dateFormat setting', async () => {
      mockFetchResult({
        data: {
          items: [buildItem({ '@timestamp': '2026-05-05T10:00:00.000Z' })],
          page: 1,
          perPage: 50,
          totalEvents: 1,
          searchMatches: null,
        },
      });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.queryByText('2026-05-05T10:00:00.000Z')).not.toBeInTheDocument();
      expect(screen.getByText(/2026-05-05/)).toBeInTheDocument();
    });

    it('renders rows with policy, rule, and workflow names', async () => {
      mockFetchResult({
        data: {
          items: [buildItem()],
          page: 1,
          perPage: 50,
          totalEvents: 1,
          searchMatches: null,
        },
      });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.getByText('My Policy')).toBeInTheDocument();
      expect(screen.getByText('My Rule')).toBeInTheDocument();
      expect(screen.getByText('My Workflow')).toBeInTheDocument();
      expect(screen.getByText('dispatched')).toBeInTheDocument();
    });

    it('falls back to ids when names are missing', async () => {
      mockFetchResult({
        data: {
          items: [
            buildItem({
              policy: { id: 'policy-orphan', name: null },
              rule: { id: 'rule-orphan', name: null },
              workflows: [{ id: 'wf-orphan', name: null }],
            }),
          ],
          page: 1,
          perPage: 50,
          totalEvents: 1,
          searchMatches: null,
        },
      });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.getByText('policy-orphan')).toBeInTheDocument();
      expect(screen.getByText('rule-orphan')).toBeInTheDocument();
      expect(screen.getByText('wf-orphan')).toBeInTheDocument();
    });

    it('renders the error callout with a Retry button when isError is true', async () => {
      mockFetchResult({ isError: true });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.getByText(/Failed to load execution history/i)).toBeInTheDocument();
      const retry = screen.getByRole('button', { name: /retry/i });
      await userEvent.click(retry);
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('hides the table when in error state', async () => {
      mockFetchResult({ isError: true });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('opens the flyout when the policy link is clicked and closes it on dismiss', async () => {
      mockFetchResult({
        data: {
          items: [buildItem()],
          page: 1,
          perPage: 50,
          totalEvents: 1,
          searchMatches: null,
        },
      });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.queryByTestId('mockFlyout-policy-1')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'My Policy' }));
      expect(screen.getByTestId('mockFlyout-policy-1')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('mockFlyoutClose'));
      expect(screen.queryByTestId('mockFlyout-policy-1')).not.toBeInTheDocument();
    });

    it('opens the rule flyout when the rule link is clicked and closes it on dismiss', async () => {
      mockFetchResult({
        data: {
          items: [buildItem()],
          page: 1,
          perPage: 50,
          totalEvents: 1,
          searchMatches: null,
        },
      });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.queryByTestId('mockRuleFlyout-rule-1')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'My Rule' }));
      expect(screen.getByTestId('mockRuleFlyout-rule-1')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('mockRuleFlyoutClose'));
      expect(screen.queryByTestId('mockRuleFlyout-rule-1')).not.toBeInTheDocument();
    });

    it('renders workflow pills as links to the workflows app', async () => {
      mockFetchResult({
        data: {
          items: [buildItem()],
          page: 1,
          perPage: 50,
          totalEvents: 1,
          searchMatches: null,
        },
      });
      renderPage();
      await switchToPoliciesTab();

      const workflowLink = screen.getByRole('link', { name: 'My Workflow' });
      expect(workflowLink).toHaveAttribute('href', '/app/workflows/wf-1');
      expect(workflowLink).toHaveAttribute('target', '_blank');
    });

    it('queries with default page=1, perPage=100, outcome=all and no search', async () => {
      mockFetchResult();
      renderPage();
      await switchToPoliciesTab();

      expect(mockUseFetchExecutionHistory).toHaveBeenCalledWith({
        page: 1,
        perPage: 100,
        search: undefined,
        outcome: 'all',
      });
    });

    it('renders the search bar and outcome filter above the table', async () => {
      mockFetchResult();
      renderPage();
      await switchToPoliciesTab();

      expect(screen.getByTestId('executionHistorySearchBar')).toBeInTheDocument();
      expect(screen.getByTestId('executionHistoryOutcomeFilter')).toBeInTheDocument();
    });

    it('changing the outcome filter resets to page 1 and refetches with the new outcome', async () => {
      mockFetchResult();
      renderPage();
      await switchToPoliciesTab();

      await userEvent.selectOptions(
        screen.getByTestId('executionHistoryOutcomeFilter'),
        'dispatched'
      );

      await waitFor(() => {
        expect(mockUseFetchExecutionHistory).toHaveBeenLastCalledWith({
          page: 1,
          perPage: 100,
          search: undefined,
          outcome: 'dispatched',
        });
      });
    });

    it('typing in the search bar debounces and forwards the trimmed search term', async () => {
      mockFetchResult();
      renderPage();
      await switchToPoliciesTab();

      await userEvent.type(screen.getByTestId('executionHistorySearchBar'), '  cpu  ');

      await waitFor(
        () => {
          expect(mockUseFetchExecutionHistory).toHaveBeenLastCalledWith({
            page: 1,
            perPage: 100,
            search: 'cpu',
            outcome: 'all',
          });
        },
        { timeout: 2000 }
      );
    });

    it('shows the filtered empty state when search or outcome is active and there are no rows', async () => {
      mockFetchResult();
      renderPage();
      await switchToPoliciesTab();

      await userEvent.selectOptions(
        screen.getByTestId('executionHistoryOutcomeFilter'),
        'throttled'
      );

      expect(screen.getByTestId('executionHistoryFilteredEmptyPrompt')).toBeInTheDocument();
      expect(
        screen.queryByText(/No policy execution activity in the last 24 hours/i)
      ).not.toBeInTheDocument();
    });

    it('shows the new-events banner when count > 0', async () => {
      mockFetchResult();
      mockUseCountNewExecutionHistoryEvents.mockReturnValue({ data: { count: 3 } });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.getByTestId('executionHistoryNewEventsBanner')).toBeInTheDocument();
      expect(screen.getByText(/3 new events since the last refresh/i)).toBeInTheDocument();
    });

    it('hides the new-events banner when count is 0', async () => {
      mockFetchResult();
      mockUseCountNewExecutionHistoryEvents.mockReturnValue({ data: { count: 0 } });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.queryByTestId('executionHistoryNewEventsBanner')).not.toBeInTheDocument();
    });

    it('hides the banner when in error state even if count > 0', async () => {
      mockFetchResult({ isError: true });
      mockUseCountNewExecutionHistoryEvents.mockReturnValue({ data: { count: 5 } });
      renderPage();
      await switchToPoliciesTab();

      expect(screen.queryByTestId('executionHistoryNewEventsBanner')).not.toBeInTheDocument();
    });

    it('clicking "Load new events" resets to page 1 and refetches', async () => {
      mockFetchResult();
      mockUseCountNewExecutionHistoryEvents.mockReturnValue({ data: { count: 2 } });
      renderPage();
      await switchToPoliciesTab();

      await userEvent.click(screen.getByTestId('executionHistoryLoadNewEventsButton'));

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('keeps the banner visible with a loading button while the fetch is in flight', async () => {
      mockFetchResult({ isFetching: true });
      mockUseCountNewExecutionHistoryEvents.mockReturnValue({ data: { count: 2 } });
      renderPage();
      await switchToPoliciesTab();

      await userEvent.click(screen.getByTestId('executionHistoryLoadNewEventsButton'));

      expect(screen.getByTestId('executionHistoryNewEventsBanner')).toBeInTheDocument();
      expect(screen.getByTestId('executionHistoryLoadNewEventsButton')).toBeDisabled();
    });
  });
});
