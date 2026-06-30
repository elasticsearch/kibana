/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useState } from 'react';
import { type QueryFunctionContext, useQuery } from '@kbn/react-query';
import type { Discovery } from '@kbn/significant-events-schema';
import type { PaginatedResponse } from '@kbn/streams-plugin/common';
import { useKibana } from '../use_kibana';
import { useFetchErrorToast } from '../use_fetch_error_toast';

interface UseFetchDiscoveriesParams {
  from: string | number;
  to: string | number;
}

export const useFetchDiscoveriesEntities = ({ from, to }: UseFetchDiscoveriesParams) => {
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();
  const showFetchErrorToast = useFetchErrorToast();

  const [pagination, setPagination] = useState({ page: 1, perPage: 25 });

  useEffect(() => {
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [from, to]);

  const fetchDiscoveries = useCallback(
    async ({ signal }: QueryFunctionContext): Promise<PaginatedResponse<Discovery>> => {
      return streamsRepositoryClient.fetch('GET /internal/significant_events/discoveries', {
        params: {
          query: {
            page: pagination.page,
            perPage: pagination.perPage,
            from: new Date(from).toISOString(),
            to: new Date(to).toISOString(),
          },
        },
        signal: signal ?? null,
      });
    },
    [streamsRepositoryClient, pagination, from, to]
  );

  const query = useQuery<PaginatedResponse<Discovery>, Error>({
    queryKey: ['discoveriesEntities', pagination.page, pagination.perPage, from, to],
    queryFn: fetchDiscoveries,
    onError: showFetchErrorToast,
  });

  return { ...query, pagination, setPagination };
};

export const useFetchDiscoveryHistory = (discoverySlug: string | undefined) => {
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();
  const showFetchErrorToast = useFetchErrorToast();

  return useQuery<{ hits: Discovery[] }, Error>({
    queryKey: ['discoveryHistory', discoverySlug],
    queryFn: async ({ signal }) => {
      return streamsRepositoryClient.fetch(
        'GET /internal/significant_events/discoveries/{id}/history',
        {
          params: { path: { id: discoverySlug! } },
          signal: signal ?? null,
        }
      );
    },
    enabled: !!discoverySlug,
    onError: showFetchErrorToast,
  });
};
