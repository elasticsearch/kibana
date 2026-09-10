/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { lastValueFrom } from 'rxjs';
import { useQuery } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import type { ESQLSearchResponse } from '@kbn/es-types';
import type { SecurityAppError } from '@kbn/securitysolution-t-grid';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { useErrorToast } from '../../../../common/hooks/use_error_toast';
import { useKibana } from '../../../../common/lib/kibana';
import { useRiskEngineStatus } from '../../../api/hooks/use_risk_engine_status';
import { useResolvedLatestEntitiesIndexName } from '../../../../common/hooks/use_resolved_latest_entities_index_name';
import { buildEntitiesWithAnomaliesCountQuery } from '../queries/tile_anomaly_count_query';

const esqlSearch = async (
  searchService: ReturnType<typeof useKibana>['services']['data']['search'],
  query: string,
  signal: AbortSignal | undefined
): Promise<ESQLSearchResponse> => {
  const result = await lastValueFrom(
    searchService.search({ params: { query } }, { abortSignal: signal, strategy: 'esql_async' })
  );
  return result.rawResponse as unknown as ESQLSearchResponse;
};

export const useEntitiesWithAnomaliesCount = ({
  spaceId,
  skip,
}: {
  spaceId: string;
  skip?: boolean;
}) => {
  const { data } = useKibana().services;
  const { data: riskEngineStatus, isFetching: isStatusLoading } = useRiskEngineStatus();
  const euidApi = useEntityStoreEuidApi();
  const { data: resolvedIndex, isLoading: isIndexLoading } =
    useResolvedLatestEntitiesIndexName(spaceId);

  const isEnabled =
    !skip &&
    !isStatusLoading &&
    !isIndexLoading &&
    riskEngineStatus?.risk_engine_status !== 'NOT_INSTALLED' &&
    Boolean(euidApi) &&
    Boolean(resolvedIndex?.indexName);

  const query = useMemo(() => {
    if (!euidApi || !resolvedIndex?.indexName) return null;
    return buildEntitiesWithAnomaliesCountQuery(euidApi.euid, resolvedIndex.indexName);
  }, [euidApi, resolvedIndex?.indexName]);

  const {
    data: queryResult,
    isLoading,
    isRefetching,
    error,
  } = useQuery<{ count: number; entityIds: string[] }, SecurityAppError>(
    ['entitiesWithAnomaliesCount', query],
    async ({ signal }) => {
      if (!query) return { count: 0, entityIds: [] };
      const raw = await esqlSearch(data.search, query, signal);
      const row = raw.values?.[0];
      const valueIndex = raw.columns?.findIndex((c) => c.name === 'value') ?? 0;
      const entityIdsIndex = raw.columns?.findIndex((c) => c.name === 'entity_ids') ?? -1;
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

  useErrorToast(
    i18n.translate('xpack.securitySolution.entityAnalytics.home.entitiesWithAnomalies.queryError', {
      defaultMessage: 'There was an error loading entities with anomalies count',
    }),
    filteredError
  );

  return {
    count: queryResult?.count ?? 0,
    entityIds: queryResult?.entityIds ?? [],
    isLoading: isStatusLoading || isIndexLoading || isLoading || isRefetching,
    error: filteredError,
  };
};
