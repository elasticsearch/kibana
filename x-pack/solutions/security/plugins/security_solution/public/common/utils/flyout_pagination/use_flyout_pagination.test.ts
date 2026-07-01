/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import type { Alert } from '@kbn/alerting-types';
import { useFlyoutPagination } from './use_flyout_pagination';
import { __resetFlyoutPaginationStoreForTests, flyoutPaginationStore } from './store';
import { absentSlice } from './types';

const sampleAlert = { _id: 'alert-1', _index: 'index-1' } as unknown as Alert;

const INSTANCE_A = 'instance-a';
const INSTANCE_B = 'instance-b';

describe('useFlyoutPagination', () => {
  beforeEach(() => {
    __resetFlyoutPaginationStoreForTests();
  });

  describe('with null / undefined instanceId', () => {
    it('returns the absent slice so consumers render no pagination', () => {
      const { result } = renderHook(() => useFlyoutPagination(null));

      expect(result.current.flyoutAlertIndex).toBeNull();
      expect(result.current.pageSize).toBe(0);
      expect(result.current.totalAlertCount).toBe(0);
      expect(result.current.isFlyoutAlertLoading).toBe(false);
      expect(result.current.flyoutAlert).toBeNull();
      expect(result.current.flyoutDocumentRef).toBeNull();
    });

    it('does not throw when openAlertFlyout is called with a null instanceId', () => {
      const { result } = renderHook(() => useFlyoutPagination(null));
      expect(() => result.current.openAlertFlyout(3)).not.toThrow();
    });

    it('returns the absent slice for an unknown instanceId', () => {
      const { result } = renderHook(() => useFlyoutPagination('no-such-id'));
      expect(result.current.flyoutAlertIndex).toBeNull();
      expect(result.current.totalAlertCount).toBe(0);
    });
  });

  describe('with a known instanceId', () => {
    it('reflects updates written to the store', () => {
      const { result } = renderHook(() => useFlyoutPagination(INSTANCE_A));

      expect(result.current.flyoutAlertIndex).toBeNull();

      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_A, {
          flyoutAlertIndex: 42,
          totalAlertCount: 500,
          pageSize: 50,
          flyoutAlert: sampleAlert,
        });
      });

      expect(result.current.flyoutAlertIndex).toBe(42);
      expect(result.current.totalAlertCount).toBe(500);
      expect(result.current.pageSize).toBe(50);
      expect(result.current.flyoutAlert).toBe(sampleAlert);
    });

    it('forwards openAlertFlyout to the registered openAlertFlyoutImpl', () => {
      const impl = jest.fn();

      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_A, { openAlertFlyoutImpl: impl });
      });

      const { result } = renderHook(() => useFlyoutPagination(INSTANCE_A));

      result.current.openAlertFlyout(7);

      expect(impl).toHaveBeenCalledTimes(1);
      expect(impl).toHaveBeenCalledWith(7);
    });

    it('treats openAlertFlyout as a no-op if no impl is registered', () => {
      const { result } = renderHook(() => useFlyoutPagination(INSTANCE_A));
      expect(() => result.current.openAlertFlyout(0)).not.toThrow();
    });

    it('returns to absent slice after the slice is removed', () => {
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_A, { flyoutAlertIndex: 10, totalAlertCount: 100 });
      });

      const { result } = renderHook(() => useFlyoutPagination(INSTANCE_A));
      expect(result.current.flyoutAlertIndex).toBe(10);

      act(() => {
        flyoutPaginationStore.removeSlice(INSTANCE_A);
      });

      expect(result.current.flyoutAlertIndex).toBeNull();
      expect(result.current.totalAlertCount).toBe(0);
    });
  });

  describe('slice isolation', () => {
    it('two slices coexist independently — instance A updates do not affect instance B', () => {
      const { result: resultA } = renderHook(() => useFlyoutPagination(INSTANCE_A));
      const { result: resultB } = renderHook(() => useFlyoutPagination(INSTANCE_B));

      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_A, { flyoutAlertIndex: 5, totalAlertCount: 50 });
        flyoutPaginationStore.setSlice(INSTANCE_B, {
          flyoutAlertIndex: 99,
          totalAlertCount: 200,
        });
      });

      expect(resultA.current.flyoutAlertIndex).toBe(5);
      expect(resultA.current.totalAlertCount).toBe(50);
      expect(resultB.current.flyoutAlertIndex).toBe(99);
      expect(resultB.current.totalAlertCount).toBe(200);
    });

    it("removing instance A's slice does not affect instance B", () => {
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_A, { flyoutAlertIndex: 3, totalAlertCount: 30 });
        flyoutPaginationStore.setSlice(INSTANCE_B, {
          flyoutAlertIndex: 77,
          totalAlertCount: 770,
        });
      });

      const { result: resultA } = renderHook(() => useFlyoutPagination(INSTANCE_A));
      const { result: resultB } = renderHook(() => useFlyoutPagination(INSTANCE_B));

      act(() => {
        flyoutPaginationStore.removeSlice(INSTANCE_A);
      });

      expect(resultA.current).toMatchObject(absentSlice);
      expect(resultB.current.flyoutAlertIndex).toBe(77);
      expect(resultB.current.totalAlertCount).toBe(770);
    });

    it("removing instance B's slice does not affect instance A", () => {
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_A, {
          flyoutAlertIndex: 10,
          totalAlertCount: 100,
        });
        flyoutPaginationStore.setSlice(INSTANCE_B, { flyoutAlertIndex: 20, totalAlertCount: 200 });
      });

      const { result: resultA } = renderHook(() => useFlyoutPagination(INSTANCE_A));
      const { result: resultB } = renderHook(() => useFlyoutPagination(INSTANCE_B));

      act(() => {
        flyoutPaginationStore.removeSlice(INSTANCE_B);
      });

      expect(resultA.current.flyoutAlertIndex).toBe(10);
      expect(resultA.current.totalAlertCount).toBe(100);
      expect(resultB.current).toMatchObject(absentSlice);
    });
  });

  describe('cross-tree state sharing', () => {
    it('two independent hook instances for the same id stay in sync via the store', () => {
      const { result: hookA } = renderHook(() => useFlyoutPagination(INSTANCE_A));
      const { result: hookB } = renderHook(() => useFlyoutPagination(INSTANCE_A));

      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_A, {
          flyoutAlertIndex: 42,
          flyoutAlert: sampleAlert,
        });
      });

      expect(hookA.current.flyoutAlertIndex).toBe(42);
      expect(hookA.current.flyoutAlert).toBe(sampleAlert);
      expect(hookB.current.flyoutAlertIndex).toBe(42);
      expect(hookB.current.flyoutAlert).toBe(sampleAlert);
    });
  });
});
