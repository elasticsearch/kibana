/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Managed Context Engine AI index that stores Cortex wiki pages as KIs. */
export const CORTEX_AI_INDEX_ID = 'nightshift-cortex';

/** Backing index for {@link CORTEX_AI_INDEX_ID}. Must use the `ai-index-idx-` prefix. */
export const CORTEX_AI_INDEX_DEST = 'ai-index-idx-nightshift-cortex';

export const CORTEX_ENTITY_TYPES = [
  'integration',
  'service',
  'alert',
  'runbook',
  'query',
  'dashboard',
  'postmortem',
  'topic',
  'glossary',
] as const;

export type CortexEntityType = (typeof CORTEX_ENTITY_TYPES)[number];

export const CORTEX_PAGE_STATUSES = ['established', 'tentative', 'archived'] as const;

export type CortexPageStatus = (typeof CORTEX_PAGE_STATUSES)[number];

export const CORTEX_ENTITY_TYPE_BUCKETS: Record<CortexEntityType, string> = {
  integration: 'integrations',
  service: 'services',
  alert: 'alerts',
  runbook: 'runbooks',
  query: 'queries',
  dashboard: 'dashboards',
  postmortem: 'postmortems',
  topic: 'topics',
  glossary: 'glossary',
};

export interface CortexPageSummary {
  id: string;
  title: string;
  entity_type: CortexEntityType;
  status: CortexPageStatus;
  corroborations: number;
  updated_at: string;
  description?: string;
}

export interface CortexPage extends CortexPageSummary {
  content: string;
  slug: string;
}

export interface CortexStats {
  total: number;
  established: number;
  total_corroborations: number;
  last_updated?: string;
}

export interface ListCortexPagesResponse {
  pages: CortexPageSummary[];
  stats: CortexStats;
}

export interface GetCortexPageResponse {
  page: CortexPage;
}
