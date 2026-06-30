/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { render } from '@testing-library/react';

import { TestProviders } from '../../../../common/mock';
import { parsedCasesItems } from './mock_data';
import { CasesTable } from './cases_table';
import type { UseCaseItems } from './use_case_items';

const mockGetAppUrl = jest.fn();
jest.mock('../../../../common/lib/kibana/hooks', () => {
  const original = jest.requireActual('../../../../common/lib/kibana/hooks');
  return {
    ...original,
    useNavigation: () => ({
      getAppUrl: mockGetAppUrl,
    }),
  };
});

type UseCaseItemsReturn = ReturnType<UseCaseItems>;
const defaultCaseItemsReturn: UseCaseItemsReturn = {
  items: [],
  isLoading: false,
  updatedAt: Date.now(),
};
const mockUseCaseItems = jest.fn(() => defaultCaseItemsReturn);
const mockUseCaseItemsReturn = (overrides: Partial<UseCaseItemsReturn>) => {
  mockUseCaseItems.mockReturnValueOnce({
    ...defaultCaseItemsReturn,
    ...overrides,
  });
};

jest.mock('./use_case_items', () => ({
  useCaseItems: () => mockUseCaseItems(),
}));

const renderComponent = () =>
  render(
    <TestProviders>
      <CasesTable />
    </TestProviders>
  );

describe('CasesTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render empty table', () => {
    const { getByText, getByTestId } = renderComponent();

    expect(getByTestId('recentlyCreatedCasesPanel')).toBeInTheDocument();
    expect(getByText('No cases to display')).toBeInTheDocument();
    expect(getByTestId('allCasesButton')).toBeInTheDocument();
  });

  it('should render a loading table', () => {
    mockUseCaseItemsReturn({ isLoading: true });
    const { getByText, getByTestId } = renderComponent();

    expect(getByText('Updating...')).toBeInTheDocument();
    expect(getByTestId('allCasesButton')).toBeInTheDocument();
    expect(getByTestId('recentlyCreatedCasesTable')).toHaveClass('euiBasicTable-loading');
  });

  it('should render the updated at subtitle', () => {
    mockUseCaseItemsReturn({ isLoading: false });
    const { getByText } = renderComponent();

    expect(getByText(/Updated/)).toBeInTheDocument();
  });

  it('should render the table columns', () => {
    mockUseCaseItemsReturn({ items: parsedCasesItems });
    const { getAllByTestId } = renderComponent();

    const columnHeaders = getAllByTestId(/tableHeaderCell_/);
    expect(columnHeaders.at(0)).toHaveTextContent('Name');
    expect(columnHeaders.at(1)).toHaveTextContent('Alerts');
    expect(columnHeaders.at(2)).toHaveTextContent('Time');
    expect(columnHeaders.at(3)).toHaveTextContent('Created by');
    expect(columnHeaders.at(4)).toHaveTextContent('Status');
  });

  it('should render the table items', () => {
    mockUseCaseItemsReturn({ items: [parsedCasesItems[0]] });
    const { getByTestId } = renderComponent();

    expect(getByTestId('recentlyCreatedCaseName')).toHaveTextContent('sdcsd');
    expect(getByTestId('recentlyCreatedCaseAlert')).toHaveTextContent('1');
    expect(getByTestId('recentlyCreatedCaseTime')).toHaveTextContent('April 25, 2022');
    expect(getByTestId('recentlyCreatedCaseCreatedBy')).toHaveTextContent('elastic');
    expect(getByTestId('recentlyCreatedCaseStatus')).toHaveTextContent('Open');
  });
});
