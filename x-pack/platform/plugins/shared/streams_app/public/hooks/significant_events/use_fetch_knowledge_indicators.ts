/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { useCallback, useMemo } from 'react';
import { useFetchFeatures } from './use_fetch_features';
import { useFetchDiscoveryQueries } from './use_fetch_discovery_queries';

const QUERIES_MAX_PER_PAGE = 1000;

export function useFetchKnowledgeIndicators() {
  const {
    data: featuresData,
    isLoading: featuresLoading,
    refetch: refetchFeatures,
  } = useFetchFeatures();

  const queriesFetchState = useFetchDiscoveryQueries({
    query: '',
    page: 1,
    perPage: QUERIES_MAX_PER_PAGE,
    status: ['active', 'draft'],
  });

  const knowledgeIndicators = useMemo<KnowledgeIndicator[]>(() => {
    const featureKnowledgeIndicators = (featuresData?.features ?? []).map((feature) => ({
      kind: 'feature' as const,
      feature,
    }));

    const queryKnowledgeIndicators = (queriesFetchState.data?.queries ?? []).map((queryRow) => ({
      kind: 'query' as const,
      query: queryRow.query,
      rule: {
        backed: queryRow.rule_backed,
        id: queryRow.query.id,
      },
      stream_name: queryRow.stream_name,
    }));

    return [...featureKnowledgeIndicators, ...queryKnowledgeIndicators];
  }, [featuresData?.features, queriesFetchState.data?.queries]);

  const isLoading = featuresLoading || queriesFetchState.isLoading;

  const isEmpty = !isLoading && knowledgeIndicators.length === 0;

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

  const refetchQueries = queriesFetchState.refetch;
  const refetch = useCallback(() => {
    void refetchQueries();
    void refetchFeatures();
  }, [refetchQueries, refetchFeatures]);

  return {
    knowledgeIndicators,
    occurrencesByQueryId,
    isLoading,
    isEmpty,
    refetch,
  };
}
