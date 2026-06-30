/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import { useOverviewDisplayOptions } from './use_overview_display_options';

jest.mock('../../../../../hooks/use_kibana_space', () => ({
  useKibanaSpace: () => ({ space: { id: 'default' } }),
}));

const STORAGE_KEY = 'synthetics.overview.displayOptions.v1.default';

/**
 * Force the module-level snapshot cache (a Map kept inside the hook module)
 * to re-read from `localStorage`. Tests run sequentially and share the same
 * module instance, so without resetting the cache a stale value from the
 * previous test would leak into the next render.
 *
 * Reusing the hook's own `storage` listener keeps this honest — if the
 * implementation ever drops that listener, this helper stops working and the
 * tests will surface it.
 */
const refreshSnapshotCache = () => {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: null,
      storageArea: window.localStorage,
    })
  );
};

describe('useOverviewDisplayOptions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    refreshSnapshotCache();
  });

  it('returns the documented defaults when nothing is stored', () => {
    const { result } = renderHook(() => useOverviewDisplayOptions());
    expect(result.current.options).toEqual({ absoluteTimestamps: false });
  });

  it('persists changes to localStorage under the space-scoped versioned key', () => {
    const { result } = renderHook(() => useOverviewDisplayOptions());

    act(() => result.current.setOption('absoluteTimestamps', true));

    expect(result.current.options.absoluteTimestamps).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      absoluteTimestamps: true,
    });
  });

  it('propagates updates from one consumer to all sibling consumers in the same render cycle', () => {
    // This is the regression we hit with `react-use/useLocalStorage`: each
    // hook instance kept its own internal `useState`, so toggling the switch
    // in the popover never re-rendered the rows in the table — they only
    // refreshed after a full reload. The fix routes every consumer through a
    // shared module-level store via `useSyncExternalStore`, which is exactly
    // what we exercise here.
    const reader = renderHook(() => useOverviewDisplayOptions());
    const writer = renderHook(() => useOverviewDisplayOptions());

    expect(reader.result.current.options.absoluteTimestamps).toBe(false);

    act(() => writer.result.current.setOption('absoluteTimestamps', true));

    expect(reader.result.current.options.absoluteTimestamps).toBe(true);
    expect(writer.result.current.options.absoluteTimestamps).toBe(true);
  });

  it('resetOptions wipes stored preferences back to defaults', () => {
    const { result } = renderHook(() => useOverviewDisplayOptions());

    act(() => result.current.setOption('absoluteTimestamps', true));
    expect(result.current.options.absoluteTimestamps).toBe(true);

    act(() => result.current.resetOptions());

    expect(result.current.options).toEqual({ absoluteTimestamps: false });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      absoluteTimestamps: false,
    });
  });

  it('layers stored partial payloads onto the defaults so adding new fields stays backwards-compatible', () => {
    // Simulate an older client having written only the field it knew about.
    // Adding a new option in code shouldn't require users to wipe their
    // localStorage to get the defaulted value back.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ unknownLegacyField: 'whatever' }));
    refreshSnapshotCache();

    const { result } = renderHook(() => useOverviewDisplayOptions());

    expect(result.current.options).toEqual({
      absoluteTimestamps: false,
      // Legacy unknown fields are tolerated rather than rejected — `JSON.parse`
      // happily widens the object, and the spread in the hook keeps the
      // defaulted shape stable.
      unknownLegacyField: 'whatever',
    });
  });
});
