/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { absentSlice, type ScopedPaginationSlice } from './types';

export interface PaginationStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ScopedPaginationSlice;
  setState: (partial: Partial<ScopedPaginationSlice>) => void;
}

/**
 * Creates an isolated pagination store for a single `usePaginatedFlyout`
 * instance. Each call returns an independent store with its own state and
 * listener set, so multiple concurrent flyout sources never share state.
 */
export const createPaginationStore = (): PaginationStore => {
  let state: ScopedPaginationSlice = { ...absentSlice };
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getSnapshot = (): ScopedPaginationSlice => state;

  const setState = (partial: Partial<ScopedPaginationSlice>): void => {
    state = { ...state, ...partial };
    listeners.forEach((l) => l());
  };

  return { subscribe, getSnapshot, setState };
};
