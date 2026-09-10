/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { lastValueFrom } from 'rxjs';
import { useQuery } from '@kbn/react-query';
import type { ESQLSearchResponse } from '@kbn/es-types';
import { useKibana } from '../../../../common/lib/kibana';
import { useGlobalFilterQuery } from '../../../../common/hooks/use_global_filter_query';
import { useRiskEngineStatus } from '../../../api/hooks/use_risk_engine_status';
import { getEntitiesAlias, ENTITY_LATEST } from '../constants';
import { buildHcCountQueryBody } from '../queries/hc_count_query';

export const useHighCriticalCount = ({
  spaceId,
  watchlistId,
  skip,
}: {
  spaceId: string;
  watchlistId?: string;
  skip?: boolean;
}) => {
  const { data } = useKibana().services;
  const { filterQuery } = useGlobalFilterQuery();

  const index = getEntitiesAlias(ENTITY_LATEST, spaceId);
  const query = `FROM ${index} ${buildHcCountQueryBody(watchlistId)}`;

  const { data: riskEngineStatus, isFetching: isStatusLoading } = useRiskEngineStatus();

  const isEnabled =
    !skip && !isStatusLoading && riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED';

  const queryKey = useMemo(() => ['highCriticalCount', query, filterQuery], [query, filterQuery]);

  const {
    data: result,
    isLoading,
    isRefetching,
    error,
  } = useQuery(
    queryKey,
    async ({ signal }) => {
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
      const row = rawResponse.values?.[0];
      const countIndex = rawResponse.columns?.findIndex((c) => c.name === 'count') ?? 0;
      return typeof row?.[countIndex] === 'number' ? (row[countIndex] as number) : 0;
    },
    {
      keepPreviousData: true,
      enabled: isEnabled,
      retry: 1,
    }
  );

  return {
    count: result ?? 0,
    isLoading: isLoading || isRefetching || isStatusLoading,
    error,
  };
};
