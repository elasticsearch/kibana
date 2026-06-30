/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useState } from 'react';
import { type QueryFunctionContext, useQuery } from '@kbn/react-query';
import type { SignificantEvent } from '@kbn/significant-events-schema';
import type { PaginatedResponse } from '@kbn/streams-plugin/common';
import { useKibana } from '../use_kibana';
import { useFetchErrorToast } from '../use_fetch_error_toast';

interface UseFetchSignificantEventsParams {
  from: string | number;
  to: string | number;
  status?: string[];
  stream?: string[];
  search?: string;
}

export const useFetchSignificantEvents = ({
  from,
  to,
  status,
  stream,
  search,
}: UseFetchSignificantEventsParams) => {
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
  }, [from, to, status, stream, search]);

  const query = useQuery<PaginatedResponse<SignificantEvent>, Error>({
    queryKey: [
      'significantEvents',
      pagination.page,
      pagination.perPage,
      from,
      to,
      status,
      stream,
      search,
    ],
    queryFn: async ({
      signal,
    }: QueryFunctionContext): Promise<PaginatedResponse<SignificantEvent>> => {
      return streamsRepositoryClient.fetch('GET /internal/significant_events/events', {
        params: {
          query: {
            page: pagination.page,
            perPage: pagination.perPage,
            from: new Date(from).toISOString(),
            to: new Date(to).toISOString(),
            ...(status?.length ? { status } : {}),
            ...(stream?.length ? { stream } : {}),
            ...(search ? { search } : {}),
          },
        },
        signal: signal ?? null,
      });
    },
    onError: showFetchErrorToast,
  });

  return { ...query, pagination, setPagination };
};
