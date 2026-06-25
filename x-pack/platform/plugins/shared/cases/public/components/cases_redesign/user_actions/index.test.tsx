/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { UserActions } from '.';
import { basicCase } from '../../../containers/mock';
import { getCaseConnectorsMockResponse } from '../../../common/mock/connectors';
import { casesConfigurationsMock } from '../../../containers/configure/mock';
import { useInfiniteFindCaseUserActions } from '../../../containers/use_infinite_find_case_user_actions';
import { useFindCaseUserActions } from '../../../containers/use_find_case_user_actions';
import { renderWithTestingProviders } from '../../../common/mock';
import type { CaseUserActionsStats } from '../../../containers/types';
import type { UserActivityParams } from '../../user_actions_activity_bar/types';

jest.mock('../../../containers/use_infinite_find_case_user_actions');
jest.mock('../../../containers/use_find_case_user_actions');
jest.mock('../../../common/lib/kibana');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ detailName: 'case-id' }),
}));

const useInfiniteFindCaseUserActionsMock = useInfiniteFindCaseUserActions as jest.Mock;
const useFindCaseUserActionsMock = useFindCaseUserActions as jest.Mock;

const userActionsStats: CaseUserActionsStats = {
  total: 5,
  totalDeletions: 0,
  totalComments: 2,
  totalCommentDeletions: 0,
  totalCommentCreations: 2,
  totalHiddenCommentUpdates: 0,
  totalOtherActions: 3,
  totalOtherActionDeletions: 0,
};

const userActivityQueryParams: UserActivityParams = {
  type: 'all',
  sortOrder: 'asc',
  page: 1,
  perPage: 10,
};

const defaultProps = {
  caseConnectors: getCaseConnectorsMockResponse(),
  data: basicCase,
  userActivityQueryParams,
  userActionsStats,
  statusActionButton: null,
  attachActionButton: null,
  currentUserProfile: undefined,
  userProfiles: new Map(),
  casesConfiguration: casesConfigurationsMock,
  onUpdateField: jest.fn(),
};

describe('UserActions (redesign)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useInfiniteFindCaseUserActionsMock.mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false,
    });
    useFindCaseUserActionsMock.mockReturnValue({
      data: { userActions: [], latestAttachments: [] },
      isLoading: false,
    });
  });

  it('renders the user actions list when loaded', async () => {
    renderWithTestingProviders(<UserActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('user-actions-list')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton while data is loading', () => {
    useInfiniteFindCaseUserActionsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false,
    });
    useFindCaseUserActionsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderWithTestingProviders(<UserActions {...defaultProps} />);

    expect(screen.getByTestId('user-actions-loading')).toBeInTheDocument();
  });

  it('renders the comment list container', async () => {
    renderWithTestingProviders(<UserActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('user-actions-list')).toBeInTheDocument();
    });
  });
});
