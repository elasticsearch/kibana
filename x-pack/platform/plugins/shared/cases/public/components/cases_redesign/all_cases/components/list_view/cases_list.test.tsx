/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { noCreateCasesPermissions, renderWithTestingProviders } from '../../../../../common/mock';
import { CasesList } from './cases_list';
import { basicCase } from '../../../../../containers/mock';
import type { CasesFindResponseUI } from '../../../../../../common/ui/types';
import * as i18n from '../../translations';

jest.mock('../../../../../common/navigation/hooks');

jest.mock('./case_list_item', () => ({
  CaseListItem: ({ theCase }: { theCase: { id: string } }) => (
    <div data-test-subj={`cases-list-item-${theCase.id}`} />
  ),
}));

const mockData: CasesFindResponseUI = {
  cases: [basicCase],
  countClosedCases: 0,
  countInProgressCases: 0,
  countOpenCases: 1,
  page: 1,
  perPage: 10,
  total: 1,
};

const emptyData: CasesFindResponseUI = {
  ...mockData,
  cases: [],
  total: 0,
};

const defaultProps = {
  data: mockData,
  userProfiles: new Map(),
  isLoading: false,
  pagination: { pageIndex: 0, pageSize: 10, totalItemCount: 1 },
  onChange: jest.fn(),
  disableActions: false,
  selectedFields: [],
};

describe('CasesList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows skeleton loading when isLoading and no cases', () => {
    renderWithTestingProviders(
      <CasesList
        {...defaultProps}
        data={emptyData}
        isLoading={true}
        pagination={{ pageIndex: 0, pageSize: 10, totalItemCount: 0 }}
      />
    );

    expect(screen.getByTestId('cases-list-loading')).toBeInTheDocument();
  });

  it('shows empty prompt when no cases and not loading', () => {
    renderWithTestingProviders(
      <CasesList
        {...defaultProps}
        data={emptyData}
        pagination={{ pageIndex: 0, pageSize: 10, totalItemCount: 0 }}
      />
    );

    expect(screen.getByTestId('cases-list-empty')).toBeInTheDocument();
    expect(screen.getByText(i18n.NO_CASES)).toBeInTheDocument();
  });

  it('shows empty prompt with create button when user has create permissions', () => {
    renderWithTestingProviders(
      <CasesList
        {...defaultProps}
        data={emptyData}
        pagination={{ pageIndex: 0, pageSize: 10, totalItemCount: 0 }}
      />
    );

    expect(screen.getByTestId('cases-list-empty')).toBeInTheDocument();
    expect(screen.getByTestId('cases-list-add-case')).toBeInTheDocument();
    expect(screen.getByText(i18n.NO_CASES_BODY)).toBeInTheDocument();
  });

  it('shows read-only empty message when user lacks create permissions', () => {
    renderWithTestingProviders(
      <CasesList
        {...defaultProps}
        data={emptyData}
        pagination={{ pageIndex: 0, pageSize: 10, totalItemCount: 0 }}
      />,
      { wrapperProps: { permissions: noCreateCasesPermissions() } }
    );

    expect(screen.getByTestId('cases-list-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cases-list-add-case')).not.toBeInTheDocument();
    expect(screen.getByText(i18n.NO_CASES_BODY_READ_ONLY)).toBeInTheDocument();
  });

  it('renders list items when cases exist', () => {
    renderWithTestingProviders(<CasesList {...defaultProps} />);

    expect(screen.getByTestId('cases-list-view')).toBeInTheDocument();
    expect(screen.getByTestId(`cases-list-item-${basicCase.id}`)).toBeInTheDocument();
  });

  it('renders pagination', () => {
    renderWithTestingProviders(<CasesList {...defaultProps} />);

    expect(screen.getByTestId('cases-list-pagination')).toBeInTheDocument();
  });

  it('calls onChange with correct page params when changing items per page', async () => {
    const onChange = jest.fn();
    const manyData: CasesFindResponseUI = {
      ...mockData,
      cases: Array.from({ length: 10 }, (_, idx) => ({ ...basicCase, id: `case-${idx}` })),
      total: 25,
    };

    renderWithTestingProviders(
      <CasesList
        {...defaultProps}
        data={manyData}
        pagination={{ pageIndex: 0, pageSize: 10, totalItemCount: 25 }}
        onChange={onChange}
      />
    );

    await userEvent.click(screen.getByTestId('tablePaginationPopoverButton'));
    await userEvent.click(screen.getByTestId('tablePagination-25-rows'));

    expect(onChange).toHaveBeenCalledWith({ page: { index: 0, size: 25 } });
  });

  it('calls onChange with correct page params when changing page', async () => {
    const onChange = jest.fn();
    const manyData: CasesFindResponseUI = {
      ...mockData,
      cases: Array.from({ length: 10 }, (_, idx) => ({ ...basicCase, id: `case-${idx}` })),
      total: 25,
    };

    renderWithTestingProviders(
      <CasesList
        {...defaultProps}
        data={manyData}
        pagination={{ pageIndex: 0, pageSize: 10, totalItemCount: 25 }}
        onChange={onChange}
      />
    );

    await userEvent.click(screen.getByTestId('pagination-button-next'));

    expect(onChange).toHaveBeenCalledWith({ page: { index: 1, size: 10 } });
  });
});
