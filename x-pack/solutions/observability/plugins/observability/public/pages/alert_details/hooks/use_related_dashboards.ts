/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import type { IHttpFetchError } from '@kbn/core-http-browser';
import { useKibana } from '@kbn/triggers-actions-ui-plugin/public';
import type { GetRelatedDashboardsResponse } from '@kbn/observability-schema';
import { useQuery } from '@kbn/react-query';
import { ALERTS_API_URLS } from '../../../../common/constants';

export const fetchRelatedDashboards = async ({
  alertId,
  http,
}: {
  alertId: string;
  http: HttpSetup;
}): Promise<GetRelatedDashboardsResponse> => {
  return http.get<GetRelatedDashboardsResponse>(ALERTS_API_URLS.INTERNAL_RELATED_DASHBOARDS, {
    query: { alertId },
  });
};

export const getRelatedDashboardsQueryKey = (alertId: string) => ['relatedDashboards', alertId];

export const useRelatedDashboards = (
  alertId: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { http } = useKibana().services;

  const { data, isLoading, refetch } = useQuery<GetRelatedDashboardsResponse>({
    queryKey: getRelatedDashboardsQueryKey(alertId),
    queryFn: () => fetchRelatedDashboards({ alertId, http }),
    // Resolving related dashboards requires rule read (it reads the rule and
    // scans dashboards), so skip the fetch when the caller is not authorized.
    enabled: Boolean(alertId) && enabled,
    refetchOnWindowFocus: false, // Disable window focus refetching
    retry: (failureCount, error) => {
      // Don't retry on 403; an unauthorized request will keep failing.
      const status = (error as IHttpFetchError<{ statusCode?: number }>)?.response?.status;
      if (status === 403) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    isLoadingRelatedDashboards: isLoading,
    suggestedDashboards: data?.suggestedDashboards,
    linkedDashboards: data?.linkedDashboards,
    refetchRelatedDashboards: refetch,
  };
};
