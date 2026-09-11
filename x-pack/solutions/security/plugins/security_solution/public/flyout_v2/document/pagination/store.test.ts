/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPaginationStore } from './store';
import { absentSlice } from './types';

describe('createPaginationStore', () => {
  it('initialises with absentSlice state', () => {
    const store = createPaginationStore();
    expect(store.getSnapshot()).toEqual(absentSlice);
  });

  it('setState merges partial updates', () => {
    const store = createPaginationStore();
    store.setState({ flyoutDocumentIndex: 3, totalDocumentCount: 20 });
    expect(store.getSnapshot().flyoutDocumentIndex).toBe(3);
    expect(store.getSnapshot().totalDocumentCount).toBe(20);
    // Other fields survive
    expect(store.getSnapshot().flyoutDocumentId).toBeNull();
  });

  it('notifies subscribers on setState', () => {
    const store = createPaginationStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.setState({ flyoutDocumentIndex: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createPaginationStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setState({ flyoutDocumentIndex: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('two stores are independent', () => {
    const a = createPaginationStore();
    const b = createPaginationStore();
    a.setState({ flyoutDocumentIndex: 5 });
    expect(a.getSnapshot().flyoutDocumentIndex).toBe(5);
    expect(b.getSnapshot().flyoutDocumentIndex).toBeNull();
  });

  it('multiple setState calls accumulate correctly', () => {
    const store = createPaginationStore();
    store.setState({ totalDocumentCount: 10 });
    store.setState({ flyoutDocumentIndex: 2 });
    expect(store.getSnapshot().totalDocumentCount).toBe(10);
    expect(store.getSnapshot().flyoutDocumentIndex).toBe(2);
  });

  it('mutating store A does not change the snapshot reference of store B', () => {
    const a = createPaginationStore();
    const b = createPaginationStore();
    b.setState({ flyoutDocumentIndex: 7 });
    const snapshotB = b.getSnapshot();
    a.setState({ flyoutDocumentIndex: 99 });
    expect(b.getSnapshot()).toBe(snapshotB);
  });
});
