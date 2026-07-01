/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Route } from '@kbn/shared-ux-router';
import { render, screen } from '@testing-library/react';
import { AddPrebuiltRulesTable } from './add_prebuilt_rules_table';
import { AddPrebuiltRulesHeaderButtons } from './add_prebuilt_rules_header_buttons';
import { AddPrebuiltRulesTableContextProvider } from './add_prebuilt_rules_table_context';

import { RULES_ADD_PATH } from '../../../../../../common/constants';
import type { RuleResponse } from '../../../../../../common/api/detection_engine/model/rule_schema';
import { useFindInstalledPrebuiltRuleByRuleId } from '../../../../rule_management/logic/use_find_installed_prebuilt_rule_by_rule_id';
import { usePrebuiltRulesInstallReview } from '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_install_review';
import { useFetchPrebuiltRulesStatusQuery } from '../../../../rule_management/api/hooks/prebuilt_rules/use_fetch_prebuilt_rules_status_query';
import { useSecuritySolutionInitialization } from '../../../../../common/components/initialization/use_security_solution_initialization';
import { INITIALIZATION_FLOW_INIT_PREBUILT_RULES } from '../../../../../../common/api/initialization';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { initialUserPrivilegesState } from '../../../../../common/components/user_privileges/user_privileges_context';

// Render an identifiable stand-in for the flyout so deep-link tests can assert which rule opened
// and exercise the install actions.
jest.mock('../../../../rule_management/components/rule_details/rule_details_flyout', () => ({
  RuleDetailsFlyout: jest.fn(({ rule, ruleActions }) => (
    <div data-test-subj="rule-details-flyout">
      <span data-test-subj="flyout-rule-name">{rule?.name}</span>
      {ruleActions}
    </div>
  )),
}));
jest.mock('../rules_changelog_link', () => ({
  RulesChangelogLink: jest.fn(() => <></>),
}));
jest.mock('./add_prebuilt_rules_table_filters', () => ({
  AddPrebuiltRulesTableFilters: jest.fn(() => <></>),
}));

jest.mock('../../../../rule_management/logic/prebuilt_rules/use_perform_rule_install', () => ({
  usePerformInstallAllRules: () => ({
    performInstallAll: jest.fn(),
    isLoading: false,
  }),
  usePerformInstallSpecificRules: () => ({
    performInstallSpecific: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('../../../../../common/lib/kibana', () => ({
  useUiSetting$: jest.fn().mockReturnValue([false]),
  useKibana: jest.fn().mockReturnValue({
    services: {
      docLinks: { links: { siem: { ruleChangeLog: '' } } },
    },
  }),
}));

jest.mock('../../../../../common/components/links', () => ({
  useGetSecuritySolutionLinkProps: () =>
    jest.fn().mockReturnValue({
      onClick: jest.fn(),
    }),
}));

jest.mock(
  '../../../../rule_management/api/hooks/prebuilt_rules/use_fetch_prebuilt_rules_status_query',
  () => ({
    useFetchPrebuiltRulesStatusQuery: jest.fn().mockReturnValue({
      data: {
        prebuiltRulesStatus: {
          num_prebuilt_rules_total_in_package: 1,
        },
      },
    }),
    useInvalidateFetchPrebuiltRulesStatusQuery: jest.fn().mockReturnValue(jest.fn()),
  })
);

jest.mock(
  '../../../../../common/components/initialization/use_security_solution_initialization',
  () => ({
    useSecuritySolutionInitialization: jest.fn().mockReturnValue({
      'init-prebuilt-rules': { loading: false, result: { status: 'ready' } },
    }),
  })
);

jest.mock(
  '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_install_review',
  () => ({
    usePrebuiltRulesInstallReview: jest.fn().mockReturnValue({
      data: {
        rules: [
          {
            id: 'rule-1',
            name: 'rule-1',
            tags: [],
            risk_score: 1,
            severity: 'low',
          },
        ],
        stats: {
          num_rules_to_install: 1,
          tags: [],
        },
      },
      isLoading: false,
      isFetched: true,
    }),
  })
);

jest.mock('../../../../rule_management/logic/use_find_installed_prebuilt_rule_by_rule_id', () => ({
  useFindInstalledPrebuiltRuleByRuleId: jest.fn().mockReturnValue({
    rule: undefined,
    isFetching: false,
    isFetched: false,
  }),
}));

jest.mock('../../../../../common/components/user_privileges');

describe('AddPrebuiltRulesTable', () => {
  afterEach(() => {
    (useSecuritySolutionInitialization as jest.Mock).mockReturnValue({
      [INITIALIZATION_FLOW_INIT_PREBUILT_RULES]: { loading: false, result: { status: 'ready' } },
    });
  });

  it('disables `Install all` button if user has no write permissions', async () => {
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        ...initialUserPrivilegesState().rulesPrivileges,
        rules: { read: true, edit: false },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AddPrebuiltRulesTableContextProvider>
            <AddPrebuiltRulesHeaderButtons />
            <AddPrebuiltRulesTable />
          </AddPrebuiltRulesTableContextProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const installAllButton = screen.getByTestId('installAllRulesButton');

    expect(installAllButton).toHaveTextContent('Install all');
    expect(installAllButton).toBeDisabled();
  });

  it('disables `Install all` button if prebuilt package is being installed', async () => {
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        ...initialUserPrivilegesState().rulesPrivileges,
        rules: { read: true, edit: true },
      },
    });

    (useSecuritySolutionInitialization as jest.Mock).mockReturnValue({
      [INITIALIZATION_FLOW_INIT_PREBUILT_RULES]: { loading: true },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AddPrebuiltRulesTableContextProvider>
            <AddPrebuiltRulesHeaderButtons />
            <AddPrebuiltRulesTable />
          </AddPrebuiltRulesTableContextProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const installAllButton = screen.getByTestId('installAllRulesButton');

    expect(installAllButton).toHaveTextContent('Install all');
    expect(installAllButton).toBeDisabled();
  });

  it('enables Install all` button when user has permissions', async () => {
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        ...initialUserPrivilegesState().rulesPrivileges,
        rules: { read: true, edit: true },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AddPrebuiltRulesTableContextProvider>
            <AddPrebuiltRulesHeaderButtons />
            <AddPrebuiltRulesTable />
          </AddPrebuiltRulesTableContextProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const installAllButton = screen.getByTestId('installAllRulesButton');

    expect(installAllButton).toHaveTextContent('Install all');
    expect(installAllButton).toBeEnabled();
  });

  it.each([
    ['Rule:Read', true],
    ['Rule:Write', false],
  ])(
    `renders "No rules available for install" when there are no rules to install and user has %s`,
    async (_permissions, canEdit) => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        ...initialUserPrivilegesState(),
        rulesPrivileges: {
          ...initialUserPrivilegesState().rulesPrivileges,
          rules: { read: true, edit: canEdit },
        },
      });

      (usePrebuiltRulesInstallReview as jest.Mock).mockReturnValueOnce({
        data: {
          rules: [],
          stats: {
            num_rules_to_install: 0,
            tags: [],
          },
        },
        isLoading: false,
        isFetched: true,
      });
      (useFetchPrebuiltRulesStatusQuery as jest.Mock).mockReturnValueOnce({
        data: {
          prebuiltRulesStatus: {
            num_prebuilt_rules_total_in_package: 0,
          },
        },
      });

      const { findByText } = render(
        <MemoryRouter>
          <QueryClientProvider client={new QueryClient()}>
            <AddPrebuiltRulesTableContextProvider>
              <AddPrebuiltRulesTable />
            </AddPrebuiltRulesTableContextProvider>
          </QueryClientProvider>
        </MemoryRouter>
      );

      expect(await findByText('All Elastic rules have been installed')).toBeInTheDocument();
    }
  );

  it('does not render `Install rule` on rule rows for users with no write permissions', async () => {
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        ...initialUserPrivilegesState().rulesPrivileges,
        rules: { read: true, edit: false },
      },
    });

    const id = 'rule-1';
    (usePrebuiltRulesInstallReview as jest.Mock).mockReturnValueOnce({
      data: {
        rules: [
          {
            id,
            rule_id: id,
            name: 'rule-1',
            tags: [],
            risk_score: 1,
            severity: 'low',
          },
        ],
        stats: {
          num_rules_to_install: 1,
          tags: [],
        },
      },
      isLoading: false,
      isFetched: true,
    });
    (useFetchPrebuiltRulesStatusQuery as jest.Mock).mockReturnValueOnce({
      data: {
        prebuiltRulesStatus: {
          num_prebuilt_rules_total_in_package: 1,
        },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AddPrebuiltRulesTableContextProvider>
            <AddPrebuiltRulesTable />
          </AddPrebuiltRulesTableContextProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const installRuleButton = screen.queryByTestId(`installSinglePrebuiltRuleButton-${id}`);

    expect(installRuleButton).not.toBeInTheDocument();
  });

  it('renders `Install rule` on rule rows for users with write permissions', async () => {
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        ...initialUserPrivilegesState().rulesPrivileges,
        rules: { read: true, edit: true },
      },
    });

    const id = 'rule-1';
    (usePrebuiltRulesInstallReview as jest.Mock).mockReturnValueOnce({
      data: {
        rules: [
          {
            id,
            rule_id: id,
            name: 'rule-1',
            tags: [],
            risk_score: 1,
            severity: 'low',
          },
        ],
        stats: {
          num_rules_to_install: 1,
          tags: [],
        },
      },
      isLoading: false,
      isFetched: true,
    });
    (useFetchPrebuiltRulesStatusQuery as jest.Mock).mockReturnValueOnce({
      data: {
        prebuiltRulesStatus: {
          num_prebuilt_rules_total_in_package: 1,
        },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AddPrebuiltRulesTableContextProvider>
            <AddPrebuiltRulesTable />
          </AddPrebuiltRulesTableContextProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const installRuleButton = screen.queryByTestId(`installSinglePrebuiltRuleButton-${id}`);

    expect(installRuleButton).toBeInTheDocument();
    expect(installRuleButton).toBeEnabled();
  });
});

describe('AddPrebuiltRulesTable deep linking', () => {
  interface MockedInstallReview {
    data?: { rules: RuleResponse[]; stats: { num_rules_to_install: number; tags: string[] } };
    isLoading: boolean;
    isFetching: boolean;
    isFetched: boolean;
  }

  const makeRule = (ruleId: string): RuleResponse =>
    ({ rule_id: ruleId, name: `Rule ${ruleId}` } as unknown as RuleResponse);

  const settledWith = (rules: RuleResponse[]): MockedInstallReview => ({
    data: { rules, stats: { num_rules_to_install: rules.length, tags: [] } },
    isLoading: false,
    isFetching: false,
    isFetched: true,
  });

  // The install-review hook backs both the table query and the by-rule_id deep-link query; tell
  // them apart by the `ruleIds` param the deep-link query passes.
  const mockInstallReview = (
    tableReview: MockedInstallReview,
    deepLinkReview: MockedInstallReview
  ) => {
    (usePrebuiltRulesInstallReview as jest.Mock).mockImplementation(
      (params: { ruleIds?: string[] }) => (params.ruleIds ? deepLinkReview : tableReview)
    );
  };

  const mockInstalledFallback = (rule: RuleResponse | undefined) => {
    (useFindInstalledPrebuiltRuleByRuleId as jest.Mock).mockReturnValue({
      rule,
      isFetching: false,
      isFetched: true,
    });
  };

  const renderAt = (entry: string) =>
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Route path={`${RULES_ADD_PATH}/:ruleId?`}>
          <QueryClientProvider client={new QueryClient()}>
            <AddPrebuiltRulesTableContextProvider>
              <></>
            </AddPrebuiltRulesTableContextProvider>
          </QueryClientProvider>
        </Route>
      </MemoryRouter>
    );

  beforeEach(() => {
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        ...initialUserPrivilegesState().rulesPrivileges,
        rules: { read: true, edit: true },
      },
    });
    mockInstallReview(settledWith([]), settledWith([]));
    mockInstalledFallback(undefined);
  });

  it('opens the preview flyout for a rule fetched by rule_id', async () => {
    mockInstallReview(settledWith([]), settledWith([makeRule('rule-1')]));

    renderAt(`${RULES_ADD_PATH}/rule-1`);

    expect(await screen.findByTestId('rule-details-flyout')).toBeInTheDocument();
    expect(screen.getByTestId('flyout-rule-name')).toHaveTextContent('Rule rule-1');
  });

  it('does not open the flyout while the deep-link resolution is still fetching', () => {
    // Table settled, but the by-rule_id lookup hasn't returned — must not open yet.
    mockInstallReview(settledWith([]), {
      data: undefined,
      isLoading: true,
      isFetching: true,
      isFetched: false,
    });

    renderAt(`${RULES_ADD_PATH}/rule-1`);

    expect(screen.queryByTestId('rule-details-flyout')).not.toBeInTheDocument();
  });

  it('opens the flyout with install actions disabled for an already-installed rule', async () => {
    // Rule not in the installable catalog -> fall back to the installed rule.
    mockInstallReview(settledWith([]), settledWith([]));
    mockInstalledFallback(makeRule('rule-1'));

    renderAt(`${RULES_ADD_PATH}/rule-1`);

    expect(await screen.findByTestId('rule-details-flyout')).toBeInTheDocument();
    expect(screen.getByTestId('installPrebuiltRuleFromFlyoutButton')).toBeDisabled();
    expect(screen.getByTestId('installAndEnablePrebuiltRuleFromFlyoutButton')).toBeDisabled();
  });

  it('does not open the flyout when the rule is not found anywhere', () => {
    // Settled everywhere with no hit: deepLinkedRule stays undefined, so openRulePreview — which
    // would throw on a missing rule — is never called.
    mockInstallReview(settledWith([]), settledWith([]));
    mockInstalledFallback(undefined);

    renderAt(`${RULES_ADD_PATH}/missing-rule`);

    expect(screen.queryByTestId('rule-details-flyout')).not.toBeInTheDocument();
  });

  it('does not open the flyout when there is no rule_id in the URL', () => {
    mockInstallReview(settledWith([]), settledWith([makeRule('rule-1')]));

    renderAt(RULES_ADD_PATH);

    expect(screen.queryByTestId('rule-details-flyout')).not.toBeInTheDocument();
  });
});
