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
import { useRiskEngineStatus } from '../../../api/hooks/use_risk_engine_status';
import { getEntitiesAlias, ENTITY_LATEST } from '../constants';

export const useNewEntityCount = ({ spaceId, skip }: { spaceId: string; skip?: boolean }) => {
  const { data } = useKibana().services;
  const { data: riskEngineStatus, isFetching: isStatusLoading } = useRiskEngineStatus();

  const index = getEntitiesAlias(ENTITY_LATEST, spaceId);
  const query = `FROM ${index}
| WHERE entity.lifecycle.first_seen >= NOW() - 7 days AND entity.risk.calculated_score > 0
| EVAL effective_id = COALESCE(\`entity.relationships.resolution.resolved_to\`, entity.id)
| STATS value = COUNT_DISTINCT(effective_id), entity_ids = VALUES(effective_id)`;

  const isEnabled =
    !skip && !isStatusLoading && riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED';

  const queryKey = useMemo(() => ['newEntityCount', query], [query]);

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
          { params: { query } },
          {
            abortSignal: signal,
            strategy: 'esql_async',
            projectRouting: '_alias:_origin',
          }
        )
      );

      const rawResponse = searchResult.rawResponse as unknown as ESQLSearchResponse;
      const row = rawResponse.values?.[0];
      const valueIndex = rawResponse.columns?.findIndex((c) => c.name === 'value') ?? 0;
      const entityIdsIndex = rawResponse.columns?.findIndex((c) => c.name === 'entity_ids') ?? 1;
      return {
        count: typeof row?.[valueIndex] === 'number' ? (row[valueIndex] as number) : 0,
        entityIds: Array.isArray(row?.[entityIdsIndex]) ? (row[entityIdsIndex] as string[]) : [],
      };
    },
    {
      keepPreviousData: true,
      enabled: isEnabled,
      retry: 1,
    }
  );

  return {
    count: result?.count ?? 0,
    entityIds: result?.entityIds ?? [],
    isLoading: isLoading || isRefetching || isStatusLoading,
    error,
  };
};
