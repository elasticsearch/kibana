/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import React from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react';

import { SecurityPageName } from '../../../../../common/constants';
import { TestProviders } from '../../../../common/mock';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import type { RuleAlertsTableProps } from './rule_alerts_table';
import { RuleAlertsTable } from './rule_alerts_table';
import type { RuleAlertsItem, UseRuleAlertsItems } from './use_rule_alerts_items';

const mockGetAppUrl = jest.fn();
const mockNavigateTo = jest.fn();
jest.mock('../../../../common/lib/kibana/hooks', () => {
  const original = jest.requireActual('../../../../common/lib/kibana/hooks');
  return {
    ...original,
    useNavigation: () => ({
      getAppUrl: mockGetAppUrl,
      navigateTo: mockNavigateTo,
    }),
  };
});

const mockNavigateToAlertsPageWithFilters = jest.fn();
jest.mock('../../../../common/hooks/use_navigate_to_alerts_page_with_filters', () => {
  return {
    useNavigateToAlertsPageWithFilters: () => mockNavigateToAlertsPageWithFilters,
  };
});

jest.mock('../../../../common/hooks/use_global_filter_query', () => {
  return {
    useGlobalFilterQuery: () => ({}),
  };
});

type UseRuleAlertsItemsReturn = ReturnType<UseRuleAlertsItems>;
const defaultUseRuleAlertsItemsReturn: UseRuleAlertsItemsReturn = {
  items: [],
  isLoading: false,
  updatedAt: Date.now(),
};
const mockUseRuleAlertsItems = jest.fn(() => defaultUseRuleAlertsItemsReturn);
const mockUseRuleAlertsItemsReturn = (param: Partial<UseRuleAlertsItemsReturn>) => {
  mockUseRuleAlertsItems.mockReturnValueOnce({ ...defaultUseRuleAlertsItemsReturn, ...param });
};
jest.mock('./use_rule_alerts_items', () => ({
  useRuleAlertsItems: () => mockUseRuleAlertsItems(),
}));
jest.mock('../../../../common/components/user_privileges');

const defaultProps: RuleAlertsTableProps = {
  signalIndexName: '',
};
const ruleName = 'ruleName';
const items: RuleAlertsItem[] = [
  {
    id: 'ruleId',
    name: ruleName,
    last_alert_at: moment().subtract(1, 'day').format(),
    alert_count: 10,
    severity: 'high',
  },
];

describe('RuleAlertsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render empty table', () => {
    const result = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    expect(result.getByTestId('severityRuleAlertsPanel')).toBeInTheDocument();
    expect(result.getByText('No alerts to display')).toBeInTheDocument();
    expect(result.getByTestId('severityRuleAlertsButton')).toBeInTheDocument();
  });

  it('should render a loading table', () => {
    mockUseRuleAlertsItemsReturn({ isLoading: true });
    const result = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    expect(result.getByText('Updating...')).toBeInTheDocument();
    expect(result.getByTestId('severityRuleAlertsButton')).toBeInTheDocument();
    expect(result.getByTestId('severityRuleAlertsTable')).toHaveClass('euiBasicTable-loading');
  });

  it('should render the updated at subtitle', () => {
    mockUseRuleAlertsItemsReturn({ isLoading: false });
    const result = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    expect(result.getByText(/Updated/)).toBeInTheDocument();
  });

  it('should render the table columns', () => {
    mockUseRuleAlertsItemsReturn({ items });
    const result = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    const columnHeaders = result.getAllByTestId(/tableHeaderCell_/);
    expect(columnHeaders.at(0)).toHaveTextContent('Rule name');
    expect(columnHeaders.at(1)).toHaveTextContent('Last alert');
    expect(columnHeaders.at(2)).toHaveTextContent('Alert count');
    expect(columnHeaders.at(3)).toHaveTextContent('Severity');
  });

  it('should render the table items', () => {
    mockUseRuleAlertsItemsReturn({ items });
    const result = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    expect(result.getByTestId('severityRuleAlertsTable-name')).toHaveTextContent('ruleName');
    expect(result.getByTestId('severityRuleAlertsTable-lastAlertAt')).toHaveTextContent(
      'yesterday'
    );
    expect(result.getByTestId('severityRuleAlertsTable-alertCount')).toHaveTextContent('10');
    expect(result.getByTestId('severityRuleAlertsTable-severity')).toHaveTextContent('High');
  });

  it('generates a disabled rule link when the user does not have read rule permissions', () => {
    const linkUrl = '/fake/link';
    mockGetAppUrl.mockReturnValue(linkUrl);
    mockUseRuleAlertsItemsReturn({ items });

    const result = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    expect(mockGetAppUrl).toBeCalledWith({
      deepLinkId: SecurityPageName.rules,
      path: `id/${items[0].id}`,
    });

    expect(result.getByTestId('severityRuleAlertsTable-name')).toBeDisabled();
  });

  it('generates a rule link when the user can read rules', () => {
    const linkUrl = '/fake/link';
    mockGetAppUrl.mockReturnValue(linkUrl);
    mockUseRuleAlertsItemsReturn({ items });
    (useUserPrivileges as jest.Mock).mockReturnValue({
      rulesPrivileges: {
        rules: { read: true },
      },
    });

    const result = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    expect(mockGetAppUrl).toBeCalledWith({
      deepLinkId: SecurityPageName.rules,
      path: `id/${items[0].id}`,
    });

    fireEvent.click(result.getByTestId('severityRuleAlertsTable-name'));

    expect(mockNavigateTo).toHaveBeenCalledWith({ url: linkUrl });
  });

  it('should open timeline with filters when total alerts is clicked', () => {
    mockUseRuleAlertsItemsReturn({ items });
    const { getByTestId } = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    fireEvent.click(getByTestId('severityRuleAlertsTable-alertCountLink'));

    expect(mockNavigateToAlertsPageWithFilters).toHaveBeenCalledWith({
      field_name: 'kibana.alert.rule.name',
      selected_options: ['ruleName'],
      title: 'Rule name',
    });
  });

  it('should render `View all open alerts` button which opens alert page with only status filter', async () => {
    mockUseRuleAlertsItemsReturn({ items });
    const { getByTestId } = render(
      <TestProviders>
        <RuleAlertsTable {...defaultProps} />
      </TestProviders>
    );

    expect(getByTestId('severityRuleAlertsButton')).toBeInTheDocument();

    fireEvent.click(getByTestId('severityRuleAlertsButton'));

    await waitFor(() => {
      expect(mockNavigateToAlertsPageWithFilters).toHaveBeenCalledWith({
        field_name: 'kibana.alert.workflow_status',
        title: 'Status',
        selected_options: ['open'],
      });
    });
  });
});
