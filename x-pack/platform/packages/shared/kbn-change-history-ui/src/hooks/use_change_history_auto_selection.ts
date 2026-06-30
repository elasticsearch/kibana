/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ChangeHistoryListItem } from '../types/change_history_list_item';

export interface UseChangeHistoryAutoSelectionArgs {
  objectId: string;
  items: ChangeHistoryListItem[];
  isFetchingFirstPage: boolean;
  enabled?: boolean;
  setSelectedChangeId: (changeId: string | undefined) => void;
  onAutoSelect?: (item: ChangeHistoryListItem) => void;
}

export interface UseChangeHistoryAutoSelectionResult {
  lockSelectionDecision: () => void;
  unlockSelectionDecision: () => void;
}

export const useChangeHistoryAutoSelection = ({
  objectId,
  items,
  isFetchingFirstPage,
  enabled = true,
  setSelectedChangeId,
  onAutoSelect,
}: UseChangeHistoryAutoSelectionArgs): UseChangeHistoryAutoSelectionResult => {
  const decidedRef = useRef(false);

  const lockSelectionDecision = useCallback(() => {
    decidedRef.current = true;
  }, []);

  const unlockSelectionDecision = useCallback(() => {
    decidedRef.current = false;
  }, []);

  useEffect(() => {
    setSelectedChangeId(undefined);
    decidedRef.current = false;
  }, [objectId, setSelectedChangeId]);

  useEffect(() => {
    if (!enabled || items.length === 0 || decidedRef.current) {
      return;
    }

    const firstItem = items[0];

    if (!firstItem?.id) {
      return;
    }

    setSelectedChangeId(firstItem.id);
    onAutoSelect?.(firstItem);

    if (!isFetchingFirstPage) {
      decidedRef.current = true;
    }
  }, [enabled, isFetchingFirstPage, items, onAutoSelect, setSelectedChangeId]);

  return { lockSelectionDecision, unlockSelectionDecision };
};
