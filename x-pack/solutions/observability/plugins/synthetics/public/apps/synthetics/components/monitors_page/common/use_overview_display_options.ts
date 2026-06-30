/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useKibanaSpace } from '../../../../../hooks/use_kibana_space';

/**
 * Cosmetic, per-user, per-space preferences for the Synthetics overview list.
 *
 * These settings are persisted in `localStorage` (scoped by space id) because
 * they're purely UI-shaping — sharing a URL must not transplant another user's
 * preferences onto the recipient. URL-driven flags (filters, sort, etc.) live
 * elsewhere in `MonitorOverviewPageState`.
 *
 * Versioning the storage key (`v1`) gives us an easy migration story: if the
 * shape changes, bump to `v2` and the old payload is ignored without code
 * needing to support multiple shapes.
 *
 * Implementation note: we deliberately avoid `react-use/useLocalStorage` here
 * because it scopes its internal state per hook-instance, so writes from one
 * component (e.g. the display-options popover) do not propagate to siblings
 * reading the same key (e.g. each row's status column) until they remount.
 * Instead we keep a module-level cache + listener set and surface it to React
 * via `useSyncExternalStore`, giving us a single source of truth that fans
 * out to every consumer in the same render cycle.
 */
export interface OverviewDisplayOptions {
  /** When true, render absolute (locale) timestamps instead of relative ones. */
  absoluteTimestamps: boolean;
}

const DEFAULTS: OverviewDisplayOptions = {
  absoluteTimestamps: false,
};

const STORAGE_KEY_PREFIX = 'synthetics.overview.displayOptions.v1.';

export interface UseOverviewDisplayOptionsResult {
  options: OverviewDisplayOptions;
  setOption: <K extends keyof OverviewDisplayOptions>(
    key: K,
    value: OverviewDisplayOptions[K]
  ) => void;
  resetOptions: () => void;
}

// --- Module-level store ----------------------------------------------------
// Snapshots are cached per storage key so that `getSnapshot` returns a stable
// reference when nothing has changed (a hard requirement for
// `useSyncExternalStore`, otherwise React will tear down/render in a loop).
const snapshots = new Map<string, OverviewDisplayOptions>();
const listeners = new Set<() => void>();

function readFromStorage(key: string): OverviewDisplayOptions {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<OverviewDisplayOptions>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function getSnapshotFor(key: string): OverviewDisplayOptions {
  if (!snapshots.has(key)) {
    snapshots.set(key, readFromStorage(key));
  }
  return snapshots.get(key)!;
}

function writeSnapshot(key: string, next: OverviewDisplayOptions) {
  snapshots.set(key, next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Ignore quota errors etc — the in-memory snapshot still updates so the
      // UI reflects the change for this session.
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Pick up cross-tab changes too, so toggling preferences in one window
// updates open siblings without forcing a reload.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.startsWith(STORAGE_KEY_PREFIX)) return;
    snapshots.set(event.key, readFromStorage(event.key));
    listeners.forEach((listener) => listener());
  });
}

export function useOverviewDisplayOptions(): UseOverviewDisplayOptionsResult {
  const { space } = useKibanaSpace();
  // Fall back to a stable key when the space is still loading so the hook
  // remains stable; once the space resolves we transparently switch to the
  // space-scoped key. This avoids brief flashes of "wrong" prefs.
  const storageKey = STORAGE_KEY_PREFIX + (space?.id ?? 'default');

  const getSnapshot = useCallback(() => getSnapshotFor(storageKey), [storageKey]);
  const getServerSnapshot = useCallback(() => DEFAULTS, []);
  const options = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setOption = useCallback(
    <K extends keyof OverviewDisplayOptions>(key: K, value: OverviewDisplayOptions[K]) => {
      writeSnapshot(storageKey, { ...getSnapshotFor(storageKey), [key]: value });
    },
    [storageKey]
  );

  const resetOptions = useCallback(() => {
    writeSnapshot(storageKey, DEFAULTS);
  }, [storageKey]);

  return { options, setOption, resetOptions };
}
