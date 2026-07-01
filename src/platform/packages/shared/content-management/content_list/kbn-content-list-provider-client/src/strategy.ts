/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';
import type {
  ActiveFilters,
  IncludeExcludeFilter,
  FindItemsFn,
  FindItemsParams,
  FindItemsResult,
  ContentListItem,
} from '@kbn/content-list-provider';
import {
  getIncludeExcludeFlag,
  MANAGED_USER_FILTER,
  NO_CREATOR_USER_FILTER,
  getCreatorKey,
} from '@kbn/content-list-provider';
import type { TableListViewFindItemsFn } from './types';
import type { ContentListFilterMap } from './filters';
import { matchesFilterValue } from './filters';
import type { ContentListSortFieldMap } from './sorting';

// Re-export for consumers that import from strategy.
export { MANAGED_USER_FILTER, NO_CREATOR_USER_FILTER, getCreatorKey };

/**
 * A `UserContentCommonSchema` item that may carry decorator-added properties
 * (e.g. `starred`). Used where {@link filterItems} reads dynamic keys set by
 * an {@link ItemDecorator}.
 */
type DecoratedItem = UserContentCommonSchema & Record<string, unknown>;

/**
 * Enriches raw items with external data (e.g. `starred` status).
 *
 * Called at cache-fill time and on {@link ClientStrategy.onRefresh}.
 * The returned array must have the same length and order as the input.
 */
export type ItemDecorator = (
  items: UserContentCommonSchema[]
) => Promise<UserContentCommonSchema[]>;

/** Callback passed to {@link ClientStrategy.subscribe}; called whenever the items snapshot changes. */
export type ItemsSnapshotListener = () => void;
type DynamicConfig<T> = T | (() => T);

const resolveConfig = <T>(config: DynamicConfig<T> | undefined): T | undefined =>
  typeof config === 'function' ? (config as () => T)() : config;

/**
 * Return type from {@link createClientStrategy}.
 */
export interface ClientStrategy {
  /**
   * Fetches items and applies client-side filtering, sorting, and pagination.
   *
   * Internally caches the server response keyed by `searchQuery`. Calls to
   * `findItems` with the same `searchQuery` reuse the cache and only
   * recompute the client-side transforms. A new `searchQuery` triggers a
   * fresh server fetch.
   *
   * The core provider calls {@link ClientStrategy.onInvalidate} before
   * refetching after mutations so the next call always hits the server.
   */
  findItems: FindItemsFn;
  /**
   * Called by the core provider before an explicit refetch (e.g. after a
   * mutation) to clear the internal item cache. The next `findItems` call
   * will fetch from the server regardless of `searchQuery`.
   */
  onInvalidate: () => void;
  /**
   * Re-runs the `decorate` callback on existing raw items without a
   * server round-trip. Call after external data mutations (e.g. star/unstar)
   * so the cached decorated items are refreshed.
   */
  onRefresh: () => Promise<void>;
  /** Returns the full (unfiltered, decorated) item set from the most recent fetch. */
  getItems: () => UserContentCommonSchema[];
  /** Subscribe to full item snapshot changes. */
  subscribe: (listener: ItemsSnapshotListener) => () => void;
}

/**
 * Safely retrieves a sortable value from an object by key.
 *
 * Returns `null` if the key doesn't exist or the value isn't a sortable type.
 */
const getSortableProperty = (obj: object | undefined, key: string): string | number | null => {
  if (!obj || !(key in obj)) {
    return null;
  }
  const value = (obj as Record<string, unknown>)[key];
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return null;
};

/**
 * Gets the value of a field from a `UserContentCommonSchema` item for sorting.
 *
 * Handles the nested `attributes` structure and provides a fallback chain:
 * 1. Known fields (`title`, `description`, `updatedAt`, `createdAt`).
 * 2. Top-level item fields (`id`, `type`, etc.).
 * 3. Custom attributes (`status`, `priority`, etc.).
 *
 * Returns `null` for missing values so the sorting logic can push them to the end.
 */
const getUserContentFieldValue = (
  item: UserContentCommonSchema,
  field: string
): string | number | null => {
  switch (field) {
    case 'title':
      return item.attributes?.title ?? '';
    case 'description':
      return item.attributes?.description ?? null;
    case 'updatedAt':
      return item.updatedAt ?? null;
    case 'createdAt':
      return item.createdAt ?? null;
    default:
      break;
  }

  const topLevelValue = getSortableProperty(item, field);
  if (topLevelValue !== null) {
    return topLevelValue;
  }

  return getSortableProperty(item.attributes, field);
};

/**
 * Sorts items by a specified field.
 *
 * @param items - The items to sort.
 * @param field - The field name to sort by.
 * @param direction - Sort direction ('asc' or 'desc').
 * @returns A new sorted array (does not mutate the original).
 */
const sortItems = (
  items: UserContentCommonSchema[],
  field: string,
  direction: 'asc' | 'desc',
  customSorts: ContentListSortFieldMap = {}
): UserContentCommonSchema[] => {
  return [...items].sort((a, b) => {
    const customSort = customSorts[field];
    const aValue = customSort?.getValue?.(a) ?? getUserContentFieldValue(a, field);
    const bValue = customSort?.getValue?.(b) ?? getUserContentFieldValue(b, field);

    if (aValue === null && bValue === null) {
      return 0;
    }
    if (aValue === null) {
      return 1;
    }
    if (bValue === null) {
      return -1;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const comparison = aValue.localeCompare(bValue);
      return direction === 'asc' ? comparison : -comparison;
    }

    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
};

/**
 * Extract tag IDs from a `UserContentCommonSchema` references array.
 */
const extractTagIds = (refs?: Array<{ type: string; id: string }>): string[] | undefined => {
  if (!refs) {
    return undefined;
  }
  const tagIds = refs.filter((ref) => ref.type === 'tag').map((ref) => ref.id);
  return tagIds.length > 0 ? tagIds : undefined;
};

/**
 * Safely narrow an `ActiveFilters` value to an {@link IncludeExcludeFilter}.
 */
const asIncludeExclude = (value: ActiveFilters[string]): IncludeExcludeFilter | undefined =>
  value != null &&
  typeof value === 'object' &&
  ('include' in value || 'includeAll' in value || 'exclude' in value)
    ? (value as IncludeExcludeFilter)
    : undefined;

const RESERVED_FILTER_KEYS = new Set<string>(['search']);

/**
 * Apply client-side filters to the item set.
 *
 * - Field filters use registered dimensions.
 * - Boolean flag filters (e.g. `starred`) are detected generically via
 *   {@link getIncludeExcludeFlag} and matched against `item[key]`.
 *
 * Exported so that {@link ContentListClientProvider} facet implementations can
 * apply the same filtering to compute faceted counts.
 */
export const filterItems = (
  items: UserContentCommonSchema[],
  filters: ActiveFilters,
  customFilters: ContentListFilterMap = {}
): UserContentCommonSchema[] => {
  let result = items as DecoratedItem[];

  // Flag keys must match the decorated property name set by the `ItemDecorator`
  // (e.g. `starred` in `ActiveFilters` corresponds to `item.starred`).
  for (const [key, value] of Object.entries(filters)) {
    if (RESERVED_FILTER_KEYS.has(key)) {
      continue;
    }

    const flag = getIncludeExcludeFlag(value);
    if (flag) {
      result = result.filter((item) => {
        const v = item[key];
        return flag.state === 'include' ? v === true : v !== true;
      });
      continue;
    }

    const customFilter = customFilters[key];
    const fieldFilter = asIncludeExclude(value);
    if (!customFilter || !fieldFilter) {
      continue;
    }

    const { include, includeAll, exclude } = fieldFilter;
    if (include?.length) {
      result = result.filter((item) =>
        include.some((filterValue) => matchesFilterValue(item, customFilter, filterValue))
      );
    }
    if (includeAll?.length) {
      result = result.filter((item) =>
        includeAll.every((filterValue) => matchesFilterValue(item, customFilter, filterValue))
      );
    }
    if (exclude?.length) {
      result = result.filter(
        (item) =>
          !exclude.some((filterValue) => matchesFilterValue(item, customFilter, filterValue))
      );
    }
  }

  return result;
};

/**
 * Transforms a `UserContentCommonSchema` item to `ContentListItem`.
 *
 * This is applied only to paginated results for performance.
 * Missing `attributes` or `title` are normalized to an empty string so the UI can still render.
 *
 * Consumer-specific properties on the raw item (top-level or inside `attributes`)
 * are forwarded so that per-item callbacks (e.g. `getHref`, action `enabled`
 * guards) can access them. `title` and `description` are always normalised
 * from `attributes`; additional attribute keys are spread underneath.
 */
const transformItem = (item: UserContentCommonSchema): ContentListItem => {
  // Spread consumer-specific attribute keys (e.g. `timeRestore`) while
  // letting the explicit `title`/`description` assignments win.
  const { title: _t, description: _d, ...extraAttributes } = item.attributes ?? {};

  // Spread consumer-specific top-level keys (e.g. `canManageAccessControl`,
  // `accessMode`) while letting explicit assignments win.
  const {
    id: _id,
    type: _type,
    updatedAt: _ua,
    createdAt: _ca,
    createdBy: _cb,
    updatedBy: _ub,
    managed: _m,
    references: _refs,
    attributes: _attrs,
    ...extraTopLevel
  } = item;

  return {
    ...extraAttributes,
    ...extraTopLevel,
    id: item.id,
    title: item.attributes?.title ?? '',
    description: item.attributes?.description,
    type: item.type,
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    tags: extractTagIds(item.references),
    createdAt: item.createdAt,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    managed: item.managed,
  };
};

/**
 * Creates a client strategy that wraps a `TableListView`-style `findItems` function.
 *
 * The strategy caches the server response keyed by `searchQuery`. When filters,
 * sort, or page change without a new search query, the cached items are reused
 * and only the client-side transforms are reapplied — no server fetch occurs.
 *
 * The core provider calls {@link ClientStrategy.onInvalidate} before any
 * explicit refetch (e.g. after a delete) to force the next `findItems` call
 * to hit the server.
 *
 * @param tableListViewFindItems - The consumer's existing `findItems` function.
 * @param decorate - Optional callback that enriches raw items with external data.
 * @param listingLimit - Maximum number of items to fetch from the server per request.
 * @returns A {@link ClientStrategy} with `findItems`, `onInvalidate`, `onRefresh`, and `getItems`.
 */
export const createClientStrategy = (
  tableListViewFindItems: TableListViewFindItemsFn,
  decorate?: ItemDecorator,
  listingLimit?: number,
  customFilters?: DynamicConfig<ContentListFilterMap>,
  customSorts?: DynamicConfig<ContentListSortFieldMap>
): ClientStrategy => {
  let rawItems: UserContentCommonSchema[] = [];
  let decoratedItems: UserContentCommonSchema[] = [];
  let lastSearchQuery: string | undefined;
  const listeners = new Set<ItemsSnapshotListener>();

  const notify = () => {
    for (const listener of Array.from(listeners)) {
      listener();
    }
  };

  const applyDecoration = async () => {
    decoratedItems = decorate ? await decorate(rawItems) : rawItems;
    notify();
  };

  const findItemsFn: FindItemsFn = async (params: FindItemsParams): Promise<FindItemsResult> => {
    const { searchQuery, filters, sort, page, signal } = params;

    if (lastSearchQuery !== searchQuery) {
      const result = await tableListViewFindItems(
        searchQuery,
        listingLimit !== undefined ? { listingLimit } : undefined,
        signal
      );
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      rawItems = result.hits;
      await applyDecoration();
      lastSearchQuery = searchQuery;
    }

    let items = filterItems(decoratedItems, filters, resolveConfig(customFilters));

    if (sort?.field) {
      items = sortItems(items, sort.field, sort.direction ?? 'asc', resolveConfig(customSorts));
    }

    const start = page.index * page.size;
    const pageItems = items.slice(start, start + page.size);

    return {
      items: pageItems.map(transformItem),
      total: items.length,
    };
  };

  const onInvalidate = () => {
    lastSearchQuery = undefined;
    rawItems = [];
    decoratedItems = [];
    notify();
  };

  const onRefresh = async () => {
    await applyDecoration();
  };

  return {
    findItems: findItemsFn,
    onInvalidate,
    onRefresh,
    getItems: () => decoratedItems,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
