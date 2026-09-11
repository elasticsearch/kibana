/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import type { Alert } from '@kbn/alerting-types';
import type { CasesService } from '../types';

export const useCaseActions = ({
  alerts,
  cases,
  onAddToCase,
}: {
  alerts: Alert[];
  cases?: CasesService;
  onAddToCase?: (opts: { isNewCase: boolean }) => void;
}) => {
  const selectCaseModal = cases?.hooks.useCasesAddToExistingCaseModal({
    onSuccess: (_, isNewCase) => onAddToCase?.({ isNewCase }),
  });

  const getCaseAttachments = useCallback(() => {
    return alerts.map((alert) => ({
      alertId: alert?._id ?? '',
      index: alert?._index ?? '',
      type: 'alert' as const,
      rule: cases?.helpers.getRuleIdFromEvent({
        ecs: {
          _id: alert?._id ?? '',
          _index: alert?._index ?? '',
        },
        data: Object.entries(alert ?? {}).reduce<Array<{ field: string; value: string[] }>>(
          (acc, [field, value]) => [...acc, { field, value: value as string[] }],
          []
        ),
      }) ?? { id: '', name: '' },
    }));
  }, [alerts, cases?.helpers]);

  const handleAddToCaseClick = useCallback(() => {
    selectCaseModal?.open({ getAttachments: () => getCaseAttachments() });
  }, [selectCaseModal, getCaseAttachments]);

  return {
    handleAddToCaseClick,
  };
};
