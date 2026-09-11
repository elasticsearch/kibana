/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';

import { useQueryToggle } from '../../../../common/containers/query_toggle';
import { useAllEntityStoreUsers } from '../../containers/users/use_all_entity_store_users';
import { AllUsersQueryTabBody } from './all_users_query_tab_body';
import { UsersType } from '../../store/model';
import { useExploreEntityStoreV2Enabled } from '../../../hooks/use_explore_entity_store_v2_enabled';

jest.mock('../../containers/users/use_all_entity_store_users');
jest.mock('../../../../common/containers/query_toggle');
jest.mock('../../../hooks/use_explore_entity_store_v2_enabled', () => ({
  useExploreEntityStoreV2Enabled: jest.fn(() => false),
}));

const mockSearch = jest.fn();

jest.mock('../../../../common/containers/use_search_strategy', () => {
  const original = jest.requireActual('../../../../common/containers/use_search_strategy');
  return {
    ...original,
    useSearchStrategy: () => ({
      search: mockSearch,
      loading: false,
      inspect: {
        dsl: [],
        response: [],
      },
      result: {
        users: [],
        totalCount: 0,
        pageInfo: { activePage: 1, fakeTotalCount: 100, showMorePagesIndicator: false },
      },
      refetch: jest.fn(),
    }),
  };
});

describe('All users query tab body', () => {
  const mockUseAllEntityStoreUsers = useAllEntityStoreUsers as jest.Mock;
  const mockUseQueryToggle = useQueryToggle as jest.Mock;
  const mockUseExploreEntityStoreV2Enabled = useExploreEntityStoreV2Enabled as jest.Mock;
  const defaultProps = {
    skip: false,
    indexNames: [],
    setQuery: jest.fn(),
    startDate: '2019-06-25T04:31:59.345Z',
    endDate: '2019-06-25T06:31:59.345Z',
    type: UsersType.page,
  };

  const emptyUsersArgs = {
    users: [],
    id: 'UsersTable',
    inspect: {
      dsl: [],
      response: [],
    },
    isInspected: false,
    totalCount: 0,
    pageInfo: { activePage: 0, fakeTotalCount: 50, showMorePagesIndicator: false },
    loadPage: jest.fn(),
    refetch: jest.fn(),
    startDate: defaultProps.startDate,
    endDate: defaultProps.endDate,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAllEntityStoreUsers.mockReturnValue([false, emptyUsersArgs]);
    mockUseExploreEntityStoreV2Enabled.mockReturnValue(false);
  });

  it('calls search when toggleStatus=true and entity store v2 is disabled', () => {
    mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
    render(
      <TestProviders>
        <AllUsersQueryTabBody {...defaultProps} />
      </TestProviders>
    );
    expect(mockSearch).toHaveBeenCalled();
    expect(mockUseAllEntityStoreUsers.mock.calls[0][0].skip).toEqual(true);
  });

  it("doesn't call search when toggleStatus=false", () => {
    mockUseQueryToggle.mockReturnValue({ toggleStatus: false, setToggleStatus: jest.fn() });
    render(
      <TestProviders>
        <AllUsersQueryTabBody {...defaultProps} />
      </TestProviders>
    );
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockUseAllEntityStoreUsers.mock.calls[0][0].skip).toEqual(true);
  });

  it('skips the legacy search when entity store v2 is available', () => {
    mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
    mockUseExploreEntityStoreV2Enabled.mockReturnValue(true);
    render(
      <TestProviders>
        <AllUsersQueryTabBody {...defaultProps} />
      </TestProviders>
    );
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockUseAllEntityStoreUsers.mock.calls[0][0].skip).toEqual(false);
  });
});
