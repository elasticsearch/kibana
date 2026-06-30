/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryListItem } from '../types/change_history_list_item';

/** Resolves the current-version row from a loaded history page (newest first). */
export const findCurrentChangeId = (items: ChangeHistoryListItem[]): string | undefined => {
  const currentItem = items.find((item) => item.isCurrent);
  return currentItem?.id ?? items[0]?.id;
};

/** Resolves the chronologically previous row for a selection in a newest-first list. */
export const findPreviousChangeId = (
  items: ChangeHistoryListItem[],
  selectedChangeId: string
): string | undefined => {
  const selectedIndex = items.findIndex((item) => item.id === selectedChangeId);
  if (selectedIndex < 0 || selectedIndex >= items.length - 1) {
    return undefined;
  }

  return items[selectedIndex + 1]?.id;
};
