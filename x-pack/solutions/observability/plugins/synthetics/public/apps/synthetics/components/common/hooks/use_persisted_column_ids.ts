/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useKibanaSpace } from '../../../../../hooks/use_kibana_space';

/**
 * Space-scoped visible-column ids persisted in localStorage.
 *
 * Follows the same `useSyncExternalStore` + module cache pattern as
 * `useOverviewDisplayOptions` so a toolbar selector and the table that
 * consumes the ids stay in lockstep without lifting state.
 */
const snapshots = new Map<string, string[]>();
const defaultsByKey = new Map<string, string[]>();
const listeners = new Set<() => void>();

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string');
}

function readFromStorage(key: string, defaults: string[]): string[] {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    return isStringArray(parsed) ? parsed : defaults;
  } catch {
    return defaults;
  }
}

function getSnapshotFor(key: string, defaults: string[]): string[] {
  if (!snapshots.has(key)) {
    snapshots.set(key, readFromStorage(key, defaults));
  }
  return snapshots.get(key)!;
}

function idsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function writeSnapshot(key: string, next: string[]) {
  const prev = snapshots.get(key);
  if (prev && idsEqual(prev, next)) {
    return;
  }
  snapshots.set(key, next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Quota errors still update the in-memory snapshot for this session.
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

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || !defaultsByKey.has(event.key)) return;
    snapshots.set(event.key, readFromStorage(event.key, defaultsByKey.get(event.key)!));
    listeners.forEach((listener) => listener());
  });
}

export function usePersistedColumnIds(
  storageKeyPrefix: string,
  defaultVisibleColumnIds: string[]
): {
  visibleColumnIds: string[];
  setVisibleColumnIds: (ids: string[]) => void;
} {
  const { space } = useKibanaSpace();
  const storageKey = storageKeyPrefix + (space?.id ?? 'default');
  defaultsByKey.set(storageKey, defaultVisibleColumnIds);

  const getSnapshot = useCallback(
    () => getSnapshotFor(storageKey, defaultVisibleColumnIds),
    [defaultVisibleColumnIds, storageKey]
  );
  const getServerSnapshot = useCallback(() => defaultVisibleColumnIds, [defaultVisibleColumnIds]);
  const visibleColumnIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setVisibleColumnIds = useCallback(
    (ids: string[]) => {
      writeSnapshot(storageKey, ids);
    },
    [storageKey]
  );

  return { visibleColumnIds, setVisibleColumnIds };
}
