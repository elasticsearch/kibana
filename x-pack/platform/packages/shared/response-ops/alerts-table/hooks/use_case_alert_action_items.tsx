/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiContextMenuItem } from '@elastic/eui';
import type { Alert } from '@kbn/alerting-types';
import type { CasesOwner, CasesService } from '../types';
import { useCaseActions } from './use_case_actions';
import { ADD_TO_CASE } from '../translations';

/**
 * Returns an "Add to case" context menu item.
 *
 * Returns an empty array if the cases service is unavailable or the user lacks permissions.
 */
export const useCaseAlertActionItems = ({
  alert,
  cases,
  refresh,
  onAddToCase,
  onActionExecuted,
  owner = ['cases'],
}: {
  alert: Alert;
  cases?: CasesService;
  refresh: () => void;
  onAddToCase?: (opts: { isNewCase: boolean }) => void;
  onActionExecuted?: () => void;
  owner?: CasesOwner[];
}): React.ReactElement[] => {
  const userCasesPermissions = cases?.helpers.canUseCases(owner);

  const { handleAddToCaseClick } = useCaseActions({
    alerts: [alert],
    cases,
    onAddToCase: onAddToCase ?? refresh,
  });

  return useMemo(() => {
    if (!userCasesPermissions?.createComment || !userCasesPermissions?.read) {
      return [];
    }

    return [
      <EuiContextMenuItem
        data-test-subj="add-to-case-action"
        key="addToCase"
        icon="briefcase"
        onClick={() => {
          handleAddToCaseClick();
          onActionExecuted?.();
        }}
      >
        {ADD_TO_CASE}
      </EuiContextMenuItem>,
    ];
  }, [
    userCasesPermissions?.createComment,
    userCasesPermissions?.read,
    handleAddToCaseClick,
    onActionExecuted,
  ]);
};
