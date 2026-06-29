/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { isComputedFeature, type Feature, type Streams } from '@kbn/streams-schema';
import type { QueryFunctionContext } from '@kbn/react-query';
import { useQuery } from '@kbn/react-query';
import { useFetchErrorToast } from '../use_fetch_error_toast';
import { useKibana } from '../use_kibana';

export const useStreamFeatures = (
  definition: Streams.all.Definition,
  deps: unknown[] = [],
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { streamsRepositoryClient } = useKibana().dependencies.start.streams;
  const showFetchErrorToast = useFetchErrorToast();

  const streamName = definition.name;

  const fetchFeatures = async ({ signal: querySignal }: QueryFunctionContext) => {
    return streamsRepositoryClient.fetch('GET /internal/streams/{name}/features', {
      params: {
        path: {
          name: streamName,
        },
        query: {
          include_excluded: true,
        },
      },
      signal: querySignal ?? null,
    });
  };

  const { data, isLoading, error, refetch } = useQuery<{ features: Feature[] }, Error>({
    queryKey: ['features', streamName, ...deps],
    queryFn: fetchFeatures,
    onError: showFetchErrorToast,
    enabled,
  });

  const allFeatures = useMemo(
    () => (data?.features ?? []).filter((feature) => !isComputedFeature(feature)),
    [data?.features]
  );

  const features = useMemo(() => allFeatures.filter((feature) => !feature.excluded), [allFeatures]);

  const excludedFeatures = useMemo(
    () => allFeatures.filter((feature) => !!feature.excluded),
    [allFeatures]
  );

  return {
    features,
    excludedFeatures,
    featuresLoading: isLoading,
    refreshFeatures: refetch,
    error,
  };
};
