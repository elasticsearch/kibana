/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import { usePaginatedFlyout } from './use_paginated_flyout';
import { __resetFlyoutPaginationStoreForTests, flyoutPaginationStore } from './store';
import { absentSlice } from './types';
import { useIsExperimentalFeatureEnabled } from '../../hooks/use_experimental_features';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useKibana } from '../../lib/kibana';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: (_opts: unknown) => null,
}));

jest.mock('../../hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn(),
}));

jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: jest.fn(),
}));

jest.mock('../../lib/kibana', () => ({
  useKibana: jest.fn(),
}));

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: jest.fn().mockReturnValue({}),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../flyout_v2/shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: jest.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HookOptions = Parameters<typeof usePaginatedFlyout>[0];

const TEST_HISTORY_KEY = Symbol('test-key');

const makeOptions = (overrides?: Partial<HookOptions>): HookOptions => ({
  rightPanelKey: 'test-panel-key',
  resolveDocument: jest.fn().mockReturnValue(null),
  renderBody: jest.fn().mockReturnValue(null),
  historyKey: TEST_HISTORY_KEY,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePaginatedFlyout', () => {
  beforeEach(() => {
    __resetFlyoutPaginationStoreForTests();
    jest.clearAllMocks();
    // Default: V1 mode with fresh stubs.
    (useIsExperimentalFeatureEnabled as jest.Mock).mockReturnValue(false);
    (useExpandableFlyoutApi as jest.Mock).mockReturnValue({ openFlyout: jest.fn() });
    (useKibana as jest.Mock).mockReturnValue({
      services: { overlays: { openSystemFlyout: jest.fn() } },
    });
  });

  it('paginationInstanceId is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const first = result.current.paginationInstanceId;
    rerender();
    expect(result.current.paginationInstanceId).toBe(first);
  });

  it('setState writes to the slice', () => {
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const id = result.current.paginationInstanceId;

    act(() => {
      result.current.setState({ flyoutAlertIndex: 5, totalAlertCount: 50 });
    });

    expect(flyoutPaginationStore.getSlice(id).flyoutAlertIndex).toBe(5);
    expect(flyoutPaginationStore.getSlice(id).totalAlertCount).toBe(50);
  });

  it('closePaginatedFlyout soft-resets displayed-document fields and preserves openAlertFlyoutImpl', () => {
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const id = result.current.paginationInstanceId;

    act(() => {
      result.current.setState({ flyoutAlertIndex: 3, totalAlertCount: 10 });
    });

    act(() => {
      result.current.closePaginatedFlyout();
    });

    const slice = flyoutPaginationStore.getSlice(id);
    // Slice still exists — NOT absentSlice
    expect(slice).not.toBe(absentSlice);
    // Document-state fields are cleared
    expect(slice.flyoutAlertIndex).toBeNull();
    expect(slice.flyoutAlert).toBeNull();
    expect(slice.flyoutDocumentRef).toBeNull();
    expect(slice.isFlyoutAlertLoading).toBe(false);
    expect(slice.totalAlertCount).toBe(0);
    // openAlertFlyoutImpl is still registered (set by the useEffect)
    expect(slice.openAlertFlyoutImpl).not.toBeNull();
  });

  it('openAlertFlyoutImpl survives an open → close → open cycle (regression)', () => {
    const openFlyout = jest.fn();
    (useExpandableFlyoutApi as jest.Mock).mockReturnValue({ openFlyout });
    const resolveDocument = jest.fn().mockReturnValue({
      id: 'doc-1',
      indexName: 'idx',
      scopeId: 'my-scope',
    });
    const { result } = renderHook(() =>
      usePaginatedFlyout(makeOptions({ resolveDocument, rightPanelKey: 'my-panel-key' }))
    );

    // First open
    act(() => {
      result.current.openPaginatedFlyout(0);
    });
    expect(openFlyout).toHaveBeenCalledTimes(1);

    // Close
    act(() => {
      result.current.closePaginatedFlyout();
    });

    // Second open — openAlertFlyoutImpl must still be registered so the
    // in-flyout EuiPagination can dispatch back through openPaginatedFlyout
    act(() => {
      result.current.openPaginatedFlyout(1);
    });
    expect(openFlyout).toHaveBeenCalledTimes(2);

    // And a third cycle for good measure
    act(() => {
      result.current.closePaginatedFlyout();
    });
    act(() => {
      result.current.openPaginatedFlyout(2);
    });
    expect(openFlyout).toHaveBeenCalledTimes(3);
  });

  it('registers openAlertFlyoutImpl after mount', () => {
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const id = result.current.paginationInstanceId;
    expect(flyoutPaginationStore.getSlice(id).openAlertFlyoutImpl).not.toBeNull();
  });

  it('removes slice on unmount so getSlice returns absentSlice', () => {
    const { result, unmount } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const id = result.current.paginationInstanceId;

    act(() => {
      result.current.setState({ flyoutAlertIndex: 2 });
    });

    unmount();

    expect(flyoutPaginationStore.getSlice(id)).toBe(absentSlice);
  });

  it('two concurrent hook instances have isolated slices', () => {
    const { result: r1 } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const { result: r2 } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const id1 = r1.current.paginationInstanceId;
    const id2 = r2.current.paginationInstanceId;

    act(() => {
      r1.current.setState({ flyoutAlertIndex: 5, totalAlertCount: 50 });
    });

    expect(flyoutPaginationStore.getSlice(id1).flyoutAlertIndex).toBe(5);
    expect(flyoutPaginationStore.getSlice(id2).flyoutAlertIndex).toBeNull();
  });

  it('openPaginatedFlyout calls resolveDocument and sets flyoutAlertIndex', () => {
    const resolveDocument = jest.fn().mockReturnValue(null);
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions({ resolveDocument })));
    const id = result.current.paginationInstanceId;

    act(() => {
      result.current.openPaginatedFlyout(5);
    });

    expect(resolveDocument).toHaveBeenCalled();
    expect(flyoutPaginationStore.getSlice(id).flyoutAlertIndex).toBe(5);
  });

  describe('V1 mode (newFlyoutSystemEnabled = false)', () => {
    beforeEach(() => (useIsExperimentalFeatureEnabled as jest.Mock).mockReturnValue(false));

    it('calls openFlyout when a document is resolved', () => {
      const openFlyout = jest.fn();
      (useExpandableFlyoutApi as jest.Mock).mockReturnValue({ openFlyout });
      const resolveDocument = jest.fn().mockReturnValue({
        id: 'doc-1',
        indexName: 'idx',
        scopeId: 'my-scope',
      });
      const { result } = renderHook(() =>
        usePaginatedFlyout(makeOptions({ resolveDocument, rightPanelKey: 'my-panel-key' }))
      );
      const id = result.current.paginationInstanceId;

      act(() => {
        result.current.openPaginatedFlyout(3);
      });

      expect(openFlyout).toHaveBeenCalledWith({
        right: {
          id: 'my-panel-key',
          params: {
            id: 'doc-1',
            indexName: 'idx',
            scopeId: 'my-scope',
            paginationInstanceId: id,
          },
        },
      });
    });

    it('does not call openFlyout when resolveDocument returns null (cross-page)', () => {
      const openFlyout = jest.fn();
      (useExpandableFlyoutApi as jest.Mock).mockReturnValue({ openFlyout });
      const resolveDocument = jest.fn().mockReturnValue(null);
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions({ resolveDocument })));

      act(() => {
        result.current.openPaginatedFlyout(0);
      });

      expect(openFlyout).not.toHaveBeenCalled();
    });
  });

  describe('V2 mode (newFlyoutSystemEnabled = true)', () => {
    beforeEach(() => (useIsExperimentalFeatureEnabled as jest.Mock).mockReturnValue(true));

    it('calls openSystemFlyout only once on repeated opens', () => {
      const openSystemFlyout = jest.fn().mockReturnValue({ close: jest.fn() });
      (useKibana as jest.Mock).mockReturnValue({
        services: { overlays: { openSystemFlyout } },
      });

      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      act(() => {
        result.current.openPaginatedFlyout(0);
        result.current.openPaginatedFlyout(1);
      });

      expect(openSystemFlyout).toHaveBeenCalledTimes(1);
    });

    it('closePaginatedFlyout closes the V2 overlay', () => {
      const close = jest.fn();
      const openSystemFlyout = jest.fn().mockReturnValue({ close });
      (useKibana as jest.Mock).mockReturnValue({
        services: { overlays: { openSystemFlyout } },
      });

      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      act(() => {
        result.current.openPaginatedFlyout(0);
      });

      act(() => {
        result.current.closePaginatedFlyout();
      });

      expect(close).toHaveBeenCalled();
    });
  });
});
