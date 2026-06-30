/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo } from 'react';

import { i18n } from '@kbn/i18n';
import { EntityRiskQueries } from '../../../../common/api/search_strategy';
import { useLicense } from '../../../common/hooks/use_license';
import { createFilter } from '../../../common/containers/helpers';
import type {
  EntityType,
  RiskScoreSortField,
  RiskScoreStrategyResponse,
  StrategyResponseType,
} from '../../../../common/search_strategy';
import type { ESQuery } from '../../../../common/typed_json';
import type { InspectResponse } from '../../../types';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { isIndexNotFoundError, isAbortError } from '../../../common/utils/exceptions';
import type { inputsModel } from '../../../common/store';
import { useSearchStrategy } from '../../../common/containers/use_search_strategy';
import { useGetDefaultRiskIndex } from '../../hooks/use_get_default_risk_index';
import { useHasSecurityCapability } from '../../../helper_hooks';
import { useRiskEngineStatus } from './use_risk_engine_status';

export interface RiskScoreState<T extends EntityType> {
  data: RiskScoreStrategyResponse<T>['data'];
  inspect: InspectResponse;
  isInspected: boolean;
  refetch: inputsModel.Refetch;
  totalCount: number;
  isAuthorized: boolean;
  hasEngineBeenInstalled: boolean;
  loading: boolean;
  error: unknown;
}

export interface UseRiskScoreParams {
  filterQuery?: ESQuery | string;
  onlyLatest?: boolean;
  includeAlertsCount?: boolean;
  pagination?:
    | {
        cursorStart: number;
        querySize: number;
      }
    | undefined;
  skip?: boolean;
  sort?: RiskScoreSortField;
  timerange?: { to: string; from: string };
}

interface UseRiskScore<T> extends UseRiskScoreParams {
  riskEntity: T;
}

export const initialResult: Omit<StrategyResponseType<EntityRiskQueries.list>, 'rawResponse'> = {
  totalCount: 0,
  data: undefined,
};

export const useRiskScore = <T extends EntityType>({
  timerange,
  onlyLatest = true,
  filterQuery,
  sort,
  skip = false,
  pagination,
  riskEntity,
  includeAlertsCount = false,
}: UseRiskScore<T>): RiskScoreState<T> => {
  const defaultIndex = useGetDefaultRiskIndex(onlyLatest);
  const {
    data: riskEngineStatus,
    isFetching: isStatusLoading,
    refetch: refetchEngineStatus,
  } = useRiskEngineStatus();
  const factoryQueryType = EntityRiskQueries.list;
  const { querySize, cursorStart } = pagination || {};
  const { addError } = useAppToasts();
  const license = useLicense();
  const hasRequiredLicense = license.isPlatinumPlus();
  const hasEntityAnalyticsCapability = useHasSecurityCapability('entity-analytics');
  const isAuthorized = hasRequiredLicense && hasEntityAnalyticsCapability;
  const hasEngineBeenInstalled = riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED';
  const {
    loading,
    result: response,
    search,
    refetch,
    inspect,
    error,
  } = useSearchStrategy<EntityRiskQueries.list>({
    factoryQueryType,
    initialResult,
    abort: skip,
    showErrorToast: false,
  });

  const refetchAll = useCallback(() => {
    if (defaultIndex) {
      refetchEngineStatus();
      refetch();
    }
  }, [defaultIndex, refetch, refetchEngineStatus]);

  const riskScoreResponse = useMemo(
    () => ({
      data: response.data,
      inspect,
      refetch: refetchAll,
      totalCount: response.totalCount,
      isAuthorized,
      isInspected: false,
      hasEngineBeenInstalled,
      error,
    }),
    [
      response.data,
      response.totalCount,
      inspect,
      refetchAll,
      isAuthorized,
      hasEngineBeenInstalled,
      error,
    ]
  );

  const requestTimerange = useMemo(
    () => (timerange ? { to: timerange.to, from: timerange.from, interval: '' } : undefined),
    [timerange]
  );

  const riskScoreRequest = useMemo(
    () =>
      defaultIndex
        ? {
            defaultIndex: [defaultIndex],
            factoryQueryType,
            riskScoreEntity: riskEntity,
            includeAlertsCount,
            filterQuery: createFilter(filterQuery),
            pagination:
              cursorStart !== undefined && querySize !== undefined
                ? {
                    cursorStart,
                    querySize,
                  }
                : undefined,
            sort,
            timerange: requestTimerange,
            alertsTimerange: includeAlertsCount ? requestTimerange : undefined,
          }
        : null,
    [
      cursorStart,
      defaultIndex,
      factoryQueryType,
      filterQuery,
      querySize,
      sort,
      requestTimerange,
      riskEntity,
      includeAlertsCount,
    ]
  );

  useEffect(() => {
    if (error) {
      if (!isIndexNotFoundError(error) && !isAbortError(error)) {
        addError(error, {
          title: i18n.translate('xpack.securitySolution.riskScore.failSearchDescription', {
            defaultMessage: `Failed to run search on risk score`,
          }),
        });
      }
    }
  }, [addError, error]);

  useEffect(() => {
    if (!skip && riskScoreRequest != null && isAuthorized && hasEngineBeenInstalled) {
      search(riskScoreRequest);
    }
  }, [hasEngineBeenInstalled, isAuthorized, riskScoreRequest, search, skip]);

  const result = { ...riskScoreResponse, loading: loading || isStatusLoading };

  return result;
};
