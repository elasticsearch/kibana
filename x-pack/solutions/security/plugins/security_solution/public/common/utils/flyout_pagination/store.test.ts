/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { __resetFlyoutPaginationStoreForTests, flyoutPaginationStore } from './store';
import { absentSlice } from './types';

const ID_A = 'slice-a';
const ID_B = 'slice-b';

describe('flyoutPaginationStore', () => {
  beforeEach(() => {
    __resetFlyoutPaginationStoreForTests();
  });

  it('setSlice creates a new slice', () => {
    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 1, totalAlertCount: 10 });
    expect(flyoutPaginationStore.getSlice(ID_A).flyoutAlertIndex).toBe(1);
    expect(flyoutPaginationStore.getSlice(ID_A).totalAlertCount).toBe(10);
  });

  it('getSlice returns absentSlice for null, undefined, and unknown ids', () => {
    expect(flyoutPaginationStore.getSlice(null)).toBe(absentSlice);
    expect(flyoutPaginationStore.getSlice(undefined)).toBe(absentSlice);
    expect(flyoutPaginationStore.getSlice('unknown')).toBe(absentSlice);
  });

  it('getSlice returns the correct slice for a known id', () => {
    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 7, pageSize: 25 });
    const slice = flyoutPaginationStore.getSlice(ID_A);
    expect(slice.flyoutAlertIndex).toBe(7);
    expect(slice.pageSize).toBe(25);
  });

  it('removeSlice removes the slice so getSlice returns absentSlice', () => {
    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 2 });
    flyoutPaginationStore.removeSlice(ID_A);
    expect(flyoutPaginationStore.getSlice(ID_A)).toBe(absentSlice);
  });

  it('removeSlice is a no-op for unknown ids', () => {
    expect(() => flyoutPaginationStore.removeSlice('nope')).not.toThrow();
  });

  it('mutating slice A does not change the object reference for slice B', () => {
    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 1 });
    flyoutPaginationStore.setSlice(ID_B, { flyoutAlertIndex: 2 });
    const snapshotB = flyoutPaginationStore.getSlice(ID_B);
    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 99 });
    expect(flyoutPaginationStore.getSlice(ID_B)).toBe(snapshotB);
  });

  it('removeSlice for A does not change the object reference for slice B', () => {
    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 1 });
    flyoutPaginationStore.setSlice(ID_B, { flyoutAlertIndex: 2 });
    const snapshotB = flyoutPaginationStore.getSlice(ID_B);
    flyoutPaginationStore.removeSlice(ID_A);
    expect(flyoutPaginationStore.getSlice(ID_B)).toBe(snapshotB);
  });

  it('__resetFlyoutPaginationStoreForTests clears all slices', () => {
    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 1 });
    __resetFlyoutPaginationStoreForTests();
    expect(flyoutPaginationStore.getSlice(ID_A)).toBe(absentSlice);
  });

  it('subscribers are notified on setSlice and removeSlice, not on no-op setSlice', () => {
    const spy = jest.fn();
    const unsub = flyoutPaginationStore.subscribe(spy);

    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 1 });
    expect(spy).toHaveBeenCalledTimes(1);

    flyoutPaginationStore.setSlice(ID_A, { flyoutAlertIndex: 1 });
    expect(spy).toHaveBeenCalledTimes(1);

    flyoutPaginationStore.removeSlice(ID_A);
    expect(spy).toHaveBeenCalledTimes(2);

    unsub();
  });
});
