/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';
import type { FavoritesClientPublic } from '@kbn/content-management-favorites-public';
import { MOCK_DASHBOARDS, type DashboardMockItem } from './dashboards';
import { MOCK_MAPS, type MapMockItem } from './maps';
import { MOCK_FILES, type FileMockItem } from './files';
import { MOCK_VISUALIZATIONS, type VisualizationMockItem } from './visualizations';
import { MOCK_USER_PROFILES } from './user_profiles';
import { mockFavoritesClient } from './services';

/** Shape compatible with `ActiveFilters` from `@kbn/content-list-provider`. Defined locally to avoid circular dependency. */
interface MockFindItemsFilters {
  search?: string;
  tag?: { include?: string[]; includeAll?: string[]; exclude?: string[] };
  createdBy?: { include?: string[]; includeAll?: string[]; exclude?: string[] };
  starred?: { state: 'include' | 'exclude' };
}

/** Whether an item carries the given tag id in its references. */
const itemHasTag = (item: UserContentCommonSchema, tag: string): boolean =>
  item.references?.some((ref) => ref.id === tag) ?? false;

/**
 * Extracts tag IDs from a `UserContentCommonSchema` item's `references` array.
 *
 * Mock items store tags as `{ type: 'tag', id: 'tag-id' }` references. This
 * helper converts them into a flat `string[]` suitable for `ContentListItem.tags`.
 */
export const extractTagIds = (
  references: UserContentCommonSchema['references']
): string[] | undefined => {
  const tagIds = references?.filter((ref) => ref.type === 'tag').map((ref) => ref.id);
  return tagIds && tagIds.length > 0 ? tagIds : undefined;
};

/**
 * Generic mock item type
 */
export type MockContentItem =
  | DashboardMockItem
  | MapMockItem
  | FileMockItem
  | VisualizationMockItem;

/**
 * Configuration for creating a mock findItems function
 */
export interface MockFindItemsConfig<T extends UserContentCommonSchema> {
  /** The source array of mock items. */
  items: T[];
  /** Optional delay in milliseconds to simulate network latency. */
  delay?: number;
  /** Optional function to handle status field sorting. */
  statusSortFn?: (a: T, b: T, direction: 'asc' | 'desc') => number;
  /**
   * Favorites client instance used to resolve starred-item filtering.
   *
   * Defaults to the module-level {@link mockFavoritesClient} singleton.
   * Pass a story-specific client to ensure the same instance is shared
   * between the provider (`services.favorites`) and `findItems`, so that
   * starred items are immediately visible when the `starred` filter is toggled.
   */
  favoritesClient?: FavoritesClientPublic;
}

/**
 * Create a mock findItems function for testing
 */
export function createMockFindItems<T extends UserContentCommonSchema>(
  config: MockFindItemsConfig<T>
) {
  const {
    items: sourceItems,
    delay = 0,
    statusSortFn: customStatusSortFn,
    favoritesClient: configFavoritesClient,
  } = config;

  return async ({
    searchQuery,
    filters,
    sort,
    page,
  }: {
    searchQuery?: string;
    filters: MockFindItemsFilters;
    sort: { field: string; direction: 'asc' | 'desc' };
    page: { index: number; size: number };
  }) => {
    // Simulate network delay
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    let items = [...sourceItems];

    // Apply search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.attributes.title?.toLowerCase().includes(query) ||
          (item.attributes as { description?: string }).description?.toLowerCase().includes(query)
      );
    }

    // Apply tag include filters
    const tagFilter = filters.tag;
    const includeTags = tagFilter?.include;
    if (includeTags && includeTags.length > 0) {
      items = items.filter((item) => includeTags.some((tag) => itemHasTag(item, tag)));
    }

    // Apply tag match-all (AND) filters
    const includeAllTags = tagFilter?.includeAll;
    if (includeAllTags && includeAllTags.length > 0) {
      items = items.filter((item) => includeAllTags.every((tag) => itemHasTag(item, tag)));
    }

    // Apply tag exclude filters
    const excludeTags = tagFilter?.exclude;
    if (excludeTags && excludeTags.length > 0) {
      items = items.filter((item) => !excludeTags.some((tag) => itemHasTag(item, tag)));
    }

    // Apply createdBy include filters (UIDs from query model).
    const createdByFilter = filters.createdBy;
    const includeCreators = createdByFilter?.include;
    if (includeCreators && includeCreators.length > 0) {
      items = items.filter((item) => matchesUserFilter(item, includeCreators));
    }

    // Apply createdBy match-all (AND) filters. Each value must match individually, so
    // multiple distinct creators yield nothing since an item has a single creator.
    const includeAllCreators = createdByFilter?.includeAll;
    if (includeAllCreators && includeAllCreators.length > 0) {
      items = items.filter((item) =>
        includeAllCreators.every((creator) => matchesUserFilter(item, [creator]))
      );
    }

    // Apply createdBy exclude filters.
    const excludeCreators = createdByFilter?.exclude;
    if (excludeCreators && excludeCreators.length > 0) {
      items = items.filter((item) => !matchesUserFilter(item, excludeCreators));
    }

    // Apply starred filter.
    if (filters.starred?.state === 'include') {
      const client = configFavoritesClient ?? mockFavoritesClient;
      const favorites = await client.getFavorites();
      items = items.filter((item) => favorites.favoriteIds.includes(item.id));
    }

    // Apply sorting
    items.sort((a, b) => {
      // Special handling for status field if provided
      if (sort.field === 'status' && customStatusSortFn) {
        return customStatusSortFn(a, b, sort.direction);
      }

      const getFieldValue = (item: T, field: string): unknown => {
        if (field in item) {
          return (item as Record<string, unknown>)[field];
        }
        if (field in item.attributes) {
          return (item.attributes as Record<string, unknown>)[field];
        }
        return undefined;
      };

      const aValue = getFieldValue(a, sort.field);
      const bValue = getFieldValue(b, sort.field);

      if (aValue == null || bValue == null) {
        return 0;
      }

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    // Apply pagination.
    const total = items.length;
    const start = page.index * page.size;
    const end = start + page.size;
    const paginatedItems = items.slice(start, end);

    return {
      items: paginatedItems,
      total,
    };
  };
}

// =============================================================================
// PRE-CONFIGURED MOCK FIND ITEMS FUNCTIONS
// =============================================================================

/**
 * Pre-configured mock findItems for dashboards
 */
export const mockFindDashboards = createMockFindItems({
  items: MOCK_DASHBOARDS,
});

/**
 * Pre-configured mock findItems for maps
 */
export const mockFindMaps = createMockFindItems({
  items: MOCK_MAPS,
});

/**
 * Pre-configured mock findItems for files
 */
export const mockFindFiles = createMockFindItems({
  items: MOCK_FILES,
});

/**
 * Pre-configured mock findItems for visualizations
 */
export const mockFindVisualizations = createMockFindItems({
  items: MOCK_VISUALIZATIONS,
});

// =============================================================================
// SIMPLE MOCK FIND ITEMS FOR EXAMPLES (from kbn-content-list-examples/util)
// =============================================================================

/**
 * Dashboard item with status field for the Customization story.
 * Extends UserContentCommonSchema with dashboard-specific fields.
 */
export interface ItemWithStatus extends UserContentCommonSchema {
  attributes: {
    title: string;
    description?: string;
    timeRestore: boolean;
  };
  /** Dashboards can be favorited */
  canFavorite: true;
}

/**
 * Inline mock dashboard data with pre-assigned status values.
 * This ensures status variety is always present regardless of imports.
 * These items match the DashboardSavedObjectUserContent structure from the real implementation.
 */
const EXAMPLE_MOCK_ITEMS: ItemWithStatus[] = [
  {
    id: 'dashboard-001',
    type: 'dashboard',
    updatedAt: '2025-11-15T14:30:00.000Z',
    updatedBy: 'u_665722084_cloud',
    createdAt: '2025-10-01T09:00:00.000Z',
    createdBy: 'u_665722084_cloud',
    attributes: {
      title: '[eCommerce] Revenue Dashboard',
      description: 'Analyze mock eCommerce orders and revenue metrics',
      timeRestore: true,
    },
    references: [
      { type: 'tag', id: 'tag-production', name: 'Production' },
      { type: 'tag', id: 'tag-important', name: 'Important' },
    ],
    canFavorite: true,
  },
  {
    id: 'dashboard-002',
    type: 'dashboard',
    updatedAt: '2025-11-10T08:15:00.000Z',
    updatedBy: 'u_jane_doe',
    createdAt: '2025-09-15T11:30:00.000Z',
    createdBy: 'u_admin_local',
    attributes: {
      title: '[Security] Detection Rule Monitoring',
      description: 'Monitor the health and performance of detection rules',
      timeRestore: false,
    },
    references: [
      { type: 'tag', id: 'tag-security', name: 'Security' },
      { type: 'tag', id: 'fleet-managed-default', name: 'Managed' },
    ],
    canFavorite: true,
  },
  {
    id: 'dashboard-003',
    type: 'dashboard',
    updatedAt: '2025-11-12T16:45:00.000Z',
    updatedBy: 'u_665722084_cloud',
    createdAt: '2025-08-20T14:00:00.000Z',
    createdBy: 'u_665722084_cloud',
    attributes: {
      title: '[Flights] Global Flight Dashboard',
      description: 'Analyze mock flight data for ES-Air, Logstash Airways, Kibana Airlines',
      timeRestore: true,
    },
    references: [{ type: 'tag', id: 'tag-development', name: 'Development' }],
    canFavorite: true,
  },
  {
    id: 'dashboard-004',
    type: 'dashboard',
    updatedAt: '2025-10-28T10:00:00.000Z',
    updatedBy: 'u_analyst_1',
    createdAt: '2025-07-10T08:30:00.000Z',
    createdBy: 'u_john_smith',
    attributes: {
      title: '[Logs] Web Traffic Analysis',
      description: "Analyze web traffic log data for Elastic's website",
      timeRestore: true,
    },
    references: [{ type: 'tag', id: 'tag-production', name: 'Production' }],
    canFavorite: true,
  },
  {
    id: 'dashboard-005',
    type: 'dashboard',
    updatedAt: '2025-11-01T12:00:00.000Z',
    createdAt: '2025-06-01T10:00:00.000Z',
    createdBy: 'u_admin_local',
    attributes: {
      title: 'Infrastructure Overview',
      description: 'Server and container metrics overview',
      timeRestore: false,
    },
    references: [],
    canFavorite: true,
  },
  {
    id: 'dashboard-006',
    type: 'dashboard',
    updatedAt: '2025-09-15T09:30:00.000Z',
    updatedBy: 'u_jane_doe',
    createdAt: '2025-05-20T15:45:00.000Z',
    createdBy: 'u_jane_doe',
    attributes: {
      title: 'APM Service Map',
      description: 'Application performance monitoring service dependencies',
      timeRestore: false,
    },
    references: [{ type: 'tag', id: 'tag-archived', name: 'Archived' }],
    canFavorite: true,
  },
  {
    id: 'dashboard-007',
    type: 'dashboard',
    updatedAt: '2025-11-14T11:20:00.000Z',
    updatedBy: 'u_665722084_cloud',
    createdAt: '2025-04-10T13:00:00.000Z',
    createdBy: 'u_admin_local',
    attributes: {
      title: 'ML Anomaly Explorer',
      description: 'Machine learning anomaly detection results',
      timeRestore: false,
    },
    references: [
      { type: 'tag', id: 'tag-development', name: 'Development' },
      { type: 'tag', id: 'tag-important', name: 'Important' },
    ],
    canFavorite: true,
  },
  {
    id: 'dashboard-008',
    type: 'dashboard',
    updatedAt: '2025-08-20T14:00:00.000Z',
    createdAt: '2025-03-05T09:15:00.000Z',
    createdBy: 'u_john_smith',
    attributes: {
      title: 'Uptime Monitoring',
      description: 'Monitor service uptime and availability',
      timeRestore: true,
    },
    references: [{ type: 'tag', id: 'tag-production', name: 'Production' }],
    canFavorite: true,
  },
];

/**
 * Sentinel value for filtering items without a creator.
 *
 * @deprecated Use `MOCK_MANAGED_FILTER` or `MOCK_NO_CREATOR_FILTER` instead.
 */
export const NULL_USER = 'no-user';

/** Local sentinel matching `MANAGED_USER_FILTER` from `@kbn/content-list-provider`. */
const MOCK_MANAGED_FILTER = '__managed__';

/** Local sentinel matching `NO_CREATOR_USER_FILTER` from `@kbn/content-list-provider`. */
const MOCK_NO_CREATOR_FILTER = '__no_creator__';

/**
 * Build a map of email → uid for user profile lookup.
 * Used to resolve email-based createdBy filters to user IDs.
 */
const EMAIL_TO_UID_MAP: Record<string, string> = MOCK_USER_PROFILES.reduce<Record<string, string>>(
  (acc, profile) => {
    if (profile.user.email) {
      acc[profile.user.email] = profile.uid;
    }
    return acc;
  },
  {}
);

/**
 * Resolve a filter value (email or uid) to a user ID.
 * Supports both email-based filtering (new) and uid-based filtering (legacy).
 */
function resolveToUid(filterValue: string): string | undefined {
  // If it's an email, resolve to uid
  if (EMAIL_TO_UID_MAP[filterValue]) {
    return EMAIL_TO_UID_MAP[filterValue];
  }
  // If it's already a uid (or unknown value), return as-is
  return filterValue;
}

/**
 * Check if an item matches the `createdBy` filter values.
 *
 * Recognises the `__managed__` and `__no_creator__` sentinels from
 * `@kbn/content-list-provider`, as well as the legacy `NULL_USER` value.
 * Regular UIDs and emails are resolved through `resolveToUid`.
 */
function matchesUserFilter(
  item: { createdBy?: string; managed?: boolean },
  filterValues: string[]
): boolean {
  const includesManaged = filterValues.includes(MOCK_MANAGED_FILTER);
  const includesNoCreator =
    filterValues.includes(MOCK_NO_CREATOR_FILTER) || filterValues.includes(NULL_USER);

  if (item.managed && includesManaged) {
    return true;
  }

  if (!item.createdBy && !item.managed && includesNoCreator) {
    return true;
  }

  const resolvedUids = filterValues
    .filter((v) => v !== MOCK_MANAGED_FILTER && v !== MOCK_NO_CREATOR_FILTER && v !== NULL_USER)
    .map(resolveToUid)
    .filter((uid): uid is string => uid !== undefined);

  if (!item.createdBy) {
    return false;
  }

  return resolvedUids.includes(item.createdBy);
}

/**
 * Create mock findItems function for dashboard stories.
 * Simplified API for examples - just pass optional delay.
 *
 * This function uses inline mock data with pre-assigned status values.
 *
 * @param delay - Optional delay in milliseconds to simulate network latency.
 * @param favoritesClient - Optional favorites client. Defaults to the module-level
 *   {@link mockFavoritesClient} singleton. Pass a story-specific instance to ensure
 *   the same client is shared with the provider's `services.favorites`.
 */
export const createSimpleMockFindItems = (
  delay: number = 0,
  favoritesClient?: FavoritesClientPublic
) => {
  return async ({
    searchQuery,
    filters,
    sort,
    page,
  }: {
    searchQuery?: string;
    filters: MockFindItemsFilters;
    sort: { field: string; direction: 'asc' | 'desc' };
    page: { index: number; size: number };
  }) => {
    // Simulate network delay
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Start with all items (already have status inline)
    let items = [...EXAMPLE_MOCK_ITEMS];

    // Apply search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.attributes.title?.toLowerCase().includes(query) ||
          (item.attributes as { description?: string }).description?.toLowerCase().includes(query)
      );
    }

    // Apply tag include filters
    const tagFilter = filters.tag;
    const includeTags = tagFilter?.include;
    if (includeTags && includeTags.length > 0) {
      items = items.filter((item) => includeTags.some((tag) => itemHasTag(item, tag)));
    }

    // Apply tag match-all (AND) filters
    const includeAllTags = tagFilter?.includeAll;
    if (includeAllTags && includeAllTags.length > 0) {
      items = items.filter((item) => includeAllTags.every((tag) => itemHasTag(item, tag)));
    }

    // Apply tag exclude filters
    const excludeTags = tagFilter?.exclude;
    if (excludeTags && excludeTags.length > 0) {
      items = items.filter((item) => !excludeTags.some((tag) => itemHasTag(item, tag)));
    }

    // Apply createdBy include filters (UIDs from query model).
    const createdByFilter = filters.createdBy;
    const includeCreators = createdByFilter?.include;
    if (includeCreators && includeCreators.length > 0) {
      items = items.filter((item) => matchesUserFilter(item, includeCreators));
    }

    // Apply createdBy match-all (AND) filters. Each value must match individually, so
    // multiple distinct creators yield nothing since an item has a single creator.
    const includeAllCreators = createdByFilter?.includeAll;
    if (includeAllCreators && includeAllCreators.length > 0) {
      items = items.filter((item) =>
        includeAllCreators.every((creator) => matchesUserFilter(item, [creator]))
      );
    }

    // Apply createdBy exclude filters.
    const excludeCreators = createdByFilter?.exclude;
    if (excludeCreators && excludeCreators.length > 0) {
      items = items.filter((item) => !matchesUserFilter(item, excludeCreators));
    }

    // Apply starred filter.
    if (filters.starred?.state === 'include') {
      const client = favoritesClient ?? mockFavoritesClient;
      const favorites = await client.getFavorites();
      items = items.filter((item) => favorites.favoriteIds.includes(item.id));
    }

    // Apply sorting
    items.sort((a, b) => {
      const getFieldValue = (item: ItemWithStatus, field: string): unknown => {
        if (field in item) {
          return (item as unknown as Record<string, unknown>)[field];
        }
        if (field in item.attributes) {
          return (item.attributes as unknown as Record<string, unknown>)[field];
        }
        return undefined;
      };

      const aValue = getFieldValue(a, sort.field);
      const bValue = getFieldValue(b, sort.field);

      if (aValue == null || bValue == null) {
        return 0;
      }

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    // Apply pagination.
    const total = items.length;
    const start = page.index * page.size;
    const end = start + page.size;
    const paginatedItems = items.slice(start, end);

    return {
      items: paginatedItems,
      total,
    };
  };
};
