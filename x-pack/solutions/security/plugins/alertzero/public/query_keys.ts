/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const queryKeys = {
  watches: {
    all: ['alertzero', 'watches'] as const,
    list: () => [...queryKeys.watches.all, 'list'] as const,
    detail: (watchId: string | undefined) => [...queryKeys.watches.all, 'detail', watchId] as const,
  },
  /** Live registered Workers, including settings and revision. */
  workers: {
    all: ['alertzero', 'workers'] as const,
    list: () => [...queryKeys.workers.all, 'list'] as const,
  },
  /** Global skill catalog. */
  skills: {
    all: ['alertzero', 'skills'] as const,
    list: () => [...queryKeys.skills.all, 'list'] as const,
  },
  investigations: {
    all: ['alertzero', 'investigations'] as const,
    list: () => [...queryKeys.investigations.all, 'list'] as const,
    detail: (id: string | undefined) => [...queryKeys.investigations.all, 'detail', id] as const,
    proposals: (id: string | undefined) =>
      [...queryKeys.investigations.all, 'proposals', id] as const,
  },
  /** Durable proposals from the generic investigation proposals API. */
  proposals: {
    all: ['alertzero', 'investigation-proposals'] as const,
    list: (conversationId?: string) =>
      [...queryKeys.proposals.all, 'list', conversationId ?? 'any'] as const,
    detail: (id: string | undefined) => [...queryKeys.proposals.all, 'detail', id] as const,
    chartsSummary: (windowHours: number, bucketMinutes: number) =>
      [...queryKeys.proposals.all, 'charts-summary', windowHours, bucketMinutes] as const,
    /**
     * The AlertZero grouped route (`GET /internal/alertzero/proposals`). A separate leaf from
     * `list`: different endpoint, different response shape — sharing a key would let this hook
     * surface a flat payload with no `groups`. Nesting under `proposals.*` means the existing
     * `useApproveProposal`/`useDismissProposal` invalidations refresh this cache on every
     * decision for free.
     */
    groupedList: (windowHours: number) =>
      [...queryKeys.proposals.all, 'grouped-list', windowHours] as const,
  },
};
