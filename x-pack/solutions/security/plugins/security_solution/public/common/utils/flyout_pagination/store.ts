/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type ScopedPaginationSlice, absentSlice } from './types';

// Module-scoped store: a Map from per-source-instance UUID to its slice.
// Using a Map (over a plain Record) avoids spread-without-key tricks on
// removal and keeps per-slice referential equality intact: mutating one
// slice's entry does not change the Map identity of other entries, so
// `useSyncExternalStore` consumers reading a different slice don't re-render.
const scopedSlicesById = new Map<string, ScopedPaginationSlice>();
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const flyoutPaginationStore = {
  /**
   * Subscribe to any store change. Returns an unsubscribe function. All
   * per-slice consumers share the same subscription; React dedupes re-renders
   * because `getSlice` returns the same reference when the slice hasn't
   * changed.
   */
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Returns the slice for the given id, or `absentSlice` when the id is
   * `null`, `undefined`, or unknown. The returned reference is stable as
   * long as the slice has not been mutated, so `useSyncExternalStore`
   * consumers only re-render when their own slice changes.
   */
  getSlice: (id: string | null | undefined): ScopedPaginationSlice => {
    if (!id) return absentSlice;
    return scopedSlicesById.get(id) ?? absentSlice;
  },

  /**
   * Merge a partial update into the slice identified by `id`. Creates the
   * slice if it does not already exist. No-ops when the merged result would
   * be shallowly equal to the current slice.
   */
  setSlice: (id: string, partial: Partial<ScopedPaginationSlice>): void => {
    const current = scopedSlicesById.get(id) ?? absentSlice;
    let changed = false;
    for (const key of Object.keys(partial) as Array<keyof ScopedPaginationSlice>) {
      if (partial[key] !== current[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    scopedSlicesById.set(id, { ...current, ...partial });
    notify();
  },

  /**
   * Remove the slice for the given id and notify subscribers. No-ops when
   * the id has no slice. Call this from each source's close / unmount
   * handler.
   */
  removeSlice: (id: string): void => {
    if (!scopedSlicesById.has(id)) return;
    scopedSlicesById.delete(id);
    notify();
  },
};

/**
 * Test-only helper. Resets the store to an empty state and clears all
 * listeners so each test starts from a clean slate without leaking
 * subscriptions across suites.
 */
export const __resetFlyoutPaginationStoreForTests = (): void => {
  scopedSlicesById.clear();
  listeners.clear();
};
