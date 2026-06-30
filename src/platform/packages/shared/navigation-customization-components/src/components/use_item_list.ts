/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { euiDragDropReorder, type DropResult } from '@elastic/eui';
import type { NavigationItemInfo } from '../types';

export const VISIBLE_DROPPABLE_ID = 'nav-items';
export const HIDDEN_DROPPABLE_ID = 'hidden-nav-items';

export const useItemList = (initial: NavigationItemInfo[]) => {
  const initialItems = useRef(initial);
  const [items, setItems] = useState(initial);

  const visibleItems = useMemo(() => items.filter((item) => !item.hidden), [items]);
  const hiddenItems = useMemo(() => items.filter((item) => item.hidden), [items]);

  const hasChanges = useMemo(() => {
    if (items.length !== initialItems.current.length) return true;
    return items.some(
      (item, i) =>
        item.id !== initialItems.current[i].id || item.hidden !== initialItems.current[i].hidden
    );
  }, [items]);

  const handleDragEnd = useCallback(({ source, destination }: DropResult) => {
    if (!destination) return;

    const isSameList = source.droppableId === destination.droppableId;
    if (isSameList && source.index === destination.index) return;

    setItems((prev) => {
      const visible = prev.filter((item) => !item.hidden);
      const hidden = prev.filter((item) => item.hidden);

      // Reordering within a single list.
      if (isSameList) {
        if (source.droppableId === VISIBLE_DROPPABLE_ID) {
          return [...euiDragDropReorder(visible, source.index, destination.index), ...hidden];
        }
        return [...visible, ...euiDragDropReorder(hidden, source.index, destination.index)];
      }

      // Moving between lists flips the hidden flag; the toggle is bound to it
      // and updates automatically.
      const movingToHidden = destination.droppableId === HIDDEN_DROPPABLE_ID;
      const sourceList = movingToHidden ? [...visible] : [...hidden];
      const destList = movingToHidden ? [...hidden] : [...visible];

      const [moved] = sourceList.splice(source.index, 1);
      if (!moved) return prev;

      destList.splice(destination.index, 0, { ...moved, hidden: movingToHidden });

      // Keep visible items before hidden items in the backing array.
      return movingToHidden ? [...sourceList, ...destList] : [...destList, ...sourceList];
    });
  }, []);

  const toggleItemVisibility = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, hidden: !item.hidden } : item))
    );
  }, []);

  return {
    items,
    setItems,
    visibleItems,
    hiddenItems,
    hasChanges,
    handleDragEnd,
    toggleItemVisibility,
  };
};
