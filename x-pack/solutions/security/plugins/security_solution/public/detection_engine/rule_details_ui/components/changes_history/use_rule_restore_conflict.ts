/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import { useInvalidateChangeHistory } from '../../../rule_management/api/hooks/use_infinite_change_history';

interface ConflictState {
  item: RuleHistoryItem;
  restoreAnyway: () => void;
  isDeletedRule: boolean;
}

interface UseRuleRestoreConflictParams {
  unlockSelectionDecision: () => void;
}

interface UseRuleRestoreConflictResult {
  conflictState: ConflictState | null;
  handleConflict: (
    item: RuleHistoryItem,
    restoreAnyway: () => void,
    isDeletedRule: boolean
  ) => void;
  handleConflictReviewChanges: () => void;
  handleConflictRestoreAnyway: () => void;
  handleConflictCancel: () => void;
}

export const useRuleRestoreConflict = ({
  unlockSelectionDecision,
}: UseRuleRestoreConflictParams): UseRuleRestoreConflictResult => {
  const invalidateChangeHistory = useInvalidateChangeHistory();
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);

  const handleConflict = useCallback(
    (item: RuleHistoryItem, restoreAnyway: () => void, isDeletedRule: boolean) => {
      setConflictState({ item, restoreAnyway, isDeletedRule });
    },
    []
  );

  const handleConflictReviewChanges = useCallback(() => {
    setConflictState(null);
    invalidateChangeHistory();
    unlockSelectionDecision();
  }, [invalidateChangeHistory, unlockSelectionDecision]);

  const handleConflictRestoreAnyway = useCallback(() => {
    const restoreAnyway = conflictState?.restoreAnyway;
    setConflictState(null);
    restoreAnyway?.();
  }, [conflictState]);

  const handleConflictCancel = useCallback(() => {
    setConflictState(null);
  }, []);

  return {
    conflictState,
    handleConflict,
    handleConflictReviewChanges,
    handleConflictRestoreAnyway,
    handleConflictCancel,
  };
};
