/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import { DIFFABLE_CHANGE_ACTIONS } from '../changes_history_timeline/constants';

interface UseChangeHistoryAutoSelectionParams {
  ruleId: string;
  items: RuleHistoryItem[];
  isFetchingFirstPage: boolean;
  setSelectedItem: (item: RuleHistoryItem | undefined) => void;
}

interface UseChangeHistoryAutoSelectionResult {
  lockSelectionDecision: () => void;
  unlockSelectionDecision: () => void;
}

export function useChangeHistoryAutoSelection({
  ruleId,
  items,
  isFetchingFirstPage,
  setSelectedItem,
}: UseChangeHistoryAutoSelectionParams): UseChangeHistoryAutoSelectionResult {
  const decidedRef = useRef(false);

  const lockSelectionDecision = useCallback(() => {
    decidedRef.current = true;
  }, []);

  const unlockSelectionDecision = useCallback(() => {
    decidedRef.current = false;
  }, []);

  // Reset when ruleId changes.
  useEffect(() => {
    setSelectedItem(undefined);
    decidedRef.current = false;
  }, [ruleId, setSelectedItem]);

  // Auto-select the first diffable item once per page open. The decision is
  // deferred until the initial/background fetch settles so that stale React
  // Query cache data doesn't lock in a stale selection before fresh items
  // (including any newly created history entry) arrive.
  // After the decision is locked (either by fresh data arriving or by the user
  // manually selecting an item via lockDecision), the hook is inert so that
  // manual navigation is preserved for the rest of the session.
  useEffect(() => {
    if (items.length === 0 || decidedRef.current) {
      return;
    }

    const firstActive = items.find((item) => DIFFABLE_CHANGE_ACTIONS.includes(item.action));

    if (!firstActive) {
      return;
    }

    setSelectedItem(firstActive);

    if (!isFetchingFirstPage) {
      decidedRef.current = true;
    }
  }, [items, isFetchingFirstPage, setSelectedItem]);

  return { lockSelectionDecision, unlockSelectionDecision };
}
