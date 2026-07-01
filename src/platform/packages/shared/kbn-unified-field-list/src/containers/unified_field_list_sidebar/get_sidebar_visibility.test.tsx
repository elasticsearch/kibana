/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act } from '@testing-library/react';
import { getSidebarVisibility } from './get_sidebar_visibility';

const localStorageKey = 'test-sidebar-visibility';

describe('UnifiedFieldList getSidebarVisibility', () => {
  beforeEach(() => {
    localStorage.removeItem(localStorageKey);
  });

  it('should toggle correctly', async () => {
    const state = getSidebarVisibility({ localStorageKey });

    expect(state.isCollapsed$.getValue()).toBe(false);
    expect(state.initialValue).toBe(false);

    act(() => {
      state.toggle(true);
    });

    expect(state.isCollapsed$.getValue()).toBe(true);
    expect(localStorage.getItem(localStorageKey)).toBe('true');

    act(() => {
      state.toggle(false);
    });

    expect(state.isCollapsed$.getValue()).toBe(false);
    expect(localStorage.getItem(localStorageKey)).toBe('false');
  });

  it('should restore collapsed state and expand from it', async () => {
    localStorage.setItem(localStorageKey, 'true');

    const state = getSidebarVisibility({ localStorageKey });

    expect(state.isCollapsed$.getValue()).toBe(true);
    expect(state.initialValue).toBe(true);

    act(() => {
      state.toggle(false);
    });

    expect(state.isCollapsed$.getValue()).toBe(false);
    expect(localStorage.getItem(localStorageKey)).toBe('false');
  });

  it('should ignore local storage value if initial value is specified', async () => {
    localStorage.setItem(localStorageKey, 'true');

    const state = getSidebarVisibility({ localStorageKey, isInitiallyCollapsed: false });

    expect(state.isCollapsed$.getValue()).toBe(false);
    expect(state.initialValue).toBe(false);
  });

  it('should update the observable without persisting when updateLocalStorage is false', async () => {
    const state = getSidebarVisibility({ localStorageKey });

    act(() => {
      state.toggle(true, false);
    });

    expect(state.isCollapsed$.getValue()).toBe(true);
    expect(localStorage.getItem(localStorageKey)).toBe(null);
  });

  it('should not persist if local storage key is not defined', async () => {
    const state = getSidebarVisibility({ localStorageKey: undefined });

    expect(state.isCollapsed$.getValue()).toBe(false);

    act(() => {
      state.toggle(true);
    });

    expect(state.isCollapsed$.getValue()).toBe(true);
    expect(localStorage.getItem(localStorageKey)).toBe(null);
  });
});
