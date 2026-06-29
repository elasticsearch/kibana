/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InboxActionStatus } from '@kbn/inbox-common';

export interface InboxActionsListFilters {
  status?: InboxActionStatus;
  sourceApp?: string;
  page?: number;
  perPage?: number;
}

export interface InboxActionsHistoryFilters {
  sourceApp?: string;
  page?: number;
  perPage?: number;
  /** Free-text search across responder / workflow id / step id. */
  q?: string;
  channel?: string[];
  workflowId?: string[];
  respondedBy?: string[];
  /** Sort direction on responded-at / finished-at. Defaults to `'desc'`. */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter options for the history facets endpoint. Currently only scoped by
 * `sourceApp` so the dropdown choices stay stable across the user toggling
 * other list filters — see the route's `listFacets` baseline for the
 * rationale.
 */
export interface InboxActionsHistoryFacetsFilters {
  sourceApp?: string;
}

export const queryKeys = {
  actions: {
    all: ['inbox', 'actions'] as const,
    list: (filters?: InboxActionsListFilters) => ['inbox', 'actions', 'list', filters] as const,
  },
  history: {
    all: ['inbox', 'history'] as const,
    list: (filters?: InboxActionsHistoryFilters) => ['inbox', 'history', 'list', filters] as const,
    facets: (filters?: InboxActionsHistoryFacetsFilters) =>
      ['inbox', 'history', 'facets', filters] as const,
  },
};
