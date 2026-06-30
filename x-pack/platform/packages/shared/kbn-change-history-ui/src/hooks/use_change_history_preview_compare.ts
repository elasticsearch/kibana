/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type { ChangeHistoryDetail } from '../types/change_history_detail';
import type { ChangeHistoryListItem } from '../types/change_history_list_item';
import {
  findCurrentChangeId,
  findPreviousChangeId,
} from '../utils/find_change_history_compare_targets';
import { useChangeHistoryDetail } from './use_change_history_detail';

export interface UseChangeHistoryPreviewCompareArgs {
  adapter: ChangeHistoryAdapter;
  objectId: string;
  listItems: ChangeHistoryListItem[];
  selectedChange?: ChangeHistoryDetail;
  selectedChangeId?: string;
}

export interface UseChangeHistoryPreviewCompareResult {
  currentChange?: ChangeHistoryDetail;
  previousChange?: ChangeHistoryDetail;
  isLoadingCompareContext: boolean;
}

export const useChangeHistoryPreviewCompare = ({
  adapter,
  objectId,
  listItems,
  selectedChange,
  selectedChangeId,
}: UseChangeHistoryPreviewCompareArgs): UseChangeHistoryPreviewCompareResult => {
  const currentChangeId = useMemo(() => findCurrentChangeId(listItems), [listItems]);
  const previousChangeId = useMemo(
    () => (selectedChangeId ? findPreviousChangeId(listItems, selectedChangeId) : undefined),
    [listItems, selectedChangeId]
  );

  const shouldLoadCurrent =
    Boolean(currentChangeId) && currentChangeId !== selectedChangeId && Boolean(selectedChangeId);
  const shouldLoadPrevious =
    Boolean(previousChangeId) && previousChangeId !== selectedChangeId && Boolean(selectedChangeId);

  const { change: loadedCurrentChange, isLoading: isLoadingCurrent } = useChangeHistoryDetail({
    adapter,
    objectId,
    changeId: currentChangeId,
    enabled: shouldLoadCurrent,
  });

  const { change: loadedPreviousChange, isLoading: isLoadingPrevious } = useChangeHistoryDetail({
    adapter,
    objectId,
    changeId: previousChangeId,
    enabled: shouldLoadPrevious,
  });

  const currentChange =
    currentChangeId === selectedChangeId
      ? selectedChange
      : shouldLoadCurrent
      ? loadedCurrentChange
      : undefined;

  const previousChange =
    previousChangeId === selectedChangeId ? selectedChange : loadedPreviousChange;

  return {
    currentChange,
    previousChange,
    isLoadingCompareContext:
      (shouldLoadCurrent && isLoadingCurrent) || (shouldLoadPrevious && isLoadingPrevious),
  };
};
