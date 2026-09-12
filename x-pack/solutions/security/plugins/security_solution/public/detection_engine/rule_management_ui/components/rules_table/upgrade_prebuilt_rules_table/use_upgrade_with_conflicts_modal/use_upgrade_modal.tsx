/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { useCallback, useState } from 'react';
import { useBoolean } from '@kbn/react-hooks';
import { useAsyncConfirmation } from '../../rules_table/use_async_confirmation';
import type { RulesConflictStats } from './conflicts_description';
import { UpgradeWithConflictsModal } from './upgrade_modal';

export enum ConfirmRulesUpgrade {
  WithoutConflicts = 'WithoutConflicts',
  WithSolvableConflicts = 'WithSolvableConflicts',
}

interface UseUpgradeWithConflictsModalResult {
  modal: ReactNode;
  confirmConflictsUpgrade: (
    conflictsStats: RulesConflictStats
  ) => Promise<ConfirmRulesUpgrade | boolean>;
}

export function useUpgradeWithConflictsModal(): UseUpgradeWithConflictsModalResult {
  const [isVisible, { on: showModal, off: hideModal }] = useBoolean(false);
  const [initConfirmation, confirm, cancel] = useAsyncConfirmation<ConfirmRulesUpgrade>({
    onInit: showModal,
    onFinish: hideModal,
  });
  const [rulesUpgradeConflictsStats, setRulesUpgradeConflictsStats] = useState<RulesConflictStats>({
    numOfRulesWithoutConflicts: 0,
    numOfRulesWithSolvableConflicts: 0,
    numOfRulesWithNonSolvableConflicts: 0,
    numOfRulesWithRuleTypeChange: 0,
  });

  const confirmConflictsUpgrade = useCallback(
    (conflictsStats: RulesConflictStats) => {
      setRulesUpgradeConflictsStats(conflictsStats);

      return initConfirmation();
    },
    [initConfirmation]
  );

  return {
    modal: isVisible && (
      <UpgradeWithConflictsModal
        {...rulesUpgradeConflictsStats}
        onConfirm={confirm}
        onCancel={cancel}
      />
    ),
    confirmConflictsUpgrade,
  };
}
