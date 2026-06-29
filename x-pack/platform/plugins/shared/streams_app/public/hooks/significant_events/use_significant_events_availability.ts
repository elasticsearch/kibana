/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type QueryFunctionContext, useQuery } from '@kbn/react-query';
import { useKibana } from '../use_kibana';
import { useFetchErrorToast } from '../use_fetch_error_toast';

const SIGNIFICANT_EVENTS_AVAILABILITY_QUERY_KEY = ['significantEventsAvailability'] as const;

export const useSignificantEventsAvailability = () => {
  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();
  const showFetchErrorToast = useFetchErrorToast();

  const { data, isLoading, error } = useQuery({
    queryKey: SIGNIFICANT_EVENTS_AVAILABILITY_QUERY_KEY,
    queryFn: ({ signal }: QueryFunctionContext) =>
      streamsRepositoryClient.fetch('GET /internal/significant_events/availability', {
        signal: signal ?? null,
      }),
    onError: showFetchErrorToast,
  });

  // Treat a failed availability request as "not available" so callers fall back
  // to the not-enabled prompt instead of proceeding as if it were available.
  const availability = error
    ? ({
        available: false,
        reason: 'unknown',
      } as const)
    : data;

  return { availability, isLoading, error };
};
