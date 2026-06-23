/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';

import { TestProviders } from '../../../../common/mock';
import { useViewMode } from './use_view_mode';
import { VIEW_TOGGLE_LIST_ID, VIEW_TOGGLE_TABLE_ID } from '../constants';

const localStorageKey = 'securitySolution.cases.list.viewMode';

describe('useViewMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns list view mode by default when localStorage is empty', () => {
    const { result } = renderHook(() => useViewMode(), {
      wrapper: (props) => <TestProviders {...props} />,
    });

    expect(result.current.viewMode).toBe(VIEW_TOGGLE_LIST_ID);
  });

  it('returns the stored view mode from localStorage', () => {
    localStorage.setItem(localStorageKey, JSON.stringify(VIEW_TOGGLE_TABLE_ID));

    const { result } = renderHook(() => useViewMode(), {
      wrapper: (props) => <TestProviders {...props} />,
    });

    expect(result.current.viewMode).toBe(VIEW_TOGGLE_TABLE_ID);
  });

  it('falls back to list view when localStorage contains an invalid value', () => {
    localStorage.setItem(localStorageKey, JSON.stringify('invalid_value'));

    const { result } = renderHook(() => useViewMode(), {
      wrapper: (props) => <TestProviders {...props} />,
    });

    expect(result.current.viewMode).toBe(VIEW_TOGGLE_LIST_ID);
  });

  it('updates the view mode via setViewMode', () => {
    const { result } = renderHook(() => useViewMode(), {
      wrapper: (props) => <TestProviders {...props} />,
    });

    act(() => {
      result.current.setViewMode(VIEW_TOGGLE_TABLE_ID);
    });

    expect(result.current.viewMode).toBe(VIEW_TOGGLE_TABLE_ID);
  });

  it('persists the new view mode to localStorage', () => {
    const { result } = renderHook(() => useViewMode(), {
      wrapper: (props) => <TestProviders {...props} />,
    });

    act(() => {
      result.current.setViewMode(VIEW_TOGGLE_TABLE_ID);
    });

    expect(JSON.parse(localStorage.getItem(localStorageKey)!)).toBe(VIEW_TOGGLE_TABLE_ID);
  });
});
