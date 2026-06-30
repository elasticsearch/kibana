/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { Router } from '@kbn/shared-ux-router';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import * as React from 'react';
import { getIsExperimentalFeatureEnabled } from '../../../common/get_experimental_features';
import RulesPage from './rules_page';
import { hasShowActionsCapability } from '../../lib/capabilities';
import { useKibana } from '../../../common/lib/kibana';

jest.mock('../../../common/lib/kibana');
jest.mock('../../../common/get_experimental_features');
jest.mock('../../lib/capabilities');

jest.mock('../rules_list/components/rules_list', () => {
  return () => <div data-test-subj="rulesListComponents">{'Render Rule list component'}</div>;
});

jest.mock('../../components/rules_setting/rules_settings_flyout', () => ({
  RulesSettingsFlyout: () => (
    <div data-test-subj="rulesSettingsFlyout">{'Render Rules Settings Flyout component'}</div>
  ),
}));

jest.mock('@kbn/app-header', () => ({
  AppHeader: (props: any) => (
    <div data-test-subj="mockAppHeader">
      {props.tabs?.map((tab: any) => (
        <button key={tab.id} role="tab" data-test-subj={tab.id}>
          {tab.label}
        </button>
      ))}
      {props.menu?.primaryActionItem && (
        <button data-test-subj={props.menu.primaryActionItem.testId} />
      )}
      {props.menu?.items?.map((item: any) => (
        <button key={item.id} data-test-subj={item.testId} />
      ))}
      {props.docLink && (
        <a data-test-subj="documentationLink" href={props.docLink}>
          {'Documentation'}
        </a>
      )}
    </div>
  ),
}));

jest.mock('@kbn/ebt-tools', () => ({
  PerformanceContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@kbn/alerts-ui-shared/src/common/hooks/use_get_rule_types_permissions', () => ({
  useGetRuleTypesPermissions: jest.fn().mockReturnValue({
    authorizedToReadAnyRules: true,
    authorizedToCreateAnyRules: true,
  }),
}));

const { useGetRuleTypesPermissions } = jest.requireMock(
  '@kbn/alerts-ui-shared/src/common/hooks/use_get_rule_types_permissions'
);

const useKibanaMock = useKibana as jest.Mocked<typeof useKibana>;

const renderRulesPage = (history = createMemoryHistory({ initialEntries: ['/'] })) =>
  render(
    <IntlProvider locale="en">
      <Router history={history}>
        <QueryClientProvider client={new QueryClient()}>
          <RulesPage />
        </QueryClientProvider>
      </Router>
    </IntlProvider>
  );

describe('rulesPage', () => {
  beforeEach(() => {
    (hasShowActionsCapability as jest.Mock).mockClear();
    (getIsExperimentalFeatureEnabled as jest.Mock).mockImplementation(() => false);
    useGetRuleTypesPermissions.mockClear();
  });

  it('renders rule list components', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] });
    renderRulesPage(history);

    expect(await screen.findByTestId('rulesListComponents')).toBeInTheDocument();
  });

  it('shows the correct number of tabs', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] });
    renderRulesPage(history);

    // Just rules and logs
    expect(screen.getAllByRole('tab').length).toBe(2);
  });

  it('hides the logs tab if the read rules privilege is missing', async () => {
    useGetRuleTypesPermissions.mockReturnValue({
      authorizedToReadAnyRules: false,
    });
    const history = createMemoryHistory({ initialEntries: ['/'] });

    renderRulesPage(history);

    // Just rules
    expect(screen.getAllByRole('tab').length).toBe(1);
  });

  describe('setHeaderActions', () => {
    beforeEach(() => {
      useKibanaMock().services.application.capabilities = {
        ...useKibanaMock().services.application.capabilities,
        rulesSettings: {
          show: true,
          readFlappingSettingsUI: true,
          readQueryDelaySettingsUI: true,
        },
      };
    });

    it('should render the header actions correctly when the user is authorized to create rules', async () => {
      useGetRuleTypesPermissions.mockReturnValue({
        authorizedToReadAnyRules: true,
        authorizedToCreateAnyRules: true,
      });
      const history = createMemoryHistory({ initialEntries: ['/'] });
      renderRulesPage(history);

      expect(await screen.findByTestId('createRuleButton')).toBeInTheDocument();
      expect(await screen.findByTestId('rulesSettingsLink')).toBeInTheDocument();
      expect(await screen.findByTestId('documentationLink')).toBeInTheDocument();
    });

    it('should not render the create rule button when the user is not authorized to create rules', async () => {
      useGetRuleTypesPermissions.mockReturnValue({
        authorizedToReadAnyRules: true,
        authorizedToCreateAnyRules: false,
      });
      const history = createMemoryHistory({ initialEntries: ['/'] });
      renderRulesPage(history);

      expect(await screen.findByTestId('rulesSettingsLink')).toBeInTheDocument();
      expect(await screen.findByTestId('documentationLink')).toBeInTheDocument();
      expect(screen.queryByTestId('createRuleButton')).not.toBeInTheDocument();
    });
  });
});
