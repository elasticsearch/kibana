/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useMemo } from 'react';
import { lastValueFrom } from 'rxjs';
import { prettifyQuery } from '@kbn/esql-utils';
import { useQuery } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import type { SecurityAppError } from '@kbn/securitysolution-t-grid';
import type { ESQLSearchParams, ESQLSearchResponse } from '@kbn/es-types';
import { useErrorToast } from '../../../../../common/hooks/use_error_toast';
import { useKibana } from '../../../../../common/lib/kibana';
import { useEsqlGlobalFilterQuery } from '../../../../../common/hooks/esql/use_esql_global_filter';
import { useGlobalFilterQuery } from '../../../../../common/hooks/use_global_filter_query';
import { esqlResponseToRecords } from '../../../../../common/utils/esql';
import { useRiskEngineStatus } from '../../../../api/hooks/use_risk_engine_status';
import { getWatchlistRiskLevelsQueryBodyV2 } from '../queries/watchlist_risk_level_query';
import type { WatchlistRiskLevelsQueryResult } from './types';
import { getEntitiesAlias, ENTITY_LATEST } from '../../../home/constants';

export const useRiskLevelsEsqlQuery = ({
  watchlistId,
  skip,
  spaceId,
  applyGlobalTimeFilter = true,
}: {
  watchlistId?: string;
  skip?: boolean;
  spaceId: string;
  /**
   * When true (default), the query is filtered by the global date picker's
   * time range. Set to false on surfaces where the date picker is hidden or
   * intentionally decoupled (e.g. the Entity Analytics home page), so the
   * query returns risk levels across all time.
   */
  applyGlobalTimeFilter?: boolean;
}) => {
  const { data } = useKibana().services;

  const index = getEntitiesAlias(ENTITY_LATEST, spaceId);

  const esqlGlobalFilterQuery = useEsqlGlobalFilterQuery();
  const { filterQuery: filterQueryNoTime } = useGlobalFilterQuery();
  const filterQuery = applyGlobalTimeFilter ? esqlGlobalFilterQuery : filterQueryNoTime;

  const query = `FROM ${index} ${getWatchlistRiskLevelsQueryBodyV2(watchlistId || undefined)}`;

  const {
    data: riskEngineStatus,
    isFetching: isStatusLoading,
    refetch: refetchEngineStatus,
  } = useRiskEngineStatus();

  const isEnabled =
    !skip && !isStatusLoading && riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED';
  const queryKey = useMemo(() => ['watchlistRiskLevels', query, filterQuery], [query, filterQuery]);

  const {
    isRefetching,
    data: result,
    error,
    isError,
    refetch,
  } = useQuery<
    {
      response: ESQLSearchResponse;
      params: ESQLSearchParams;
    },
    SecurityAppError
  >(
    queryKey,
    async ({ signal }) => {
      // We call `data.search.search` directly rather than `getESQLResults` so we can pass
      // `projectRouting` as a search option. In CPS environments the search interceptor would
      // otherwise inject the space default (`_alias:*`), fanning this entity-store query out to
      // every linked project and inflating the risk-level counts. Passing `_alias:_origin` here
      // makes it the resolved project routing, which is written to the request body before the
      // CPS request handler runs and is then preserved.
      const searchResult = await lastValueFrom(
        data.search.search(
          {
            params: {
              query,
              ...(filterQuery ? { filter: filterQuery } : {}),
            },
          },
          {
            abortSignal: signal,
            strategy: 'esql_async',
            projectRouting: '_alias:_origin',
          }
        )
      );

      const rawResponse = searchResult.rawResponse as unknown as ESQLSearchResponse;
      // Mirror getESQLResults' normalization: collapse all-empty rows to an empty array.
      const normalizedValues =
        rawResponse.values &&
        rawResponse.values.every((row) => Array.isArray(row) && row.length === 0)
          ? []
          : rawResponse.values;

      return {
        response: { ...rawResponse, values: normalizedValues },
        params: searchResult.requestParams as unknown as ESQLSearchParams,
      };
    },
    {
      keepPreviousData: true,
      enabled: isEnabled,
      retry: 1, // retry once on failure
    }
  );

  // Hide unknown index errors from UI because they index might take some time to be created
  const filteredError = error && !error.message.includes('Unknown index') ? error : undefined;

  useErrorToast(
    i18n.translate('xpack.securitySolution.entityAnalytics.watchlists.riskLevels.queryError', {
      defaultMessage: 'There was an error loading the data',
    }),
    filteredError
  );

  const response = result?.response;

  const inspect = useMemo(() => {
    return {
      dsl: [JSON.stringify({ index: index ? [index] : [''], body: prettifyQuery(query) }, null, 2)],
      response: response ? [JSON.stringify(response, null, 2)] : [],
    };
  }, [index, query, response]);

  const handleRefetch = () => {
    refetchEngineStatus();
    refetch();
  };

  return {
    records: esqlResponseToRecords<WatchlistRiskLevelsQueryResult>(response),
    isLoading: isRefetching || isStatusLoading,
    refetch: handleRefetch,
    inspect,
    error,
    isRefetching,
    isError,
    hasEngineBeenInstalled: riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED',
  };
};
