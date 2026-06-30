/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type {
  UserActivityParams,
  UserActivityFilter,
  UserActivitySortOrder,
} from '../../../user_actions_activity_bar/types';
import { FilterActivity } from '../../../user_actions_activity_bar/filter_activity';
import { SortActivity } from '../../../user_actions_activity_bar/sort_activity';
import type { CaseUserActionsStats } from '../../../../containers/types';
import { SidebarToggleButton } from './sidebar_toggle_button';

interface ActivityFilterBarProps {
  params: UserActivityParams;
  userActionsStats?: CaseUserActionsStats;
  isLoading?: boolean;
  onUserActionsActivityChanged: (params: UserActivityParams) => void;
}

export const ActivityFilterBar: React.FC<ActivityFilterBarProps> = ({
  params,
  userActionsStats,
  isLoading,
  onUserActionsActivityChanged,
}) => {
  const handleFilterChange = (type: UserActivityFilter) => {
    onUserActionsActivityChanged({ ...params, type });
  };

  const handleOrderChange = (sortOrder: UserActivitySortOrder) => {
    onUserActionsActivityChanged({ ...params, sortOrder });
  };

  return (
    <EuiFlexGroup
      gutterSize="s"
      justifyContent="spaceBetween"
      data-test-subj="case-view-activity-filter-bar"
    >
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow={false}>
            <FilterActivity
              type={params.type}
              onFilterChange={handleFilterChange}
              userActionsStats={userActionsStats}
              isLoading={isLoading}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <SortActivity
              sortOrder={params.sortOrder}
              onOrderChange={handleOrderChange}
              isLoading={isLoading}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <SidebarToggleButton />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

ActivityFilterBar.displayName = 'ActivityFilterBar';
