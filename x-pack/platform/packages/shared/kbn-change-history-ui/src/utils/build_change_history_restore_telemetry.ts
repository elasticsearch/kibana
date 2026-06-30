/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryRestoreTelemetryParams } from '../types/restore_change_params';
import type { ChangeHistoryListItem } from '../types/change_history_list_item';
import { getRestoreVersionLabel } from './get_restore_version_label';

/** Resolves the live/current row from a loaded history list (newest first). */
export const findCurrentChangeHistoryListItem = (
  items: ChangeHistoryListItem[]
): ChangeHistoryListItem | undefined => items.find((item) => item.isCurrent) ?? items[0];

export const buildChangeHistoryRestoreTelemetryParams = (
  restoredChange: ChangeHistoryListItem,
  currentChange?: ChangeHistoryListItem
): ChangeHistoryRestoreTelemetryParams => {
  const restoredFromSequence = getRestoreVersionLabel(restoredChange);
  const currentSequence = currentChange ? getRestoreVersionLabel(currentChange) : undefined;

  if (restoredFromSequence === undefined && currentSequence === undefined) {
    return {};
  }

  if (restoredFromSequence === undefined || currentSequence === undefined) {
    return {
      ...(restoredFromSequence !== undefined ? { restoredFromSequence } : {}),
      ...(currentSequence !== undefined ? { currentSequence } : {}),
    };
  }

  return {
    restoredFromSequence,
    currentSequence,
    rollbackDistance: currentSequence - restoredFromSequence,
  };
};
