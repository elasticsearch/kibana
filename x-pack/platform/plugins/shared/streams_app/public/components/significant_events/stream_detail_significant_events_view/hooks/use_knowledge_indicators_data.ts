/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { useCallback, useMemo } from 'react';
import { useFetchDiscoveryQueries } from '../../../../hooks/significant_events/use_fetch_discovery_queries';
import { useStreamFeatures } from '../../../../hooks/significant_events/use_stream_features';

interface UseKnowledgeIndicatorsDataParams {
  definition: Streams.all.GetResponse;
  /** When false, the features and queries are not fetched (e.g. significant events is unavailable). */
  enabled?: boolean;
}

export function useFetchKnowledgeIndicators(
  { definition, enabled = true }: UseKnowledgeIndicatorsDataParams,
  deps: unknown[] = []
) {
  const queriesFetchState = useFetchDiscoveryQueries(
    {
      name: definition.stream.name,
      query: '',
      page: 1,
      perPage: 1000,
      status: ['active', 'draft'],
      enabled,
    },
    deps
  );

  const { features, excludedFeatures, featuresLoading, refreshFeatures } = useStreamFeatures(
    definition.stream,
    deps,
    { enabled }
  );

  const knowledgeIndicators = useMemo<KnowledgeIndicator[]>(() => {
    const queryKnowledgeIndicators = (queriesFetchState.data?.queries ?? []).map((queryRow) => ({
      kind: 'query' as const,
      query: queryRow.query,
      rule: {
        backed: queryRow.rule_backed,
        id: queryRow.query.id,
      },
      stream_name: queryRow.stream_name,
    }));

    return [
      ...features.map((feature) => ({ kind: 'feature' as const, feature })),
      ...excludedFeatures.map((feature) => ({ kind: 'feature' as const, feature })),
      ...queryKnowledgeIndicators,
    ];
  }, [excludedFeatures, features, queriesFetchState.data?.queries]);

  // A disabled react-query stays in the `loading` status, so only report
  // loading / empty while fetching is actually enabled.
  const isLoading = enabled && (queriesFetchState.isLoading || featuresLoading);

  const isEmpty =
    enabled &&
    !queriesFetchState.isLoading &&
    !featuresLoading &&
    features.length === 0 &&
    excludedFeatures.length === 0 &&
    (queriesFetchState.data?.queries.length ?? 0) === 0;

  const occurrencesByQueryId = useMemo(
    () =>
      Object.fromEntries(
        (queriesFetchState.data?.queries ?? []).map((queryRow) => [
          queryRow.query.id,
          queryRow.occurrences,
        ])
      ),
    [queriesFetchState.data?.queries]
  );

  const refetch = useCallback(() => {
    queriesFetchState.refetch();
    refreshFeatures();
  }, [queriesFetchState, refreshFeatures]);

  return {
    knowledgeIndicators,
    occurrencesByQueryId,
    isLoading,
    isEmpty,
    refetch,
  };
}
