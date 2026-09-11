/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { usePaginationStore } from './context';
import { absentSlice, type FlyoutPaginationValue } from './types';

const absentValue: FlyoutPaginationValue = {
  ...absentSlice,
  openDocumentFlyout: () => {},
};

// Module-level stubs for when there is no PaginationStoreProvider. Defined
// outside the hook so useSyncExternalStore receives stable function references.
const noopSubscribe =
  (_listener: () => void): (() => void) =>
  () => {};
const getAbsentSnapshot = (): typeof absentSlice => absentSlice;

/**
 * Hook that reads the pagination store injected by the nearest
 * `PaginationStoreProvider`. Returns `absentValue` when there is no provider
 * (e.g. flyout opened without pagination support), so callers can safely
 * destructure without null-checking.
 */
export const useFlyoutPagination = (): FlyoutPaginationValue => {
  const store = usePaginationStore();

  const subscribe = useMemo(() => (store ? store.subscribe : noopSubscribe), [store]);
  const getSnapshot = useMemo(() => (store ? store.getSnapshot : getAbsentSnapshot), [store]);

  const slice = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const openDocumentFlyout = useCallback(
    (documentIndex: number): void => {
      store?.getSnapshot().openDocumentFlyoutImpl?.(documentIndex);
    },
    [store]
  );

  return useMemo<FlyoutPaginationValue>(() => {
    if (!store) return absentValue;
    return { ...slice, openDocumentFlyout };
  }, [store, slice, openDocumentFlyout]);
};
