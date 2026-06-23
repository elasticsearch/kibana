/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/core/server';

const DEFAULT_MAX_PAGES = 50;

export interface ValidHit<TSource> {
  _id: string;
  _source: TSource;
  sort?: estypes.SortResults;
  _seq_no?: number;
  _primary_term?: number;
}

/** Minimal search response shape — only the fields used by the paginator. */
interface SearchResponseLike<TSource> {
  hits: {
    hits: Array<{
      _id?: string | null;
      _source?: TSource | null;
      sort?: estypes.SortResults;
    }>;
  };
}

export interface PaginateWithSearchAfterOptions<TSource> {
  /** Executes the search for each page. Receives `searchAfter` for subsequent pages. */
  search: (searchAfter: estypes.SortResults | undefined) => Promise<SearchResponseLike<TSource>>;
  pageSize: number;
  maxPages?: number;
  logger: Logger;
  /** Identifies the operation in truncation warnings (e.g. "disableAllWorkflows"). */
  operationName: string;
  /** When true, throws if a hit is missing its sort value. When false (default), breaks the loop. */
  throwOnMissingSort?: boolean;
}

export interface PaginateResult {
  totalProcessed: number;
  truncated: boolean;
}

/**
 * Paginates through ES results using `search_after`.
 * Calls `onPage` for each batch of valid hits (non-null `_id` and `_source`).
 * Handles the page loop, hasMore check, search_after extraction, and MAX_PAGES truncation.
 */
export const paginateWithSearchAfter = async <TSource>(
  options: PaginateWithSearchAfterOptions<TSource>,
  onPage: (hits: Array<ValidHit<TSource>>) => Promise<void>
): Promise<PaginateResult> => {
  const {
    search,
    pageSize,
    maxPages = DEFAULT_MAX_PAGES,
    logger,
    operationName,
    throwOnMissingSort = false,
  } = options;

  let searchAfter: estypes.SortResults | undefined;
  let hasMore = true;
  let pageCount = 0;
  let totalProcessed = 0;

  while (hasMore && pageCount < maxPages) {
    pageCount++;

    const searchResponse = await search(searchAfter);
    const hits = searchResponse.hits.hits.filter(
      (hit): hit is ValidHit<TSource> & { sort?: estypes.SortResults } =>
        hit._id != null && hit._source != null
    );

    if (hits.length === 0) {
      break;
    }

    totalProcessed += hits.length;
    await onPage(hits);

    hasMore = hits.length >= pageSize;
    if (hasMore) {
      const lastHit = hits[hits.length - 1];
      if (!lastHit.sort) {
        if (throwOnMissingSort) {
          throw new Error(
            `Missing sort value on last hit (required for search_after). Last hit: ${JSON.stringify(
              lastHit
            )}`
          );
        }
        break;
      }
      searchAfter = lastHit.sort;
    }
  }

  const truncated = hasMore && pageCount >= maxPages;
  if (truncated) {
    logger.warn(`${operationName} truncated at ${maxPages} pages (${totalProcessed} processed)`);
  }

  return { totalProcessed, truncated };
};
