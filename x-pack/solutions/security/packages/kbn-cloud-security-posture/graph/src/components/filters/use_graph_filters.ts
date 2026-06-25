/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Filter } from '@kbn/es-query';
import { getOrCreateFilterStore, destroyFilterStore, emitPinnedEuidToggle } from './filter_store';

/**
 * Hook that manages graph filter state for a specific scope.
 *
 * This hook:
 * 1. Creates or retrieves a FilterStore for the given scopeId
 * 2. Subscribes to filter changes from the store using useSyncExternalStore
 * 3. Subscribes to expanded entity IDs from the store using useSyncExternalStore
 * 4. Automatically re-renders when filters or entity relationships change
 * 5. Provides setSearchFilters for SearchBar's onFiltersUpdated callback
 * 6. Computes entityIdsForApi from expandedEntityIds for graph data fetching
 * 7. Cleans up and destroys the store on unmount
 *
 * @param scopeId - Unique identifier for the graph instance
 * @param dataViewId - The data view ID used when constructing new filters
 * @returns Object containing searchFilters, setSearchFilters, entityIdsForApi
 */
export const useGraphFilters = (
  scopeId: string,
  initialEntityIds: Array<{
    /**
     * The ID of the entity.
     */
    id: string;

    /**
     * Whether this entity is the origin of the graph (for centering).
     */
    isOrigin: boolean;
  }>,
  dataViewId: string
): {
  searchFilters: Filter[];
  setSearchFilters: (filters: Filter[]) => void;
  entityIdsForApi: Array<{ id: string; isOrigin: boolean }> | undefined;
  pinnedEuids: string[];
} => {
  // Get or create the FilterStore for this scopeId
  const store = useMemo(() => getOrCreateFilterStore(scopeId), [scopeId]);

  // Update dataViewId when it changes; auto-pin origin entities so they always
  // appear as individual nodes and are never merged into a grouped actor node.
  useEffect(() => {
    store.setDataViewId(dataViewId);
    store.setInitialEntityIds(initialEntityIds);
    initialEntityIds
      .filter(({ isOrigin }) => isOrigin)
      .forEach(({ id }) => emitPinnedEuidToggle(scopeId, id, 'show'));
  }, [store, dataViewId, initialEntityIds, scopeId]);

  // Clean up store on unmount or when scopeId changes
  useEffect(() => {
    return () => {
      destroyFilterStore(scopeId);
    };
  }, [scopeId]);

  // Subscribe function for useSyncExternalStore (filters)
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const subscription = store.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    [store]
  );

  // Snapshot function for useSyncExternalStore (filters)
  const getSnapshot = useCallback(() => store.getFilters(), [store]);

  // Use React 18's useSyncExternalStore for optimal concurrent rendering support
  const searchFilters = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Subscribe function for useSyncExternalStore (expanded entity IDs)
  const subscribeToExpandedEntityIds = useCallback(
    (onStoreChange: () => void) => {
      const subscription = store.subscribeToExpandedEntityIds(onStoreChange);
      return () => subscription.unsubscribe();
    },
    [store]
  );

  // Snapshot function for useSyncExternalStore (expanded entity IDs)
  const getExpandedEntityIdsSnapshot = useCallback(() => store.getExpandedEntityIds(), [store]);

  const expandedEntityIds = useSyncExternalStore(
    subscribeToExpandedEntityIds,
    getExpandedEntityIdsSnapshot,
    getExpandedEntityIdsSnapshot
  );

  // Callback for SearchBar's onFiltersUpdated - sets filters directly in store
  const setSearchFilters = useCallback(
    (filters: Filter[]) => {
      store.setFilters(filters);
    },
    [store]
  );

  // Subscribe function for useSyncExternalStore (pinned EUIDs)
  const subscribeToPinnedEuids = useCallback(
    (onStoreChange: () => void) => {
      const subscription = store.subscribeToPinnedEuids(onStoreChange);
      return () => subscription.unsubscribe();
    },
    [store]
  );

  // Snapshot function for useSyncExternalStore (pinned EUIDs)
  const getPinnedEuidsSnapshot = useCallback(() => store.getPinnedEuids(), [store]);

  const pinnedEuidsSet = useSyncExternalStore(
    subscribeToPinnedEuids,
    getPinnedEuidsSnapshot,
    getPinnedEuidsSnapshot
  );

  const pinnedEuids = useMemo(() => Array.from(pinnedEuidsSet), [pinnedEuidsSet]);

  // Convert expandedEntityIds Set to API format
  const entityIdsForApi = useMemo(() => {
    if (expandedEntityIds.size === 0) return initialEntityIds;

    return initialEntityIds.concat(
      Array.from(expandedEntityIds)
        .filter((id) => !initialEntityIds.some((entity) => entity.id === id))
        .map((id) => ({
          id,
          isOrigin: false, // User-expanded entities are not the graph origin
        }))
    );
  }, [expandedEntityIds, initialEntityIds]);

  return {
    searchFilters,
    setSearchFilters,
    entityIdsForApi,
    pinnedEuids,
  };
};
