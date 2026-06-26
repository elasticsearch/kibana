/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo, useCallback } from 'react';
import { noop } from 'lodash/fp';
import { useQuery } from '@kbn/react-query';
import type { IHttpFetchError } from '@kbn/core/public';

import type { Entity, ListEntitiesResponse } from '@kbn/entity-store/common';
import type { User } from '../../../../../common/search_strategy/security_solution/users/all';
import { UsersFields } from '../../../../../common/search_strategy/security_solution/users/common';
import type { RiskSeverity } from '../../../../../common/search_strategy/security_solution/risk_score/all';
import type { ESTermQuery } from '../../../../../common/typed_json';
import { createFilter } from '../../../../common/containers/helpers';
import { useErrorToast } from '../../../../common/hooks/use_error_toast';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import type { inputsModel, State } from '../../../../common/store';
import { useEntityAnalyticsRoutes } from '../../../../entity_analytics/api/api';
import { getLimitedPaginationTotalCount } from '../../../components/paginated_table/helpers';
import { usersSelectors } from '../../store';
import type { InspectResponse } from '../../../../types';
import type { UsersListArgs } from './users_table_query_types';
import { USERS_ALL_TABLE_QUERY_ID } from './users_table_query_types';
import * as i18n from './translations';

const ENTITY_STORE_USERS_LIST_QUERY_KEY = 'ENTITY_STORE_USERS_LIST';

export const mapUserEntityRecordToUser = (record: Entity): User | null => {
  if ('user' in record && record.user != null) {
    const userName = record.user?.name;
    if (userName == null || userName === '') {
      return null;
    }

    const lastSeenIso = record.entity?.lifecycle?.last_seen;
    const domainValues = record.user?.domain as string[] | string | undefined;
    const domain = Array.isArray(domainValues) ? domainValues?.[0] ?? '' : domainValues ?? '';
    const riskLevel = record.entity?.risk?.calculated_level as RiskSeverity | undefined;

    const identityFields: Record<string, string> = {
      'user.name': userName,
    };
    if (domain !== '') {
      identityFields['user.domain'] = domain;
    }

    return {
      name: userName,
      lastSeen: lastSeenIso ?? '',
      domain,
      risk: riskLevel,
      criticality: record.asset?.criticality,
      entityId: record.entity?.id,
      identityFields,
    };
  } else {
    return null;
  }
};

const parseFilterClauses = (filterQuery?: ESTermQuery | string): object[] => {
  const filtered = createFilter(filterQuery);
  if (filtered == null || filtered === '') {
    return [];
  }
  try {
    return [JSON.parse(filtered) as object];
  } catch {
    return [];
  }
};

const buildUsersListFilterQuery = ({
  filterQuery,
  startDate,
  endDate,
}: {
  filterQuery?: ESTermQuery | string;
  startDate: string;
  endDate: string;
}): string => {
  const timeRangeClause = {
    range: {
      'entity.lifecycle.last_seen': {
        gte: startDate,
        lte: endDate,
        format: 'strict_date_optional_time',
      },
    },
  };

  return JSON.stringify({
    bool: {
      filter: [...parseFilterClauses(filterQuery), timeRangeClause],
    },
  });
};

const usersSortFieldToEntityStoreField = (field: UsersFields): string => {
  switch (field) {
    case UsersFields.name:
      return 'user.name';
    case UsersFields.lastSeen:
      return 'entity.lifecycle.last_seen';
    case UsersFields.domain:
    default:
      return 'entity.lifecycle.last_seen';
  }
};

interface UseAllEntityStoreUsersParams {
  endDate: string;
  filterQuery?: ESTermQuery | string;
  indexNames: string[];
  skip?: boolean;
  startDate: string;
}

export const useAllEntityStoreUsers = (
  params: UseAllEntityStoreUsersParams
): [boolean, UsersListArgs] => {
  const { endDate, filterQuery, skip = false, startDate } = params;
  const { fetchEntitiesListV2 } = useEntityAnalyticsRoutes();
  const getAllUsersSelector = useMemo(() => usersSelectors.allUsersSelector(), []);
  const { activePage, limit, sort } = useDeepEqualSelector((state: State) =>
    getAllUsersSelector(state)
  );
  const { field: sortField, direction } = sort;

  const listFilterQuery = useMemo(
    () => buildUsersListFilterQuery({ filterQuery, startDate, endDate }),
    [endDate, filterQuery, startDate]
  );

  const sortFieldForApi = usersSortFieldToEntityStoreField(sortField);

  const { data, isLoading, isFetching, error, refetch } = useQuery<
    ListEntitiesResponse | null,
    IHttpFetchError
  >({
    queryKey: [
      ENTITY_STORE_USERS_LIST_QUERY_KEY,
      listFilterQuery,
      activePage,
      limit,
      sortFieldForApi,
      direction,
      skip,
    ],
    queryFn: async ({ signal }) =>
      fetchEntitiesListV2({
        signal,
        params: {
          entityTypes: ['user'],
          filterQuery: listFilterQuery,
          page: activePage + 1,
          perPage: limit,
          sortField: sortFieldForApi,
          sortOrder: direction,
        },
      }),
    enabled: !skip,
    cacheTime: 0,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });

  useErrorToast(i18n.FAIL_ALL_USERS, skip ? undefined : error);

  const totalCount = data?.total ?? 0;
  const fakeTotalCount = getLimitedPaginationTotalCount({ activePage, limit, totalCount });
  const showMorePagesIndicator = totalCount > fakeTotalCount;

  const users: User[] = useMemo(() => {
    if (data?.records == null) {
      return [];
    }
    return data.records.flatMap((record) => {
      const user = mapUserEntityRecordToUser(record as Entity);
      return user != null ? [user] : [];
    });
  }, [data?.records]);

  const inspect: InspectResponse = useMemo(
    () => ({
      dsl: data?.inspect?.dsl ?? [],
      response: data?.inspect?.response ?? [],
    }),
    [data?.inspect?.dsl, data?.inspect?.response]
  );

  const refetchUsers: inputsModel.Refetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  const usersResponse: UsersListArgs = useMemo(
    () => ({
      endDate,
      id: USERS_ALL_TABLE_QUERY_ID,
      inspect,
      isInspected: false,
      loadPage: noop,
      pageInfo: {
        activePage,
        fakeTotalCount,
        showMorePagesIndicator,
      },
      refetch: refetchUsers,
      startDate,
      totalCount,
      users,
    }),
    [
      activePage,
      endDate,
      fakeTotalCount,
      inspect,
      refetchUsers,
      showMorePagesIndicator,
      startDate,
      totalCount,
      users,
    ]
  );

  return [isLoading || isFetching, usersResponse];
};
