/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { flyoutPaginationStore } from './store';
import { absentSlice, type FlyoutPaginationValue, type ScopedPaginationSlice } from './types';

const absentValue: FlyoutPaginationValue = {
  ...absentSlice,
  openAlertFlyout: () => {},
};

/**
 * Hook that subscribes to the pagination slice owned by `instanceId` and
 * returns its current state. Returns `absentValue` when `instanceId` is
 * `null`, `undefined`, or unknown — consumers render no pagination in that
 * case and no exception is thrown.
 *
 * The `instanceId` is a per-source-instance UUID minted once at source
 * mount (by `usePaginatedFlyout`) and passed through flyout params →
 * `DocumentDetailsContext` → this hook. It is stable for the lifetime of
 * the source, so the `subscribe`/`getSnapshot` functions are effectively
 * stable across renders.
 */
export const useFlyoutPagination = (
  instanceId: string | null | undefined
): FlyoutPaginationValue => {
  const slice = useSyncExternalStore<ScopedPaginationSlice>(
    flyoutPaginationStore.subscribe,
    () => flyoutPaginationStore.getSlice(instanceId ?? null),
    () => flyoutPaginationStore.getSlice(instanceId ?? null)
  );

  // Reads the impl at call-time so swapping the impl (e.g. when the
  // source re-registers it after a page change) is always picked up
  // without the caller needing to re-render.
  const openAlertFlyout = useCallback(
    (alertIndex: number): void => {
      if (!instanceId) return;
      flyoutPaginationStore.getSlice(instanceId).openAlertFlyoutImpl?.(alertIndex);
    },
    [instanceId]
  );

  return useMemo<FlyoutPaginationValue>(() => {
    if (slice === absentSlice && !instanceId) return absentValue;
    return { ...slice, openAlertFlyout };
  }, [instanceId, slice, openAlertFlyout]);
};
