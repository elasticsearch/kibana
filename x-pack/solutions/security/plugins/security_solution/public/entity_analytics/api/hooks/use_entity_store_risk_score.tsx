/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';

import { i18n } from '@kbn/i18n';
import { useQuery } from '@kbn/react-query';
import type { IHttpFetchError } from '@kbn/core/public';

import type { ListEntitiesResponse } from '@kbn/entity-store/common';
import type { EntityType } from '../../../../common/search_strategy';
import type { InspectResponse } from '../../../types';
import type { inputsModel } from '../../../common/store';
import { useErrorToast } from '../../../common/hooks/use_error_toast';
import { useMlCapabilities } from '../../../common/components/ml/hooks/use_ml_capabilities';
import { useHasSecurityCapability } from '../../../helper_hooks';
import { useEntityAnalyticsRoutes } from '../api';
import {
  buildHostRiskEntityStoreFilterQuery,
  ENTITY_STORE_HOST_RISK_LIST_QUERY_KEY,
  entityStoreRiskSortToApiParams,
  isHostEntityRecord,
  isHostRiskEntityTarget,
  mapHostEntityRecordToHostRiskScore,
} from './entity_store_host_risk_common';
import {
  buildUserRiskEntityStoreFilterQuery,
  ENTITY_STORE_USER_RISK_LIST_QUERY_KEY,
  entityStoreUserRiskSortToApiParams,
  isUserEntityRecord,
  isUserRiskEntityTarget,
  mapUserEntityRecordToUserRiskScore,
} from './entity_store_user_risk_common';
import type { RiskScoreState, UseRiskScoreParams } from './use_risk_score';
import { useRiskEngineStatus } from './use_risk_engine_status';

interface UseEntityStoreRiskScoreParams extends UseRiskScoreParams {
  riskEntity: EntityType;
}

export function useEntityStoreRiskScore(
  params: UseEntityStoreRiskScoreParams & { riskEntity: EntityType.user }
): RiskScoreState<EntityType.user>;
export function useEntityStoreRiskScore(
  params: UseEntityStoreRiskScoreParams & { riskEntity: EntityType.host }
): RiskScoreState<EntityType.host>;
export function useEntityStoreRiskScore({
  timerange,
  filterQuery,
  sort,
  skip = false,
  pagination,
  riskEntity,
}: UseEntityStoreRiskScoreParams):
  | RiskScoreState<EntityType.host>
  | RiskScoreState<EntityType.user> {
  const { fetchEntitiesListV2 } = useEntityAnalyticsRoutes();
  const {
    data: riskEngineStatus,
    isFetching: isStatusLoading,
    refetch: refetchEngineStatus,
  } = useRiskEngineStatus();
  const { isPlatinumOrTrialLicense } = useMlCapabilities();
  const hasEntityAnalyticsCapability = useHasSecurityCapability('entity-analytics');
  const isAuthorized = isPlatinumOrTrialLicense && hasEntityAnalyticsCapability;
  const hasEngineBeenInstalled = riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED';

  const hostTarget = isHostRiskEntityTarget(riskEntity);
  const userTarget = isUserRiskEntityTarget(riskEntity);

  const { querySize, cursorStart } = pagination ?? {};
  const { sortField, sortOrder } = useMemo(() => {
    if (hostTarget) {
      return entityStoreRiskSortToApiParams(sort);
    }
    if (userTarget) {
      return entityStoreUserRiskSortToApiParams(sort);
    }
    return { sortField: 'entity.risk.calculated_score_norm', sortOrder: 'desc' as const };
  }, [hostTarget, userTarget, sort]);

  const listFilterQuery = useMemo(() => {
    if (hostTarget) {
      return buildHostRiskEntityStoreFilterQuery({
        filterQuery,
        startDate: timerange?.from,
        endDate: timerange?.to,
      });
    }
    if (userTarget) {
      return buildUserRiskEntityStoreFilterQuery({
        filterQuery,
        startDate: timerange?.from,
        endDate: timerange?.to,
      });
    }
    return JSON.stringify({ bool: { filter: [] } });
  }, [hostTarget, userTarget, filterQuery, timerange?.from, timerange?.to]);

  const page =
    cursorStart !== undefined && querySize !== undefined
      ? Math.floor(cursorStart / querySize) + 1
      : 1;
  const perPage = querySize ?? 10;

  const queryEnabled =
    !skip &&
    (hostTarget || userTarget) &&
    isAuthorized &&
    hasEngineBeenInstalled &&
    cursorStart !== undefined &&
    querySize !== undefined;

  const listQueryKey = hostTarget
    ? ENTITY_STORE_HOST_RISK_LIST_QUERY_KEY
    : ENTITY_STORE_USER_RISK_LIST_QUERY_KEY;

  const entityTypes = hostTarget ? (['host'] as const) : userTarget ? (['user'] as const) : [];

  const { data, isLoading, isFetching, error, refetch } = useQuery<
    ListEntitiesResponse | null,
    IHttpFetchError
  >({
    queryKey: [listQueryKey, listFilterQuery, page, perPage, sortField, sortOrder, queryEnabled],
    queryFn: async ({ signal }) =>
      fetchEntitiesListV2({
        signal,
        params: {
          entityTypes: [...entityTypes],
          filterQuery: listFilterQuery,
          page,
          perPage,
          sortField,
          sortOrder,
        },
      }),
    enabled: queryEnabled,
    cacheTime: 0,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });

  const failSearchTitle = useMemo(() => {
    if (hostTarget) {
      return i18n.translate(
        'xpack.securitySolution.entityStore.hostRiskScore.failSearchDescription',
        {
          defaultMessage: 'Failed to load host risk scores from the entity store',
        }
      );
    }
    if (userTarget) {
      return i18n.translate(
        'xpack.securitySolution.entityStore.userRiskScore.failSearchDescription',
        {
          defaultMessage: 'Failed to load user risk scores from the entity store',
        }
      );
    }
    return '';
  }, [hostTarget, userTarget]);

  useErrorToast(failSearchTitle, queryEnabled ? error : undefined);

  const rows = useMemo(() => {
    if (data?.records == null) {
      return [];
    }
    if (hostTarget) {
      return data.records.flatMap((record) => {
        if (!isHostEntityRecord(record)) {
          return [];
        }
        const row = mapHostEntityRecordToHostRiskScore(record);
        return row != null ? [row] : [];
      });
    }
    if (userTarget) {
      return data.records.flatMap((record) => {
        if (!isUserEntityRecord(record)) {
          return [];
        }
        const row = mapUserEntityRecordToUserRiskScore(record);
        return row != null ? [row] : [];
      });
    }
    return [];
  }, [data?.records, hostTarget, userTarget]);

  const inspect: InspectResponse = useMemo(
    () => ({
      dsl: data?.inspect?.dsl ?? [],
      response: data?.inspect?.response ?? [],
    }),
    [data?.inspect?.dsl, data?.inspect?.response]
  );

  const refetchAll: inputsModel.Refetch = useCallback(() => {
    void refetchEngineStatus();
    void refetch();
  }, [refetch, refetchEngineStatus]);

  const totalCount = data?.total ?? 0;
  const storeTarget = hostTarget || userTarget;

  return {
    data: hostTarget ? rows : userTarget ? rows : undefined,
    error,
    hasEngineBeenInstalled,
    inspect,
    isAuthorized,
    isInspected: false,
    loading:
      storeTarget && queryEnabled ? isLoading || isFetching || isStatusLoading : isStatusLoading,
    refetch: refetchAll,
    totalCount: storeTarget ? totalCount : 0,
  } as RiskScoreState<EntityType.host> | RiskScoreState<EntityType.user>;
}
