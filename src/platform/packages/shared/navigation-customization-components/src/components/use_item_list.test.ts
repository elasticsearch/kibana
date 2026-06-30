/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, act } from '@testing-library/react';
import { useItemList } from './use_item_list';
import type { NavigationItemInfo } from '../types';

describe('useItemList', () => {
  const items: NavigationItemInfo[] = [
    { id: 'home', title: 'Home', hidden: false },
    { id: 'dashboards', title: 'Dashboards', hidden: false },
    { id: 'discover', title: 'Discover', hidden: false },
    { id: 'maps', title: 'Maps', hidden: true },
  ];

  it('should separate items into visible and hidden', () => {
    const { result } = renderHook(() => useItemList(items));

    expect(result.current.visibleItems).toHaveLength(3);
    expect(result.current.hiddenItems).toHaveLength(1);
    expect(result.current.hiddenItems[0].id).toBe('maps');
  });

  it('should report no changes initially', () => {
    const { result } = renderHook(() => useItemList(items));
    expect(result.current.hasChanges).toBe(false);
  });

  it('should toggle item visibility', () => {
    const { result } = renderHook(() => useItemList(items));

    act(() => {
      result.current.toggleItemVisibility('dashboards');
    });

    expect(result.current.hiddenItems).toHaveLength(2);
    expect(result.current.visibleItems).toHaveLength(2);
    expect(result.current.hasChanges).toBe(true);
  });

  it('should toggle item back to visible', () => {
    const { result } = renderHook(() => useItemList(items));

    act(() => {
      result.current.toggleItemVisibility('maps');
    });

    expect(result.current.hiddenItems).toHaveLength(0);
    expect(result.current.visibleItems).toHaveLength(4);
  });

  it('should allow setItems to replace the list', () => {
    const { result } = renderHook(() => useItemList(items));
    const newItems: NavigationItemInfo[] = [{ id: 'new', title: 'New Item', hidden: false }];

    act(() => {
      result.current.setItems(newItems);
    });

    expect(result.current.items).toEqual(newItems);
    expect(result.current.hasChanges).toBe(true);
  });
});
