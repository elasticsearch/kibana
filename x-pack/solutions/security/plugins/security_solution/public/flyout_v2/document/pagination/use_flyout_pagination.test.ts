/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useFlyoutPagination } from './use_flyout_pagination';
import { PaginationStoreProvider } from './context';
import { createPaginationStore } from './store';

const sampleDocumentId = 'alert-1';
const sampleDocumentIndexName = 'index-1';

describe('useFlyoutPagination', () => {
  describe('without a PaginationStoreProvider', () => {
    it('returns the absent value so consumers render no pagination', () => {
      const { result } = renderHook(() => useFlyoutPagination());

      expect(result.current.flyoutDocumentIndex).toBeNull();
      expect(result.current.pageSize).toBe(0);
      expect(result.current.totalDocumentCount).toBe(0);
      expect(result.current.isFlyoutDocumentLoading).toBe(false);
      expect(result.current.flyoutDocumentId).toBeNull();
      expect(result.current.flyoutDocumentIndexName).toBeNull();
    });

    it('does not throw when openDocumentFlyout is called with no provider', () => {
      const { result } = renderHook(() => useFlyoutPagination());
      expect(() => result.current.openDocumentFlyout(3)).not.toThrow();
    });
  });

  describe('with a PaginationStoreProvider', () => {
    it('reflects updates written to the store', () => {
      const store = createPaginationStore();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(PaginationStoreProvider, { value: store }, children);

      const { result } = renderHook(() => useFlyoutPagination(), { wrapper });

      expect(result.current.flyoutDocumentIndex).toBeNull();

      act(() => {
        store.setState({
          flyoutDocumentIndex: 42,
          totalDocumentCount: 500,
          pageSize: 50,
          flyoutDocumentId: sampleDocumentId,
          flyoutDocumentIndexName: sampleDocumentIndexName,
        });
      });

      expect(result.current.flyoutDocumentIndex).toBe(42);
      expect(result.current.totalDocumentCount).toBe(500);
      expect(result.current.pageSize).toBe(50);
      expect(result.current.flyoutDocumentId).toBe(sampleDocumentId);
      expect(result.current.flyoutDocumentIndexName).toBe(sampleDocumentIndexName);
    });

    it('forwards openDocumentFlyout to the registered openDocumentFlyoutImpl', () => {
      const store = createPaginationStore();
      const impl = jest.fn();
      store.setState({ openDocumentFlyoutImpl: impl });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(PaginationStoreProvider, { value: store }, children);

      const { result } = renderHook(() => useFlyoutPagination(), { wrapper });

      act(() => {
        result.current.openDocumentFlyout(7);
      });

      expect(impl).toHaveBeenCalledTimes(1);
      expect(impl).toHaveBeenCalledWith(7);
    });

    it('treats openDocumentFlyout as a no-op if no impl is registered', () => {
      const store = createPaginationStore();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(PaginationStoreProvider, { value: store }, children);

      const { result } = renderHook(() => useFlyoutPagination(), { wrapper });
      expect(() => result.current.openDocumentFlyout(0)).not.toThrow();
    });
  });

  describe('slice isolation', () => {
    it('two hooks with different providers are isolated', () => {
      const storeA = createPaginationStore();
      const storeB = createPaginationStore();
      const wrapA = ({ children }: { children: React.ReactNode }) =>
        React.createElement(PaginationStoreProvider, { value: storeA }, children);
      const wrapB = ({ children }: { children: React.ReactNode }) =>
        React.createElement(PaginationStoreProvider, { value: storeB }, children);

      const { result: resultA } = renderHook(() => useFlyoutPagination(), { wrapper: wrapA });
      const { result: resultB } = renderHook(() => useFlyoutPagination(), { wrapper: wrapB });

      act(() => {
        storeA.setState({ flyoutDocumentIndex: 5, totalDocumentCount: 50 });
        storeB.setState({ flyoutDocumentIndex: 99, totalDocumentCount: 200 });
      });

      expect(resultA.current.flyoutDocumentIndex).toBe(5);
      expect(resultA.current.totalDocumentCount).toBe(50);
      expect(resultB.current.flyoutDocumentIndex).toBe(99);
      expect(resultB.current.totalDocumentCount).toBe(200);
    });
  });

  describe('cross-tree state sharing', () => {
    it('two hooks sharing the same provider stay in sync', () => {
      const store = createPaginationStore();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(PaginationStoreProvider, { value: store }, children);

      const { result: hookA } = renderHook(() => useFlyoutPagination(), { wrapper });
      const { result: hookB } = renderHook(() => useFlyoutPagination(), { wrapper });

      act(() => {
        store.setState({ flyoutDocumentIndex: 42, flyoutDocumentId: sampleDocumentId });
      });

      expect(hookA.current.flyoutDocumentIndex).toBe(42);
      expect(hookA.current.flyoutDocumentId).toBe(sampleDocumentId);
      expect(hookB.current.flyoutDocumentIndex).toBe(42);
      expect(hookB.current.flyoutDocumentId).toBe(sampleDocumentId);
    });
  });
});
