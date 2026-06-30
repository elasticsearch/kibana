/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTestingProviders } from '../../../../common/mock';
import { ActivityFilterBar } from './activity_filter_bar';
import type { UserActivityParams } from '../../../user_actions_activity_bar/types';

jest.mock('./sidebar_toggle_button', () => ({
  SidebarToggleButton: () => <div data-test-subj="case-view-sidebar-toggle" />,
}));

const defaultParams: UserActivityParams = {
  type: 'all',
  sortOrder: 'asc',
  page: 1,
  perPage: 10,
};

const userActionsStats = {
  total: 20,
  totalDeletions: 0,
  totalComments: 8,
  totalCommentDeletions: 0,
  totalCommentCreations: 8,
  totalHiddenCommentUpdates: 0,
  totalOtherActions: 12,
  totalOtherActionDeletions: 0,
};

describe('ActivityFilterBar', () => {
  const onUserActionsActivityChanged = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the filter bar', () => {
    renderWithTestingProviders(
      <ActivityFilterBar
        params={defaultParams}
        userActionsStats={userActionsStats}
        onUserActionsActivityChanged={onUserActionsActivityChanged}
      />
    );

    expect(screen.getByTestId('case-view-activity-filter-bar')).toBeInTheDocument();
  });

  it('renders the filter activity buttons', () => {
    renderWithTestingProviders(
      <ActivityFilterBar
        params={defaultParams}
        userActionsStats={userActionsStats}
        onUserActionsActivityChanged={onUserActionsActivityChanged}
      />
    );

    expect(screen.getByTestId('user-actions-filter-activity-group')).toBeInTheDocument();
  });

  it('renders the sort control', () => {
    renderWithTestingProviders(
      <ActivityFilterBar
        params={defaultParams}
        userActionsStats={userActionsStats}
        onUserActionsActivityChanged={onUserActionsActivityChanged}
      />
    );

    expect(screen.getByTestId('user-actions-sort-select')).toBeInTheDocument();
  });

  it('renders the sidebar toggle button', () => {
    renderWithTestingProviders(
      <ActivityFilterBar
        params={defaultParams}
        userActionsStats={userActionsStats}
        onUserActionsActivityChanged={onUserActionsActivityChanged}
      />
    );

    expect(screen.getByTestId('case-view-sidebar-toggle')).toBeInTheDocument();
  });

  it('calls onUserActionsActivityChanged when filter changes', async () => {
    renderWithTestingProviders(
      <ActivityFilterBar
        params={defaultParams}
        userActionsStats={userActionsStats}
        onUserActionsActivityChanged={onUserActionsActivityChanged}
      />
    );

    await userEvent.click(screen.getByTestId('user-actions-filter-activity-button-comments'));

    expect(onUserActionsActivityChanged).toHaveBeenCalledWith({
      ...defaultParams,
      type: 'user',
    });
  });

  it('calls onUserActionsActivityChanged when sort changes', async () => {
    renderWithTestingProviders(
      <ActivityFilterBar
        params={defaultParams}
        userActionsStats={userActionsStats}
        onUserActionsActivityChanged={onUserActionsActivityChanged}
      />
    );

    await userEvent.selectOptions(screen.getByTestId('user-actions-sort-select'), 'desc');

    expect(onUserActionsActivityChanged).toHaveBeenCalledWith({
      ...defaultParams,
      sortOrder: 'desc',
    });
  });
});
