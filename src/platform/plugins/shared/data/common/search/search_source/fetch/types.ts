/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IKibanaSearchResponse } from '@kbn/search-types';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { estypes } from '@elastic/elasticsearch';
import type { AggregateQuery, Filter, Query } from '@kbn/es-query';
import type { SearchSourceSearchOptions } from '../../..';
import type { SearchFieldValue, SearchSourceFields } from '../types';
import type { GetConfigFn } from '../../../types';

/**
 * @internal
 *
 * This type is used when flattenning a SearchSource and passing it down to legacy search.
 * Once legacy search is removed, this type should become internal to `SearchSource`,
 * where `ISearchRequestParams` is used externally instead.
 * FIXME: replace with estypes.SearchRequest?
 */
export interface SearchRequestBody {
  aggs?: estypes.SearchRequest['aggs'];
  fields?: estypes.SearchRequest['fields'] | SearchFieldValue[];
  docvalue_fields?: estypes.SearchRequest['docvalue_fields'];
  script_fields?: estypes.SearchRequest['script_fields'];
  stored_fields?: estypes.SearchRequest['stored_fields'];
  runtime_mappings?: estypes.SearchRequest['runtime_mappings'];
  _source?: estypes.SearchRequest['_source'];
  search_after?: estypes.SearchRequest['search_after'];
  sort?: estypes.SearchRequest['sort'];
  track_total_hits?: estypes.SearchRequest['track_total_hits'];
  query?: estypes.QueryDslQueryContainer;
  highlight?: estypes.SearchRequest['highlight'];
  size?: number;
  from?: number;
  version?: boolean;
  timeout?: string;
  terminate_after?: number;
  pit?: estypes.SearchPointInTimeReference;
}

export interface SearchRequestCore {
  index?: DataView | string;
  query?: Array<Query | AggregateQuery>;
  filters?: Filter[] | (() => Filter[]);
  nonHighlightingFilters?: Filter[];
  fieldsFromSource?: SearchFieldValue[];
  highlightAll?: boolean;
  body?: SearchRequestBody;
  id?: string;
  ms?: number;
  indexType?: string;
  preference?: string;
  track_total_hits?: boolean | number;
  getConfig?: GetConfigFn;
  pit?: SearchSourceFields['pit'];
  sort?: SearchSourceFields['sort'] | estypes.SearchRequest['sort'];
  name?: string;
}

export type StrictSearchRequest = SearchRequestCore & { body: SearchRequestBody };
export type SearchRequest<T extends object = {}> = SearchRequestCore &
  Omit<T, keyof SearchRequestCore>;

export interface FetchHandlers {
  getConfig: GetConfigFn;
  /**
   * Callback which can be used to hook into responses, modify them, or perform
   * side effects like displaying UI errors on the client.
   */
  onResponse: (
    request: SearchRequest,
    response: IKibanaSearchResponse,
    options: SearchSourceSearchOptions
  ) => IKibanaSearchResponse;
}

export interface SearchError {
  name: string;
  status: string;
  title: string;
  message: string;
  path: string;
  type: string;
}
