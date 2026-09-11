/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import { contentListQueryClient } from '@kbn/content-list-provider';
import { ListPageTestProviders } from '../../test_utils/test_providers';
import { CREATE_WITH_AGENT_INITIAL_PROMPT } from '../../constants';
import type { RuleApiResponse } from '../../services/rules_api';
import { RulesListPage } from './rules_list_page';

const mockNavigateToUrl = jest.fn();
const mockNavigateToApp = jest.fn();
const mockGetUrlForApp = jest.fn((appId: string, options?: { path?: string }) => {
  const path = options?.path ?? '';
  return `/app/${appId}${path}`;
});
const mockDocTitleChange = jest.fn();
const mockFindItems = jest.fn();

jest.mock('../../application/breadcrumb_context', () => ({
  useSetBreadcrumbs: () => jest.fn(),
}));

let mockAgentBuilderShow = true;
let mockExperimentalFeaturesEnabled = true;
let mockCanWriteRules = true;
let mockCanWriteActionPolicies = true;
let mockToursEnabled = true;

jest.mock('@kbn/core-di-browser', () => {
  const { UserCapabilities: ActualUserCapabilities } = jest.requireActual(
    '../../services/user_capabilities'
  );
  return {
    useService: (token: unknown) => {
      if (token === ActualUserCapabilities) {
        return {
          canWrite: (feature: string) => {
            if (feature === 'rules') return mockCanWriteRules;
            if (feature === 'actionPolicies') return mockCanWriteActionPolicies;
            return true;
          },
          canRead: () => true,
          can: () => mockCanWriteRules,
        };
      }

      const services: Record<string, unknown> = {
        application: {
          navigateToUrl: mockNavigateToUrl,
          navigateToApp: mockNavigateToApp,
          getUrlForApp: mockGetUrlForApp,
          capabilities: {
            agentBuilder: { show: mockAgentBuilderShow },
          },
        },
        uiSettings: {
          get: (id: string) =>
            id === 'agentBuilder:experimentalFeatures'
              ? mockExperimentalFeaturesEnabled
              : undefined,
        },
        chrome: { docTitle: { change: mockDocTitleChange } },
        http: { basePath: { prepend: (p: string) => p } },
        notifications: {
          toasts: { addSuccess: jest.fn(), addError: jest.fn() },
          tours: { isEnabled: () => mockToursEnabled },
        },
        docLinks: {
          links: {
            alerting: {
              actionPolicies: 'https://docs.test/action-policies',
            },
          },
        },
      };

      return services[token as string] ?? {};
    },
    CoreStart: (key: string) => key,
  };
});

jest.mock('@kbn/core-di', () => ({
  PluginStart: (key: string) => key,
}));

jest.mock('@kbn/alerting-v2-rule-form', () => ({
  ComposeDiscoverFlyout: ({ onCreateRule }: { onCreateRule: (payload: unknown) => void }) => (
    <button data-test-subj="composeDiscoverFlyout" onClick={() => onCreateRule({})}>
      Compose Discover flyout
    </button>
  ),
  getRuleBuilderCreateOptions: () => [],
}));

jest.mock('./rules_data_source', () => ({
  ...jest.requireActual('./rules_data_source'),
  useRulesDataSource: () => ({
    findItems: mockFindItems,
    // Skip Content List's search debounce so filter/search assertions stay synchronous.
    debounceMs: 0,
  }),
}));

jest.mock('../../hooks/use_fetch_rule_tags', () => ({
  useFetchRuleTags: () => ({ data: ['prod'], isLoading: false, isError: false }),
}));

const mockCreateRuleMutate = jest.fn();
jest.mock('../../hooks/use_create_rule', () => ({
  useCreateRule: () => ({ mutate: mockCreateRuleMutate, isLoading: false }),
}));

const mockUpdateRuleMutate = jest.fn();
jest.mock('../../hooks/use_update_rule', () => ({
  useUpdateRule: () => ({ mutate: mockUpdateRuleMutate, isLoading: false }),
}));

jest.mock('../../hooks/use_setup_rule_notifications', () => ({
  useSetupRuleNotifications: () => ({ mutate: jest.fn(), isLoading: false }),
}));

const mockDeleteMutate = jest.fn();
const mockUseDeleteRule = jest.fn();
jest.mock('../../hooks/use_delete_rule', () => ({
  useDeleteRule: () => mockUseDeleteRule(),
}));

const mockBulkDeleteMutate = jest.fn();
jest.mock('../../hooks/use_bulk_delete_rules', () => ({
  useBulkDeleteRules: () => ({ mutate: mockBulkDeleteMutate, isLoading: false }),
}));

const mockBulkEnableMutate = jest.fn();
const mockBulkDisableMutate = jest.fn();
jest.mock('../../hooks/use_bulk_enable_disable_rules', () => ({
  useBulkEnableRules: () => ({ mutate: mockBulkEnableMutate, isLoading: false }),
  useBulkDisableRules: () => ({ mutate: mockBulkDisableMutate, isLoading: false }),
}));

const mockToggleEnabledMutate = jest.fn();
const mockUseToggleRuleEnabled = jest.fn();
jest.mock('../../hooks/use_toggle_rule_enabled', () => ({
  useToggleRuleEnabled: () => mockUseToggleRuleEnabled(),
}));

const mockRunRuleMutate = jest.fn();
jest.mock('../../hooks/use_run_rule', () => ({
  useRunRule: () => ({ mutate: mockRunRuleMutate, isLoading: false }),
}));

const createRule = (overrides: Partial<RuleApiResponse> = {}): RuleApiResponse =>
  ({
    id: 'rule-1',
    kind: 'alert',
    enabled: true,
    metadata: {
      name: 'Rule One',
      description: 'Monitors log errors',
      tags: ['prod'],
    },
    schedule: { every: '1m' },
    query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
    time_field: '@timestamp',
    createdBy: 'elastic',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'elastic',
    updatedAt: '2026-01-02T03:04:05.000Z',
    ...overrides,
  } as RuleApiResponse);

const mockRules: RuleApiResponse[] = [
  createRule(),
  createRule({
    id: 'rule-2',
    enabled: false,
    metadata: { name: 'Rule Two', tags: [] as string[], version: 1 },
    schedule: { every: '5m' },
    query: { format: 'standalone', breach: { query: 'FROM metrics-*' } },
  }),
];

const toListItem = (rule: RuleApiResponse) => ({
  id: rule.id,
  title: rule.metadata?.name ?? rule.id,
  description: rule.metadata?.description,
  tags: rule.metadata?.tags,
  rule,
});

const resolveRules = (items: RuleApiResponse[] = mockRules, total = items.length) => {
  mockFindItems.mockResolvedValue({
    items: items.map(toListItem),
    total,
  });
};

const lastFindItemsArgs = () => {
  const { calls } = mockFindItems.mock;
  return calls[calls.length - 1][0];
};

const rowCheckbox = (ruleId: string) => screen.getByTestId(`checkboxSelectRow-${ruleId}`);

const renderPage = () =>
  render(
    <ListPageTestProviders>
      <RulesListPage />
    </ListPageTestProviders>
  );

const waitForRules = async () => {
  await waitFor(() => {
    expect(screen.getByText('Rule One')).toBeInTheDocument();
  });
};

describe('RulesListPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Content List uses a shared QueryClient; clear cached pages between tests.
    contentListQueryClient.clear();
    window.localStorage.clear();
    mockAgentBuilderShow = true;
    mockExperimentalFeaturesEnabled = true;
    mockCanWriteRules = true;
    mockCanWriteActionPolicies = true;
    mockToursEnabled = true;
    mockUseDeleteRule.mockReturnValue({
      mutate: mockDeleteMutate,
      isLoading: false,
    });
    mockUseToggleRuleEnabled.mockReturnValue({
      mutate: mockToggleEnabledMutate,
      isLoading: false,
      variables: undefined,
    });
    resolveRules();
  });

  it('renders the experimental badge in the page header', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByTestId('alertingV2ExperimentalBadge')).toBeInTheDocument();
  });

  describe('centralized action policies banner', () => {
    it('renders the banner above the search bar when rules exist', async () => {
      renderPage();
      await waitForRules();

      const banner = screen.getByTestId('centralizedActionPoliciesBanner');
      const searchBar = screen.getByPlaceholderText('Search rules');
      expect(banner).toBeInTheDocument();
      expect(banner.compareDocumentPosition(searchBar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('renders the banner even when there are no rules (empty phase)', async () => {
      resolveRules([], 0);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('centralizedActionPoliciesBanner')).toBeInTheDocument();
      });
    });

    it('hides the banner after dismissal', async () => {
      renderPage();
      await waitForRules();

      const dismissBtn = screen.getByTestId('centralizedActionPoliciesBannerDismiss');
      fireEvent.click(dismissBtn);

      expect(screen.queryByTestId('centralizedActionPoliciesBanner')).not.toBeInTheDocument();
    });

    it('does not show the banner for users without action-policy write privilege', async () => {
      mockCanWriteActionPolicies = false;
      renderPage();
      await waitForRules();

      expect(screen.queryByTestId('centralizedActionPoliciesBanner')).not.toBeInTheDocument();
    });

    it('does not show the banner when hideAnnouncements is enabled', async () => {
      mockToursEnabled = false;
      renderPage();
      await waitForRules();

      expect(screen.queryByTestId('centralizedActionPoliciesBanner')).not.toBeInTheDocument();
    });
  });

  it('renders loading state', async () => {
    mockFindItems.mockReturnValue(new Promise(() => {}));
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(CONTENT_LIST_TEST_SUBJECTS.toolbarSkeleton)).toBeInTheDocument();
    });
  });

  it('renders rules in the table', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByText('Rule Two')).toBeInTheDocument();
  });

  it('renders the search bar', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByPlaceholderText('Search rules')).toBeInTheDocument();
  });

  it('renders description under the rule name when present', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByText('Monitors log errors')).toBeInTheDocument();
  });

  it('does not render description when not present', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByText('Monitors log errors')).toBeInTheDocument();
    const ruleTwoRow = screen
      .getAllByRole('row')
      .find((row) => row.textContent?.includes('Rule Two'));
    expect(ruleTwoRow).toBeDefined();
    expect(ruleTwoRow?.textContent).not.toMatch(/Monitors/);
  });

  it('renders the Source column with extracted data source', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByText('logs-*')).toBeInTheDocument();
    expect(screen.getByText('metrics-*')).toBeInTheDocument();
  });

  it('does not show the empty create state when fetch fails', async () => {
    mockFindItems.mockRejectedValue(new Error('Network error'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search rules')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('ruleCreateOptionsPanel')).not.toBeInTheDocument();
  });

  it('shows empty state when there are no rules and no active filters', async () => {
    resolveRules([], 0);
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /no rules yet\. let's get started!/i })
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rulesListTable')).not.toBeInTheDocument();
  });

  it('hides the header create controls in the empty state (no rules, no active filters)', async () => {
    resolveRules([], 0);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('createEsqlRuleCard')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('createRuleButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('createRuleButton-secondary-button')).not.toBeInTheDocument();
  });

  it('keeps the header create controls when filters are active even with zero matching rules', async () => {
    mockFindItems.mockImplementation(async ({ filters }: { filters?: { search?: string } }) => {
      if (filters?.search) {
        return { items: [], total: 0 };
      }
      return { items: mockRules.map(toListItem), total: 2 };
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId('createRuleButton')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Search rules'), {
      target: { value: 'nosuchrule' },
    });

    await waitFor(() => {
      expect(lastFindItemsArgs().filters.search).toBe('nosuchrule');
    });

    expect(screen.getByTestId('createRuleButton')).toBeInTheDocument();
    expect(screen.queryByTestId('createEsqlRuleCard')).not.toBeInTheDocument();
  });

  it('opens the flyout from the empty state ES|QL rule card', async () => {
    resolveRules([], 0);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('createEsqlRuleCard')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('createEsqlRuleCard'));

    expect(screen.getByTestId('composeDiscoverFlyout')).toBeInTheDocument();
  });

  it('passes the search term to findItems', async () => {
    renderPage();
    await waitForRules();

    fireEvent.change(screen.getByPlaceholderText('Search rules'), {
      target: { value: 'Rule One' },
    });

    await waitFor(() => {
      expect(lastFindItemsArgs().filters.search).toBe('Rule One');
    });
  });

  it('clearing the search resets the fetch back to an unfiltered list', async () => {
    renderPage();
    await waitForRules();

    const searchInput = screen.getByPlaceholderText('Search rules');

    fireEvent.change(searchInput, { target: { value: 'prod' } });
    await waitFor(() => {
      expect(lastFindItemsArgs().filters.search).toBe('prod');
    });

    fireEvent.change(searchInput, { target: { value: '' } });
    await waitFor(() => {
      expect(lastFindItemsArgs().filters.search ?? '').toBe('');
    });
  });

  it('resets pagination to the first page after a new search', async () => {
    resolveRules(mockRules, 40);
    renderPage();
    await waitForRules();

    const nextPage = await screen.findByTestId('pagination-button-next');
    await waitFor(() => {
      expect(nextPage).not.toBeDisabled();
    });
    fireEvent.click(nextPage);
    await waitFor(() => {
      expect(lastFindItemsArgs().page.index).toBe(1);
    });

    fireEvent.change(screen.getByPlaceholderText('Search rules'), {
      target: { value: 'Rule' },
    });

    await waitFor(() => {
      const args = lastFindItemsArgs();
      expect(args.filters.search).toBe('Rule');
      expect(args.page.index).toBe(0);
    });
  });

  it('renders filter controls', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByTestId('rulesListStatusFilter')).toBeInTheDocument();
    expect(screen.getByTestId('rulesListTagsFilter')).toBeInTheDocument();
    expect(screen.getByTestId('rulesListKindFilter')).toBeInTheDocument();
  });

  it('does not show an active count on the status filter when nothing is selected', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByTestId('rulesListStatusFilter')).toHaveTextContent(/^Status$/);
  });

  it('passes status filters to findItems', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('rulesListStatusFilter'));
    const list = await screen.findByTestId('rulesListStatusFilter-list');
    fireEvent.click(within(list).getByText('Enabled'));

    await waitFor(() => {
      expect(lastFindItemsArgs().filters.enabled).toMatchObject({ include: ['true'] });
    });
  });

  it('passes tags filters to findItems', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('rulesListTagsFilter'));
    const list = await screen.findByTestId('rulesListTagsFilter-list');
    fireEvent.click(within(list).getByText('prod'));

    await waitFor(() => {
      expect(lastFindItemsArgs().filters.tag).toMatchObject({ include: ['prod'] });
    });
  });

  it('passes kind filters to findItems', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('rulesListKindFilter'));
    const list = await screen.findByTestId('rulesListKindFilter-list');
    fireEvent.click(within(list).getByText('Events'));

    await waitFor(() => {
      expect(lastFindItemsArgs().filters.kind).toMatchObject({ include: ['signal'] });
    });
  });

  it('uses name ascending as the default sort', async () => {
    renderPage();
    await waitForRules();

    expect(lastFindItemsArgs().sort).toEqual({ field: 'name', direction: 'asc' });
  });

  it('toggles name sort direction when the Name header is clicked', async () => {
    renderPage();
    await waitForRules();

    const nameHeader = screen.getByRole('columnheader', { name: /^name$/i });
    fireEvent.click(within(nameHeader).getByRole('button'));

    await waitFor(() => {
      expect(lastFindItemsArgs().sort).toEqual({ field: 'name', direction: 'desc' });
    });
  });

  it('sorts by kind when the Outcome header is clicked', async () => {
    renderPage();
    await waitForRules();

    const kindHeader = screen.getByRole('columnheader', { name: /^outcome$/i });
    fireEvent.click(within(kindHeader).getByRole('button'));

    await waitFor(() => {
      expect(lastFindItemsArgs().sort).toEqual({ field: 'kind', direction: 'asc' });
    });
  });

  it('changes sort parameters when a sortable header is clicked', async () => {
    renderPage();
    await waitForRules();

    const enabledHeader = screen.getByRole('columnheader', { name: /^enabled$/i });
    fireEvent.click(within(enabledHeader).getByRole('button'));

    await waitFor(() => {
      expect(lastFindItemsArgs().sort).toEqual({ field: 'enabled', direction: 'asc' });
    });
  });

  it('toggles sort direction when the same header is clicked twice', async () => {
    renderPage();
    await waitForRules();

    const enabledHeader = screen.getByRole('columnheader', { name: /^enabled$/i });
    fireEvent.click(within(enabledHeader).getByRole('button'));

    await waitFor(() => {
      expect(lastFindItemsArgs().sort).toEqual({ field: 'enabled', direction: 'asc' });
    });

    fireEvent.click(within(enabledHeader).getByRole('button'));

    await waitFor(() => {
      expect(lastFindItemsArgs().sort).toEqual({ field: 'enabled', direction: 'desc' });
    });
  });

  it('opens create rule options in a flyout when create button is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('createRuleButton')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('createRuleButton'));

    expect(screen.getByTestId('ruleCreateOptionsFlyout')).toBeInTheDocument();
    expect(screen.getByText('ES|QL rule')).toBeInTheDocument();
    expect(mockNavigateToUrl).not.toHaveBeenCalled();
  });

  it('closes create rule options flyout without navigating', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('createRuleButton')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('createRuleButton'));
    fireEvent.click(screen.getByTestId('ruleCreateOptionsFlyoutCloseButton'));

    expect(screen.queryByTestId('ruleCreateOptionsFlyout')).not.toBeInTheDocument();
    expect(screen.getByTestId('rulesListTable')).toBeInTheDocument();
    expect(mockNavigateToUrl).not.toHaveBeenCalled();
  });

  it('opens the rule creation flow from the create rule options flyout', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('createRuleButton')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('createRuleButton'));
    fireEvent.click(screen.getByTestId('createEsqlRuleCard'));

    expect(screen.queryByTestId('ruleCreateOptionsFlyout')).not.toBeInTheDocument();
    expect(screen.getByTestId('composeDiscoverFlyout')).toBeInTheDocument();
    expect(mockNavigateToUrl).not.toHaveBeenCalled();
  });

  it('stays on the rules list after creating a rule from the flyout', async () => {
    mockCreateRuleMutate.mockImplementationOnce((_payload, options) =>
      options?.onSuccess?.({ id: 'rule-1', metadata: { name: 'Test Rule' } })
    );

    renderPage();
    await waitFor(() => expect(screen.getByTestId('createRuleButton')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('createRuleButton'));
    fireEvent.click(screen.getByTestId('createEsqlRuleCard'));
    fireEvent.click(screen.getByTestId('composeDiscoverFlyout'));

    expect(mockCreateRuleMutate).toHaveBeenCalledWith(
      { payload: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(screen.queryByTestId('composeDiscoverFlyout')).not.toBeInTheDocument();
    expect(screen.getByTestId('rulesListTable')).toBeInTheDocument();
    expect(mockNavigateToUrl).not.toHaveBeenCalled();
  });

  it('opens the rule creation flow from the split button dropdown', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('createRuleButton-secondary-button')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('createRuleButton-secondary-button'));

    await waitFor(() => {
      expect(screen.getByTestId('createEsqlRuleButton')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('createEsqlRuleButton'));

    expect(screen.getByTestId('composeDiscoverFlyout')).toBeInTheDocument();
  });

  it('opens agent chat when "Create with agent" is clicked in the split button dropdown', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('createRuleButton-secondary-button')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('createRuleButton-secondary-button'));

    await waitFor(() => {
      expect(screen.getByTestId('createWithAgentButton')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('createWithAgentButton'));

    expect(mockNavigateToApp).toHaveBeenCalledWith('agent_builder', {
      path: '/agents/elastic-ai-agent/conversations/new',
      state: { initialMessage: CREATE_WITH_AGENT_INITIAL_PROMPT },
    });
  });

  it('disables the split button agent option (does not hide it) when agent builder is not available', async () => {
    mockAgentBuilderShow = false;
    mockExperimentalFeaturesEnabled = false;

    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('createRuleButton-secondary-button')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('createRuleButton-secondary-button'));

    await waitFor(() => {
      expect(screen.getByTestId('createEsqlRuleButton')).toBeInTheDocument();
    });

    const agentButton = screen.getByTestId('createWithAgentButton');
    expect(agentButton).toBeInTheDocument();
    expect(agentButton).toBeDisabled();

    fireEvent.click(agentButton);
    expect(mockNavigateToApp).not.toHaveBeenCalled();
  });

  it('disables the empty state agent card (does not hide it) when agent builder is not available', async () => {
    mockAgentBuilderShow = false;
    mockExperimentalFeaturesEnabled = false;
    resolveRules([], 0);

    renderPage();

    await waitFor(() => expect(screen.getByTestId('createEsqlRuleCard')).toBeInTheDocument());
    const agentCard = screen.getByTestId('createWithAgentCard');
    expect(agentCard).toBeInTheDocument();
    expect(agentCard).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows delete confirmation modal when delete action is clicked', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));
    fireEvent.click(screen.getByTestId('deleteRule-rule-1'));

    await waitFor(() => {
      expect(screen.getByTestId('deleteRuleConfirmationModal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('deleteRuleConfirmationModal')).toHaveTextContent(/Rule One/);
  });

  it('calls deleteRule mutation when delete is confirmed', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));
    fireEvent.click(screen.getByTestId('deleteRule-rule-1'));

    await waitFor(() => {
      expect(screen.getByTestId('deleteRuleConfirmationModal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      { id: 'rule-1', name: 'Rule One' },
      expect.objectContaining({
        onSettled: expect.any(Function),
      })
    );
  });

  it('renders the Enabled column with switches reflecting each rule state', async () => {
    renderPage();
    await waitForRules();

    expect(screen.getByTestId('ruleEnabledSwitch-rule-1')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('ruleEnabledSwitch-rule-2')).toHaveAttribute('aria-checked', 'false');
  });

  it('calls toggleEnabledMutation when the Enabled switch is clicked', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('ruleEnabledSwitch-rule-1'));

    expect(mockToggleEnabledMutate).toHaveBeenCalledWith({ id: 'rule-1', enabled: false });
  });

  it('shows "Clone" action in the context menu', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));

    await waitFor(() => {
      expect(screen.getByTestId('cloneRule-rule-1')).toHaveTextContent('Clone');
    });
  });

  it('opens the clone flyout when clone is clicked', async () => {
    renderPage();
    await waitForRules();

    fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));
    fireEvent.click(screen.getByTestId('cloneRule-rule-1'));

    expect(screen.getByTestId('composeDiscoverFlyout')).toBeInTheDocument();
  });

  describe('selection', () => {
    it('renders selection checkboxes for each row', async () => {
      renderPage();
      await waitForRules();

      expect(rowCheckbox('rule-1')).toBeInTheDocument();
      expect(rowCheckbox('rule-2')).toBeInTheDocument();
    });

    it('does not show selected count or clear button when no rules are selected', async () => {
      renderPage();
      await waitForRules();

      expect(screen.queryByTestId('bulkActionsButton')).not.toBeInTheDocument();
      expect(screen.queryByTestId('clearSelectionButton')).not.toBeInTheDocument();
    });

    it('shows selected count when rules are selected', async () => {
      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toBeInTheDocument();
        expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('1 Selected');
      });
    });

    it('shows clear selection button when rules are selected', async () => {
      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('clearSelectionButton')).toBeInTheDocument();
      });
    });

    it('updates selected count when selecting multiple rules', async () => {
      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));
      fireEvent.click(rowCheckbox('rule-2'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('2 Selected');
      });
    });

    it('clears selection when clear button is clicked', async () => {
      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('clearSelectionButton'));

      await waitFor(() => {
        expect(screen.queryByTestId('bulkActionsButton')).not.toBeInTheDocument();
        expect(screen.queryByTestId('clearSelectionButton')).not.toBeInTheDocument();
      });
    });

    it('selects all rules on the page when header checkbox is clicked', async () => {
      renderPage();
      await waitForRules();

      fireEvent.click(screen.getByTestId('selectAllRulesOnPage'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('2 Selected');
      });
    });

    it('folds deselected rows into a NOT exclusion under select-all', async () => {
      resolveRules(mockRules, 40);
      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));
      fireEvent.click(await screen.findByTestId('selectAllRulesButton'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('40 Selected');
      });

      fireEvent.click(rowCheckbox('rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('39 Selected');
      });

      fireEvent.click(screen.getByTestId('bulkActionsButton'));
      fireEvent.click(await screen.findByTestId('bulkEnableRules'));

      expect(mockBulkEnableMutate).toHaveBeenCalledWith(
        {
          mode: 'by_query',
          filter: 'NOT (id: "rule-1")',
        },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });

    it('keeps select-all selection after pagination', async () => {
      const page2 = [
        createRule({
          id: 'rule-3',
          metadata: { name: 'Rule Three', tags: [] as string[], version: 1 },
        }),
        createRule({
          id: 'rule-4',
          metadata: { name: 'Rule Four', tags: [] as string[], version: 1 },
        }),
      ];

      mockFindItems.mockImplementation(async ({ page }: { page: { index: number } }) => {
        const items = page.index === 0 ? mockRules : page2;
        return { items: items.map(toListItem), total: 40 };
      });

      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));
      fireEvent.click(await screen.findByTestId('selectAllRulesButton'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('40 Selected');
      });

      fireEvent.click(await screen.findByTestId('pagination-button-next'));

      await waitFor(() => {
        expect(screen.getByText('Rule Three')).toBeInTheDocument();
      });

      expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('40 Selected');
      expect(rowCheckbox('rule-3')).toBeChecked();
      expect(rowCheckbox('rule-4')).toBeChecked();
    });
  });

  describe('when the user only has read privilege', () => {
    beforeEach(() => {
      mockCanWriteRules = false;
      mockCanWriteActionPolicies = false;
    });

    it('hides the centralized action policies banner', async () => {
      renderPage();
      await waitForRules();

      expect(screen.queryByTestId('centralizedActionPoliciesBanner')).not.toBeInTheDocument();
    });

    it('hides the header create controls even when rules exist', async () => {
      renderPage();
      await waitForRules();

      expect(screen.getByTestId('rulesListTable')).toBeInTheDocument();
      expect(screen.queryByTestId('createRuleButton')).not.toBeInTheDocument();
    });

    it('shows a read-only empty prompt (not the create panel) when there are no rules', async () => {
      resolveRules([], 0);
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('rulesListReadOnlyEmpty')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('createEsqlRuleCard')).not.toBeInTheDocument();
    });

    it('hides row selection and quick edit', async () => {
      renderPage();
      await waitForRules();

      expect(screen.queryByTestId('selectAllRulesOnPage')).not.toBeInTheDocument();
      expect(screen.queryByTestId('checkboxSelectRow-rule-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quickEditRule-rule-1')).not.toBeInTheDocument();
    });

    it('hides the enabled switch and shows a read-only status badge instead', async () => {
      renderPage();
      await waitForRules();

      expect(screen.queryByTestId('ruleEnabledSwitch-rule-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('ruleEnabledBadge-rule-1')).toHaveTextContent('Enabled');
    });
  });

  describe('bulk actions menu', () => {
    const selectFirstRuleAndOpenMenu = async () => {
      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkActionsButton'));
    };

    it('opens context menu with enable, disable, and delete options', async () => {
      await selectFirstRuleAndOpenMenu();

      await waitFor(() => {
        expect(screen.getByTestId('bulkEnableRules')).toBeInTheDocument();
        expect(screen.getByTestId('bulkDisableRules')).toBeInTheDocument();
        expect(screen.getByTestId('bulkDeleteRules')).toBeInTheDocument();
      });
    });

    it('shows bulk delete confirmation modal when delete is clicked', async () => {
      await selectFirstRuleAndOpenMenu();

      await waitFor(() => {
        expect(screen.getByTestId('bulkDeleteRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkDeleteRules'));

      await waitFor(() => {
        expect(screen.getByTestId('deleteRuleConfirmationModal')).toBeInTheDocument();
        expect(screen.getByTestId('deleteRuleConfirmationModal')).toHaveTextContent(/1 rule/);
      });

      expect(mockBulkDeleteMutate).not.toHaveBeenCalled();
    });

    it('calls bulkDeleteRules when bulk delete is confirmed', async () => {
      await selectFirstRuleAndOpenMenu();

      await waitFor(() => {
        expect(screen.getByTestId('bulkDeleteRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkDeleteRules'));

      await waitFor(() => {
        expect(screen.getByTestId('deleteRuleConfirmationModal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

      expect(mockBulkDeleteMutate).toHaveBeenCalledWith(
        { mode: 'by_ids', ids: ['rule-1'] },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
      );
    });

    it('dismisses bulk delete modal on cancel', async () => {
      await selectFirstRuleAndOpenMenu();

      await waitFor(() => {
        expect(screen.getByTestId('bulkDeleteRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkDeleteRules'));

      await waitFor(() => {
        expect(screen.getByTestId('deleteRuleConfirmationModal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByTestId('deleteRuleConfirmationModal')).not.toBeInTheDocument();
      });
    });

    it('calls bulkEnableRules with selected ids when enable is clicked', async () => {
      await selectFirstRuleAndOpenMenu();

      await waitFor(() => {
        expect(screen.getByTestId('bulkEnableRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkEnableRules'));

      expect(mockBulkEnableMutate).toHaveBeenCalledWith(
        { mode: 'by_ids', ids: ['rule-1'] },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });

    it('calls bulkDisableRules with selected ids when disable is clicked', async () => {
      await selectFirstRuleAndOpenMenu();

      await waitFor(() => {
        expect(screen.getByTestId('bulkDisableRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkDisableRules'));

      expect(mockBulkDisableMutate).toHaveBeenCalledWith(
        { mode: 'by_ids', ids: ['rule-1'] },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });

    it('shows correct count in bulk delete modal when multiple rules are selected', async () => {
      renderPage();
      await waitForRules();

      fireEvent.click(rowCheckbox('rule-1'));
      fireEvent.click(rowCheckbox('rule-2'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('2 Selected');
      });

      fireEvent.click(screen.getByTestId('bulkActionsButton'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkDeleteRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkDeleteRules'));

      await waitFor(() => {
        expect(screen.getByTestId('deleteRuleConfirmationModal')).toHaveTextContent(/2 rules/);
      });

      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

      expect(mockBulkDeleteMutate).toHaveBeenCalledWith(
        { mode: 'by_ids', ids: expect.arrayContaining(['rule-1', 'rule-2']) },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
      );
    });

    it('closes the popover after clicking a bulk action', async () => {
      await selectFirstRuleAndOpenMenu();

      await waitFor(() => {
        expect(screen.getByTestId('bulkEnableRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkEnableRules'));

      await waitFor(() => {
        expect(screen.queryByTestId('bulkEnableRules')).not.toBeInTheDocument();
      });
    });
  });
});
