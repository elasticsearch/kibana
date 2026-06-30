/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { getDocumentById, type GetDocumentByIdResult } from './get_documents';
export {
  performMatchSearch,
  type PerformMatchSearchResponse,
  type MatchResult,
} from './perform_match_search';
export { extractSnippetsBatch, type TopSnippetsConfig } from './extract_snippets';
export { listIndices, type ListIndexBasicInfo, type ListIndexDetailInfo } from './list_indices';
export {
  listSearchSources,
  type AliasSearchSource,
  type IndexSearchSource,
  type DataStreamSearchSource,
  type DatasetSearchSource,
  type EsSearchSource,
  type ListSourcesResponse,
} from './list_search_sources';
