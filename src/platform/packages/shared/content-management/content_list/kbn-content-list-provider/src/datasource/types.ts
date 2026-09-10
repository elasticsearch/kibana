/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ContentListItem } from '../item';

/**
 * Include/exclude filter shape used by tag, type, lastResponse, and other filter dimensions.
 */
export interface IncludeExcludeFilter {
  /** Match-any (OR) values: an item matches if it has at least one. */
  include?: string[];
  /**
   * Match-all (AND) values: an item matches only if it has every one.
   *
   * Optional and additive — data sources that ignore it fall back to
   * match-any semantics on {@link IncludeExcludeFilter.include}.
   */
  includeAll?: string[];
  /** Values that items must not match (exclude filter). */
  exclude?: string[];
}

/**
 * Discriminated union for boolean flag filters (e.g. `starred`).
 */
export type IncludeExcludeFlag = { state: 'include' } | { state: 'exclude' };

/** Filter dimension key for tag-based filtering. Matches the `fieldName` used in tag filter popovers. */
export const TAG_FILTER_ID = 'tag';

/** Filter dimension key for created-by user filtering. */
export const CREATED_BY_FILTER_ID = 'createdBy';

/**
 * Active filters applied to the content list.
 *
 * Filter dimensions (e.g. `tag`, `type`, `lastResponse`) are keyed by their
 * `fieldName` and hold an {@link IncludeExcludeFilter}. Boolean flag filters
 * (e.g. `starred`) use {@link IncludeExcludeFlag}. The index signature is
 * required to allow arbitrary filter dimensions, but note:
 *
 * - The `search` key is always `string | undefined` — access it directly.
 * - Use {@link getIncludeExcludeFilter} to narrow to `IncludeExcludeFilter`.
 * - Use {@link getIncludeExcludeFlag} to narrow to `IncludeExcludeFlag`.
 */
export interface ActiveFilters {
  /** Search text extracted from the search bar, without filter syntax. */
  search?: string;
  [filterId: string]: IncludeExcludeFilter | IncludeExcludeFlag | string | undefined;
}

/**
 * Returns the filter value as {@link IncludeExcludeFilter} if it has an
 * `include`, `includeAll`, or `exclude` array; otherwise `undefined`.
 */
export const getIncludeExcludeFilter = (
  value: IncludeExcludeFilter | IncludeExcludeFlag | string | undefined
): IncludeExcludeFilter | undefined =>
  value != null &&
  typeof value === 'object' &&
  ('include' in value || 'includeAll' in value || 'exclude' in value)
    ? (value as IncludeExcludeFilter)
    : undefined;

/**
 * Returns the filter value as {@link IncludeExcludeFlag} if it has a `state` field;
 * otherwise `undefined`.
 */
export const getIncludeExcludeFlag = (
  value: IncludeExcludeFilter | IncludeExcludeFlag | string | undefined
): IncludeExcludeFlag | undefined =>
  value != null && typeof value === 'object' && 'state' in value
    ? (value as IncludeExcludeFlag)
    : undefined;

/**
 * Parameters for the `findItems` function.
 */
export interface FindItemsParams {
  /**
   * Search query text with filter syntax already extracted.
   *
   * This is a convenience alias for `filters.search ?? ''`. When building
   * queries, prefer this over accessing `filters.search` directly.
   */
  searchQuery: string;

  /**
   * Active filters (includes the raw `search` text and any structured filters).
   *
   * The `createdBy` dimension may contain sentinel keys ({@link MANAGED_USER_FILTER},
   * {@link NO_CREATOR_USER_FILTER}) in addition to real user UIDs. Use
   * {@link getCreatorKey} to map items to matching keys when implementing
   * client-side filtering.
   */
  filters: ActiveFilters;

  /**
   * Sort configuration.
   *
   * When sorting is disabled via `features.sorting: false`, this will be `undefined`.
   * Implementations should return items in their natural order (e.g., server default).
   */
  sort?: {
    /** Field name to sort by. */
    field: string;
    /** Sort direction. */
    direction: 'asc' | 'desc';
  };

  /** Pagination configuration. */
  page: {
    /** Zero-based page index. */
    index: number;
    /** Number of items per page. */
    size: number;
  };

  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
}

/**
 * Result from the `findItems` function.
 */
export interface FindItemsResult {
  /** Items for the current page. */
  items: ContentListItem[];

  /** Total matching items for pagination. */
  total: number;
}

/**
 * Function signature for fetching items from a data source.
 */
export type FindItemsFn = (params: FindItemsParams) => Promise<FindItemsResult>;

/** Default debounce delay (ms) matching the Table List View's fetch debounce. */
export const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Data source configuration properties.
 */
export interface DataSourceConfig {
  /** Fetches items from the data source. */
  findItems: FindItemsFn;

  /**
   * Debounce delay in milliseconds applied to query-parameter changes before
   * a new `findItems` request is issued.
   *
   * Defaults to {@link DEFAULT_DEBOUNCE_MS} (300 ms), matching the Table List
   * View's built-in fetch debounce. Set to `0` to disable debouncing.
   */
  debounceMs?: number;

  /**
   * Called automatically before every explicit `refetch()` (e.g. after a
   * delete or create) so the next `findItems` call hits the server instead
   * of returning stale cached data.
   *
   * Client-side providers that cache the server response between calls
   * should set this to clear that cache. Server-based providers that
   * always call through can omit it.
   */
  onInvalidate?: () => void;

  /**
   * Lightweight refresh: re-decorates cached items with external data
   * (e.g. starred status) without a full server refetch.
   */
  onRefresh?: () => Promise<void>;

  /** Called after successful fetch. */
  onFetchSuccess?: (result: FindItemsResult) => void;
}
