/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { IEsSearchResponse } from '@kbn/search-types';
import type { Filter } from '@kbn/es-query';
import type { ECSMapping } from '@kbn/osquery-io-ts-types';

import type { RequestBasicOptions } from '../..';
import type { Maybe, Inspect } from '../../common';

export interface ExportResultsStrategyResponse extends IEsSearchResponse {
  hits: estypes.SearchResponse['hits'];
  inspect?: Maybe<Inspect>;
}

export interface ExportResultsRequestOptions extends RequestBasicOptions {
  /**
   * The pre-scoped base filter string (e.g. `action_id: "abc"` or
   * `schedule_id: "x" AND osquery_meta.schedule_execution_count: 1`).
   * Composed by the route handler before delegating to the factory.
   */
  baseFilter: string;
  /** Active PIT id and keep-alive duration for paginated export fetches. */
  pit: { id: string; keep_alive: string };
  /** Optional additional KQL filter supplied by the caller. */
  kuery?: string;
  /** Agent IDs to scope the export to a subset of agents. */
  agentIds?: string[];
  /** Pre-validated SearchBar filter pills. */
  esFilters?: Filter[];
  /** Cursor for search_after pagination; undefined on the first page. */
  searchAfter?: estypes.SortResults;
  /** Number of hits per page. */
  size: number;
  /** ECS field mapping from the originating action/saved query. */
  ecsMapping?: ECSMapping;
  /** Integration namespaces used to resolve the space-aware index pattern. */
  integrationNamespaces?: string[];
  /**
   * Active space of the request. Used to apply the `space_id` filter so exported
   * results are scoped to the active space.
   */
  spaceId?: string;
  /** When true, requests `track_total_hits: true` (first page only). */
  trackTotalHits?: boolean;
}
