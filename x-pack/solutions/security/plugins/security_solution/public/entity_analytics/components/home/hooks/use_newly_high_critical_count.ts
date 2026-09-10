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
import type { SecurityAppError } from '@kbn/securitysolution-t-grid';
import { useKibana } from '../../../../common/lib/kibana';
import { useRiskEngineStatus } from '../../../api/hooks/use_risk_engine_status';
import { useResolvedLatestEntitiesIndexName } from '../../../../common/hooks/use_resolved_latest_entities_index_name';
import { buildNewlyHighCriticalCountQuery } from '../queries/tile_newly_high_critical_query';

export const useNewlyHighCriticalCount = ({
  spaceId,
  skip,
}: {
  spaceId: string;
  skip?: boolean;
}) => {
  const { data } = useKibana().services;
  const { data: riskEngineStatus, isFetching: isStatusLoading } = useRiskEngineStatus();
  const { data: resolvedIndex, isLoading: isIndexLoading } =
    useResolvedLatestEntitiesIndexName(spaceId);

  const isEnabled =
    !skip &&
    !isStatusLoading &&
    !isIndexLoading &&
    riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED' &&
    Boolean(resolvedIndex?.indexName);

  const query = useMemo(
    () =>
      resolvedIndex?.indexName
        ? buildNewlyHighCriticalCountQuery(spaceId, resolvedIndex.indexName)
        : null,
    [spaceId, resolvedIndex?.indexName]
  );

  const {
    data: queryResult,
    isLoading,
    isRefetching,
    error,
  } = useQuery<{ count: number; entityIds: string[] }, SecurityAppError>(
    ['newlyHighCriticalCount', query],
    async ({ signal }) => {
      if (!query) return { count: 0, entityIds: [] };
      const raw = await lastValueFrom(
        data.search.search({ params: { query } }, { abortSignal: signal, strategy: 'esql_async' })
      );
      const response = raw.rawResponse as unknown as ESQLSearchResponse;
      const row = response.values?.[0];
      const valueIndex = response.columns?.findIndex((c) => c.name === 'value') ?? 0;
      const entityIdsIndex = response.columns?.findIndex((c) => c.name === 'entity_ids') ?? -1;
      const count = typeof row?.[valueIndex] === 'number' ? (row[valueIndex] as number) : 0;
      const rawIds = entityIdsIndex >= 0 ? row?.[entityIdsIndex] : undefined;
      const entityIds: string[] = Array.isArray(rawIds)
        ? (rawIds as string[]).filter(Boolean)
        : typeof rawIds === 'string' && rawIds
        ? [rawIds]
        : [];
      return { count, entityIds };
    },
    {
      enabled: isEnabled && Boolean(query),
      keepPreviousData: true,
      retry: 1,
    }
  );

  const filteredError = (error as SecurityAppError | undefined)?.message?.includes('Unknown index')
    ? undefined
    : (error as SecurityAppError | undefined);

  return {
    count: queryResult?.count ?? 0,
    entityIds: queryResult?.entityIds ?? [],
    isLoading: isStatusLoading || isIndexLoading || isLoading || isRefetching,
    error: filteredError,
  };
};
