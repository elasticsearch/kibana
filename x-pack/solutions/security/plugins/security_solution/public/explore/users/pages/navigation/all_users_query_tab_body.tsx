/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getOr, noop } from 'lodash/fp';
import React, { useEffect, useMemo, useState } from 'react';

import type { UsersComponentsQueryProps } from './types';

import { manageQuery } from '../../../../common/components/page/manage_query';
import { UsersTable } from '../../components/all_users';
import { useSearchStrategy } from '../../../../common/containers/use_search_strategy';
import { UsersQueries } from '../../../../../common/search_strategy/security_solution/users';
import * as i18n from './translations';
import { generateTablePaginationOptions } from '../../../components/paginated_table/helpers';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { usersSelectors } from '../../store';
import { useQueryToggle } from '../../../../common/containers/query_toggle';
import { useAllEntityStoreUsers } from '../../containers/users/use_all_entity_store_users';
import { useExploreEntityStoreV2Enabled } from '../../../hooks/use_explore_entity_store_v2_enabled';

const UsersTableManage = manageQuery(UsersTable);

const QUERY_ID = 'UsersTable';

export const AllUsersQueryTabBody = ({
  endDate,
  filterQuery,
  indexNames,
  skip,
  setQuery,
  startDate,
  type,
  deleteQuery,
}: UsersComponentsQueryProps) => {
  const entityStoreV2Enabled = useExploreEntityStoreV2Enabled();
  const { toggleStatus } = useQueryToggle(QUERY_ID);
  const [querySkip, setQuerySkip] = useState(skip || !toggleStatus);
  useEffect(() => {
    setQuerySkip(skip || !toggleStatus);
  }, [skip, toggleStatus]);

  const getUsersSelector = useMemo(() => usersSelectors.allUsersSelector(), []);
  const { activePage, limit, sort } = useDeepEqualSelector((state) => getUsersSelector(state));

  const commonUsersQueryArgs = {
    endDate,
    filterQuery,
    indexNames,
    startDate,
  };

  const {
    loading: legacyLoading,
    result: { users: legacyUsers, pageInfo: legacyPageInfo, totalCount: legacyTotalCount },
    search,
    refetch: legacyRefetch,
    inspect: legacyInspect,
  } = useSearchStrategy<UsersQueries.users>({
    factoryQueryType: UsersQueries.users,
    initialResult: {
      users: [],
      totalCount: 0,
      pageInfo: {
        activePage: 0,
        fakeTotalCount: 0,
        showMorePagesIndicator: false,
      },
    },
    errorMessage: i18n.ERROR_FETCHING_USERS_DATA,
    abort: querySkip || entityStoreV2Enabled,
  });

  const [entityStoreLoading, entityStoreUsersArgs] = useAllEntityStoreUsers({
    ...commonUsersQueryArgs,
    skip: querySkip || !entityStoreV2Enabled,
  });

  useEffect(() => {
    if (!querySkip && !entityStoreV2Enabled) {
      search({
        filterQuery,
        defaultIndex: indexNames,
        timerange: {
          interval: '12h',
          from: startDate,
          to: endDate,
        },
        pagination: generateTablePaginationOptions(activePage, limit),
        sort,
      });
    }
  }, [
    search,
    startDate,
    endDate,
    filterQuery,
    indexNames,
    querySkip,
    activePage,
    limit,
    sort,
    entityStoreV2Enabled,
  ]);

  const loading = entityStoreV2Enabled ? entityStoreLoading : legacyLoading;
  const users = entityStoreV2Enabled ? entityStoreUsersArgs.users : legacyUsers;
  const pageInfo = entityStoreV2Enabled ? entityStoreUsersArgs.pageInfo : legacyPageInfo;
  const totalCount = entityStoreV2Enabled ? entityStoreUsersArgs.totalCount : legacyTotalCount;
  const refetch = entityStoreV2Enabled ? entityStoreUsersArgs.refetch : legacyRefetch;
  const inspect = entityStoreV2Enabled ? entityStoreUsersArgs.inspect : legacyInspect;

  return (
    <UsersTableManage
      users={users}
      deleteQuery={deleteQuery}
      fakeTotalCount={getOr(50, 'fakeTotalCount', pageInfo)}
      id={QUERY_ID}
      inspect={inspect}
      loading={loading}
      loadPage={noop}
      refetch={refetch}
      showMorePagesIndicator={getOr(false, 'showMorePagesIndicator', pageInfo)}
      setQuery={setQuery}
      totalCount={totalCount}
      type={type}
      sort={sort}
      setQuerySkip={setQuerySkip}
    />
  );
};

AllUsersQueryTabBody.displayName = 'AllUsersQueryTabBody';
