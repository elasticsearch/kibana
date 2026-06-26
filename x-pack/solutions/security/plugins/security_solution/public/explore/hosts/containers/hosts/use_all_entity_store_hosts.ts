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

import type { HostEntity, ListEntitiesResponse } from '@kbn/entity-store/common';
import type { InspectResponse } from '../../../../types';
import { HostsFields } from '../../../../../common/api/search_strategy/hosts/model/sort';
import type { HostItem } from '../../../../../common/search_strategy/security_solution/hosts/common';
import type { HostsEdges } from '../../../../../common/search_strategy/security_solution/hosts/all';
import type { RiskSeverity } from '../../../../../common/search_strategy/security_solution/risk_score/all';
import type { ESTermQuery } from '../../../../../common/typed_json';
import { createFilter } from '../../../../common/containers/helpers';
import { useErrorToast } from '../../../../common/hooks/use_error_toast';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import type { inputsModel, State } from '../../../../common/store';
import { useEntityAnalyticsRoutes } from '../../../../entity_analytics/api/api';
import { getLimitedPaginationTotalCount } from '../../../components/paginated_table/helpers';
import type { hostsModel } from '../../store';
import { hostsSelectors } from '../../store';
import type { HostsArgs } from './hosts_table_query_types';
import { HOSTS_ALL_TABLE_QUERY_ID } from './hosts_table_query_types';
import * as i18n from './translations';

const ENTITY_STORE_HOSTS_LIST_QUERY_KEY = 'ENTITY_STORE_HOSTS_LIST';

const isHostEntityRecord = (
  record: ListEntitiesResponse['records'][number]
): record is HostEntity => 'host' in record && record.host != null;

const toOsFieldArray = (value: string | string[] | undefined): string[] | undefined => {
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
};

const mapHostEntityRecordToHostsEdge = (record: HostEntity): HostsEdges | null => {
  const hostName = record.host?.name;
  if (hostName == null || hostName === '') {
    return null;
  }

  const lastSeenIso = record.entity?.lifecycle?.last_seen;
  const riskLevel = record.host?.risk?.calculated_level as RiskSeverity | undefined;

  const node: HostItem = {
    host: {
      name: [hostName],
      os: {
        name: toOsFieldArray(record.host?.os?.name),
        version: toOsFieldArray(record.host?.os?.version),
      },
    },
    lastSeen: lastSeenIso != null ? [lastSeenIso] : undefined,
    risk: riskLevel,
    criticality: record.asset?.criticality,
    entityId: record.entity?.id,
  };

  return {
    node,
    cursor: { value: record.entity?.id ?? hostName, tiebreaker: null },
  };
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

const buildHostsListFilterQuery = ({
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

const hostsSortFieldToEntityStoreField = (field: HostsFields): string => {
  switch (field) {
    case HostsFields.hostName:
      return 'host.name';
    case HostsFields.lastSeen:
      return 'entity.lifecycle.last_seen';
    case HostsFields.success:
    default:
      return 'entity.lifecycle.last_seen';
  }
};

interface UseAllEntityStoreHostsParams {
  endDate: string;
  filterQuery?: ESTermQuery | string;
  indexNames: string[];
  skip?: boolean;
  startDate: string;
  type: hostsModel.HostsType;
}

export const useAllEntityStoreHosts = (
  params: UseAllEntityStoreHostsParams
): [boolean, HostsArgs] => {
  const { endDate, filterQuery, skip = false, startDate, type } = params;
  const { fetchEntitiesListV2 } = useEntityAnalyticsRoutes();
  const getHostsSelector = useMemo(() => hostsSelectors.hostsSelector(), []);
  const { activePage, direction, limit, sortField } = useDeepEqualSelector((state: State) =>
    getHostsSelector(state, type)
  );

  const listFilterQuery = useMemo(
    () => buildHostsListFilterQuery({ filterQuery, startDate, endDate }),
    [endDate, filterQuery, startDate]
  );

  const sortFieldForApi = hostsSortFieldToEntityStoreField(sortField);

  const { data, isLoading, isFetching, error, refetch } = useQuery<
    ListEntitiesResponse | null,
    IHttpFetchError
  >({
    queryKey: [
      ENTITY_STORE_HOSTS_LIST_QUERY_KEY,
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
          entityTypes: ['host'],
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

  useErrorToast(i18n.FAIL_ALL_HOST, skip ? undefined : error);

  const totalCount = data?.total ?? 0;
  const fakeTotalCount = getLimitedPaginationTotalCount({ activePage, limit, totalCount });
  const showMorePagesIndicator = totalCount > fakeTotalCount;

  const hosts: HostsEdges[] = useMemo(() => {
    if (data?.records == null) {
      return [];
    }
    return data.records.flatMap((record) => {
      if (!isHostEntityRecord(record)) {
        return [];
      }
      const edge = mapHostEntityRecordToHostsEdge(record);
      return edge != null ? [edge] : [];
    });
  }, [data?.records]);

  const inspect: InspectResponse = useMemo(
    () => ({
      dsl: data?.inspect?.dsl ?? [],
      response: data?.inspect?.response ?? [],
    }),
    [data?.inspect?.dsl, data?.inspect?.response]
  );

  const refetchHosts: inputsModel.Refetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  const hostsResponse: HostsArgs = useMemo(
    () => ({
      endDate,
      hosts,
      id: HOSTS_ALL_TABLE_QUERY_ID,
      inspect,
      isInspected: false,
      loadPage: noop,
      pageInfo: {
        activePage,
        fakeTotalCount,
        showMorePagesIndicator,
      },
      refetch: refetchHosts,
      startDate,
      totalCount,
    }),
    [
      activePage,
      endDate,
      fakeTotalCount,
      hosts,
      inspect,
      refetchHosts,
      showMorePagesIndicator,
      startDate,
      totalCount,
    ]
  );

  return [isLoading || isFetching, hostsResponse];
};
