/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { DashboardsTable } from './dashboards_table';
import { TestProviders } from '../../common/mock';

// mock lodash debounce to speed up the test
jest.mock('lodash', () => ({ ...jest.requireActual('lodash'), debounce: (fn: () => void) => fn }));

const DASHBOARD_TABLE_ITEMS = [
  {
    id: 'id 1',
    title: 'first dashboard title',
    description: 'desc 1',
  },
  {
    id: 'id 2',
    title: 'second dashboard_title',
    description: 'desc 2',
  },
  {
    id: 'id 3',
    title: 'different title',
    description: 'different-desc',
  },
];

const mockUseSecurityDashboardsTableItems = jest.fn(() => ({
  items: DASHBOARD_TABLE_ITEMS,
  isLoading: false,
}));
jest.mock('../hooks/use_security_dashboards_table', () => {
  const actual = jest.requireActual('../hooks/use_security_dashboards_table');
  return {
    ...actual,
    useSecurityDashboardsTableItems: () => mockUseSecurityDashboardsTableItems(),
  };
});

const renderDashboardTable = () => render(<DashboardsTable />, { wrapper: TestProviders });

describe('Dashboards table', () => {
  it('should render dashboards table rows', () => {
    const result = renderDashboardTable();

    expect(mockUseSecurityDashboardsTableItems).toHaveBeenCalled();

    expect(result.queryAllByTestId('dashboardTableTitleCell')).toHaveLength(3);

    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].description)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[1].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[1].description)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[2].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[2].description)).toBeInTheDocument();
  });

  it('should filter two rows using the search box', () => {
    const result = renderDashboardTable();

    const input = result.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'dashboard' } });

    expect(result.queryAllByTestId('dashboardTableTitleCell')).toHaveLength(2);

    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].description)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[1].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[1].description)).toBeInTheDocument();
  });

  it('should filter only one row using the search box', () => {
    const result = renderDashboardTable();

    const input = result.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: DASHBOARD_TABLE_ITEMS[0].title } });

    expect(result.queryAllByTestId('dashboardTableTitleCell')).toHaveLength(1);

    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].description)).toBeInTheDocument();
  });

  it('should filter by description using the search box', () => {
    const result = renderDashboardTable();

    const input = result.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: DASHBOARD_TABLE_ITEMS[0].description } });

    expect(result.queryAllByTestId('dashboardTableTitleCell')).toHaveLength(1);
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].description)).toBeInTheDocument();
  });

  it('should filter with case insensitive text using the search box', () => {
    const result = renderDashboardTable();

    const input = result.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: DASHBOARD_TABLE_ITEMS[0].title.toUpperCase() } });

    expect(result.queryAllByTestId('dashboardTableTitleCell')).toHaveLength(1);
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[0].description)).toBeInTheDocument();
  });

  it('should filter out special characters except hyphens & underscores', () => {
    const result = renderDashboardTable();

    const input = result.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: '"_title"' } });

    expect(result.queryAllByTestId('dashboardTableTitleCell')).toHaveLength(1);
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[1].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[1].description)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "'-desc'" } });

    expect(result.queryAllByTestId('dashboardTableTitleCell')).toHaveLength(1);
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[2].title)).toBeInTheDocument();
    expect(result.queryByText(DASHBOARD_TABLE_ITEMS[2].description)).toBeInTheDocument();
  });
});
