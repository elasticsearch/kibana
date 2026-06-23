/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import type { CreateWatchlistRequestBodyInput } from '../../../../../common/api/entity_analytics/watchlists/management/create.gen';
import type { GetWatchlistResponse } from '../../../../../common/api/entity_analytics/watchlists/management/get.gen';
import type { MonitoringEntitySource } from '../../../../../common/api/entity_analytics/watchlists/data_source/common.gen';
import { useEntityAnalyticsRoutes } from '../../../../entity_analytics/api/api';
import type { SourceType } from './rule_based_source_helpers';

export type WatchlistFormValues = CreateWatchlistRequestBodyInput;

/**
 * Maps a stored entity source back to the shape expected by the create/update form.
 */
const toEntitySourceFormValues = (
  source: MonitoringEntitySource
): NonNullable<CreateWatchlistRequestBodyInput['entitySources']>[number] => ({
  type: source.type ?? 'index',
  name: source.name ?? '',
  indexPattern: source.indexPattern,
  identifierField: source.identifierField,
  filter: source.filter,
  queryRule: source.queryRule,
  enabled: source.enabled,
  integrationName: source.integrationName,
  matchers: source.matchers,
  range: source.range,
});

const toWatchlistFormValues = (
  watchlist: GetWatchlistResponse,
  ruleBasedSources: MonitoringEntitySource[]
): WatchlistFormValues => ({
  name: watchlist.name ?? '',
  description: watchlist.description ?? '',
  riskModifier: watchlist.riskModifier,
  managed: watchlist.managed ?? false,
  entitySources:
    ruleBasedSources.length > 0 ? ruleBasedSources.map(toEntitySourceFormValues) : undefined,
});

export const useGetWatchlistFormData = (watchlistId?: string) => {
  const { getWatchlist, listWatchlistEntitySources } = useEntityAnalyticsRoutes();

  const watchlistQuery = useQuery<GetWatchlistResponse>({
    queryKey: ['watchlist-details', watchlistId],
    enabled: Boolean(watchlistId),
    queryFn: ({ signal }) => getWatchlist({ id: watchlistId as string, signal }),
  });

  const entitySourcesQuery = useQuery({
    queryKey: ['watchlist-entity-sources', watchlistId],
    enabled: Boolean(watchlistId),
    queryFn: ({ signal }) =>
      listWatchlistEntitySources({ watchlistId: watchlistId as string, signal }),
  });

  // For managed watchlists the sources may include integration sources.
  // Filter down to rule-based sources (index / store) that the form can edit.
  const ruleBasedSources = useMemo(
    () =>
      (entitySourcesQuery.data?.sources ?? []).filter(
        (s) => s.type === 'index' || s.type === 'store'
      ),
    [entitySourcesQuery.data]
  );

  /**
   * Maps source type → persisted ID so the mutation layer knows whether to
   * create or update each source independently.
   * A server-side upsert endpoint for entity sources would remove the need
   * for this client side mapping. Issue here: https://github.com/elastic/security-team/issues/14466?issue=elastic%7Csecurity-team%7C16659
   */
  const ruleBasedSourceIds = useMemo<Partial<Record<SourceType, string>>>(() => {
    const map: Partial<Record<SourceType, string>> = {};
    for (const s of ruleBasedSources) {
      if (s.id && (s.type === 'index' || s.type === 'store')) {
        map[s.type] = s.id;
      }
    }
    return map;
  }, [ruleBasedSources]);

  const initialWatchlist = useMemo(() => {
    if (!watchlistQuery.data) {
      return null;
    }
    return toWatchlistFormValues(watchlistQuery.data, ruleBasedSources);
  }, [watchlistQuery.data, ruleBasedSources]);

  const indexSourceWithMissingApiKey = useMemo(
    () => ruleBasedSources.find((s) => s.type === 'index' && !s.apiKeyId),
    [ruleBasedSources]
  );

  return {
    initialWatchlist,
    ruleBasedSourceIds,
    indexSourceWithMissingApiKey,
    isLoading: watchlistQuery.isLoading || entitySourcesQuery.isLoading,
    isError: watchlistQuery.isError || entitySourcesQuery.isError,
  };
};
