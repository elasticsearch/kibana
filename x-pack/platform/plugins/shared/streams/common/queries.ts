/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryLink } from '@kbn/significant-events-schema';

export type { QueryLink };

export const QUERY_STATUSES = ['active', 'draft'] as const;
export type QueryStatus = (typeof QUERY_STATUSES)[number];

export const SEARCH_MODES = ['keyword', 'semantic', 'hybrid'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

const DEFAULT_SEARCH_MODE: SearchMode = 'hybrid';

export function resolveSearchMode(searchMode?: SearchMode): SearchMode {
  return searchMode ?? DEFAULT_SEARCH_MODE;
}

export type QueryLinkRequest = Omit<QueryLink, 'stream_name' | 'rule_backed' | 'rule_id'>;

export interface QueryUnlinkRequest {
  id: string;
}

export type Query = QueryLink;
