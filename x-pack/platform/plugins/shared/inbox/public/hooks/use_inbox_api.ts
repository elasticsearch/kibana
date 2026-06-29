/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { isHttpFetchError } from '@kbn/core-http-browser';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  API_VERSIONS,
  INBOX_ACTIONS_HISTORY_FACETS_URL,
  INBOX_ACTIONS_HISTORY_URL,
  INBOX_ACTIONS_URL,
  type ListInboxActionsHistoryFacetsResponse,
  type ListInboxActionsHistoryResponse,
  type ListInboxActionsResponse,
} from '@kbn/inbox-common';
import {
  queryKeys,
  type InboxActionsHistoryFacetsFilters,
  type InboxActionsHistoryFilters,
  type InboxActionsListFilters,
} from '../query_keys';

const retryOnTransientError = (_failureCount: number, error: unknown): boolean => {
  if (isHttpFetchError(error)) {
    return !error.response?.status || error.response.status >= 500;
  }
  return true;
};

/**
 * Background poll cadence for both the pending and history listings.
 *
 * The HITL flow has two server-side write windows after a respond:
 *   1. `markStepAsResponded` (synchronous, `refresh: 'wait_for'`) —
 *      visible on the next list call after the mutation settles.
 *   2. The engine's resume task fires through Task Manager
 *      (~3s default cadence), which writes `finishedAt` + the response
 *      payload onto the step doc.
 *
 * The first transition is reconciled by the `onSettled` invalidate on
 * `useRespondToInboxAction`. The second is what this poll catches: the
 * "Processing…" badge in the history feed flips off once the engine
 * finalises the step. 5s is a comfortable upper bound on Task Manager
 * latency without being chatty for the common idle case. React Query's
 * `refetchIntervalInBackground: false` (the default) keeps us off the
 * server when the tab is hidden.
 */
const INBOX_BACKGROUND_REFETCH_MS = 5_000;

export const useInboxActions = (filters: InboxActionsListFilters = {}) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.actions.list(filters),
    queryFn: async (): Promise<ListInboxActionsResponse> => {
      const query: Record<string, string | number> = {};
      if (filters.status) query.status = filters.status;
      if (filters.sourceApp) query.source_app = filters.sourceApp;
      if (filters.page) query.page = filters.page;
      if (filters.perPage) query.per_page = filters.perPage;

      return services.http!.get<ListInboxActionsResponse>(INBOX_ACTIONS_URL, {
        query,
        version: API_VERSIONS.internal.v1,
      });
    },
    keepPreviousData: true,
    retry: retryOnTransientError,
    refetchInterval: INBOX_BACKGROUND_REFETCH_MS,
  });
};

export const useInboxActionsHistory = (filters: InboxActionsHistoryFilters = {}) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.history.list(filters),
    queryFn: async (): Promise<ListInboxActionsHistoryResponse> => {
      // Plain object so the kibana http client can serialise array params as
      // repeated `?key=v&key=v` (matching the OpenAPI `style: form, explode:
      // true` contract on the route schema).
      const query: Record<string, string | number | string[]> = {};
      if (filters.sourceApp) query.source_app = filters.sourceApp;
      if (filters.page) query.page = filters.page;
      if (filters.perPage) query.per_page = filters.perPage;
      if (filters.q && filters.q.trim().length > 0) query.q = filters.q.trim();
      if (filters.channel && filters.channel.length > 0) query.channel = filters.channel;
      if (filters.workflowId && filters.workflowId.length > 0) {
        query.workflow_id = filters.workflowId;
      }
      if (filters.respondedBy && filters.respondedBy.length > 0) {
        query.responded_by = filters.respondedBy;
      }
      if (filters.sortOrder) query.sort_order = filters.sortOrder;

      return services.http!.get<ListInboxActionsHistoryResponse>(INBOX_ACTIONS_HISTORY_URL, {
        query,
        version: API_VERSIONS.internal.v1,
      });
    },
    keepPreviousData: true,
    retry: retryOnTransientError,
    refetchInterval: INBOX_BACKGROUND_REFETCH_MS,
  });
};

/**
 * Stale-time on the history filter dropdown options.
 *
 * Channel and Responder bucket lists are slow-moving (a new responder or
 * channel slug only appears the first time someone uses it from a
 * previously-unseen surface), so refetching them on every dropdown open is
 * wasteful. We let React Query serve the cached facets payload for a generous
 * window while every other history call (`useInboxActionsHistory`) keeps its
 * 5s background refetch.
 *
 * 60s mirrors typical Kibana facet caches and is short enough that a
 * brand-new responder shows up in the dropdown within a minute of their first
 * response without needing a hard reload.
 */
const INBOX_HISTORY_FACETS_STALE_MS = 60_000;

/**
 * React Query hook for the inbox-history filter dropdown options.
 *
 * Returns `{ channel, respondedBy }` bucket arrays (each `{ value, count }`)
 * sourced from the cross-provider facets endpoint. Cached for
 * {@link INBOX_HISTORY_FACETS_STALE_MS} so opening the filter popovers
 * doesn't fire a network request every time. Errors are retried on transient
 * (5xx) failures only — a 4xx points at a caller bug, not a transient outage.
 */
export const useInboxActionsHistoryFacets = (filters: InboxActionsHistoryFacetsFilters = {}) => {
  const { services } = useKibana();

  return useQuery({
    queryKey: queryKeys.history.facets(filters),
    queryFn: async (): Promise<ListInboxActionsHistoryFacetsResponse> => {
      const query: Record<string, string> = {};
      if (filters.sourceApp) query.source_app = filters.sourceApp;

      const response = await services.http!.get<ListInboxActionsHistoryFacetsResponse>(
        INBOX_ACTIONS_HISTORY_FACETS_URL,
        {
          query,
          version: API_VERSIONS.internal.v1,
        }
      );

      // Normalise to a stable empty shape so consumers can render the filter
      // popovers without null-guards (and React Query never sees `undefined`).
      return {
        channel: response?.channel ?? [],
        respondedBy: response?.respondedBy ?? [],
      };
    },
    keepPreviousData: true,
    retry: retryOnTransientError,
    staleTime: INBOX_HISTORY_FACETS_STALE_MS,
  });
};
