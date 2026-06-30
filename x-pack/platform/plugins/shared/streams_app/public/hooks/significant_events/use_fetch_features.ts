/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type QueryFunctionContext, useQuery } from '@kbn/react-query';
import type { Feature } from '@kbn/streams-schema';
import { useKibana } from '../use_kibana';
import { useFetchErrorToast } from '../use_fetch_error_toast';

interface FetchFeaturesResult {
  features: Feature[];
}

export const useFetchFeatures = () => {
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();
  const showFetchErrorToast = useFetchErrorToast();

  const fetchFeatures = async ({
    signal,
  }: QueryFunctionContext): Promise<FetchFeaturesResult | undefined> => {
    return await streamsRepositoryClient.fetch('GET /internal/streams/_features', {
      signal: signal ?? null,
      params: {
        query: {
          include_excluded: true,
        },
      },
    });
  };

  return useQuery<FetchFeaturesResult | undefined, Error>({
    queryKey: ['features', 'all'],
    queryFn: fetchFeatures,
    onError: showFetchErrorToast,
  });
};
