/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import { DIFFABLE_CHANGE_ACTIONS } from '../changes_history_timeline/constants';

interface UseChangeHistoryAutoSelectionParams {
  ruleId: string;
  items: RuleHistoryItem[];
  setSelectedItem: (item: RuleHistoryItem | undefined) => void;
}

export function useChangeHistoryAutoSelection({
  ruleId,
  items,
  setSelectedItem,
}: UseChangeHistoryAutoSelectionParams): void {
  const decidedRef = useRef(false);

  // Reset when ruleId changes.
  useEffect(() => {
    setSelectedItem(undefined);
    decidedRef.current = false;
  }, [ruleId, setSelectedItem]);

  // Auto-select the first diffable item once, when the first page settles.
  // After the initial decision the hook is inert — any further navigation is
  // left entirely to the user.
  useEffect(() => {
    if (items.length === 0 || decidedRef.current) {
      return;
    }

    decidedRef.current = true;
    const firstActive = items.find((item) => DIFFABLE_CHANGE_ACTIONS.includes(item.action));

    if (firstActive) {
      setSelectedItem(firstActive);
    }
  }, [items, setSelectedItem]);
}
