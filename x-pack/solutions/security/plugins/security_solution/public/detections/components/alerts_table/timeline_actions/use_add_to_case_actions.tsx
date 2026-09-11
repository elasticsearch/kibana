/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ADD_TO_CASE } from '@kbn/response-ops-alerts-table/translations';
import { useCallback, useMemo } from 'react';
import { SECURITY_ALERT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import type { CaseAttachmentsWithoutOwner } from '@kbn/cases-plugin/public';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { useKibana } from '../../../../common/lib/kibana';
import { useCanAttachToCase } from '../../../../cases/attachments/hooks/use_can_attach_to_case';
import type { TimelineNonEcsData } from '../../../../../common/search_strategy';
import type { AlertTableContextMenuItem } from '../types';
import { generateEventAttachmentWithoutOwner } from '../../../../cases/attachments/event/utils';

export const ADD_TO_CASE_ACTION_IDS = {
  addToCase: 'add-to-case-action',
} as const;

export interface UseAddToCaseActions {
  onMenuItemClick: () => void;
  ariaLabel?: string;
  ecsData: Ecs;
  nonEcsData: TimelineNonEcsData[];
  onSuccess?: () => Promise<void>;
  onActionClick?: (actionId: typeof ADD_TO_CASE_ACTION_IDS.addToCase) => void;
  refetch?: (() => void) | undefined;
}

export const useAddToCaseActions = ({
  onMenuItemClick,
  ariaLabel,
  ecsData,
  nonEcsData,
  onSuccess,
  onActionClick,
  refetch,
}: UseAddToCaseActions) => {
  const { cases: casesUi } = useKibana().services;
  const canAttach = useCanAttachToCase();

  const isAlert = useMemo(() => {
    return ecsData?.event?.kind?.includes('signal');
  }, [ecsData]);

  const caseAttachments: CaseAttachmentsWithoutOwner = useMemo(() => {
    if (!isAlert) {
      const eventAttachment = generateEventAttachmentWithoutOwner({
        attachmentId: ecsData?._id,
        index: ecsData?._index,
      });
      return eventAttachment ? [eventAttachment] : [];
    }

    return ecsData?._id
      ? [
          {
            type: SECURITY_ALERT_ATTACHMENT_TYPE,
            attachmentId: ecsData._id,
            metadata: {
              index: ecsData._index ?? '',
              rule: casesUi.helpers.getRuleIdFromEvent({ ecs: ecsData, data: nonEcsData ?? [] }),
            },
          },
        ]
      : [];
  }, [casesUi.helpers, ecsData, isAlert, nonEcsData]);

  const onCaseSuccess = useCallback(() => {
    if (onSuccess) {
      onSuccess();
    }

    if (refetch) {
      refetch();
    }
  }, [onSuccess, refetch]);

  const selectCaseArgs = useMemo(() => {
    return {
      onClose: onMenuItemClick,
      onSuccess: onCaseSuccess,
    };
  }, [onMenuItemClick, onCaseSuccess]);

  const selectCaseModal = casesUi.hooks.useCasesAddToExistingCaseModal(selectCaseArgs);

  const handleAddToCaseClick = useCallback(() => {
    // TODO rename this, this is really `closePopover()`
    onMenuItemClick();
    onActionClick?.(ADD_TO_CASE_ACTION_IDS.addToCase);
    selectCaseModal.open({
      getAttachments: () => caseAttachments,
    });
  }, [caseAttachments, onActionClick, onMenuItemClick, selectCaseModal]);

  const addToCaseActionItems: AlertTableContextMenuItem[] = useMemo(() => {
    if (!canAttach) {
      return [];
    }

    return [
      {
        'aria-label': ariaLabel,
        'data-test-subj': ADD_TO_CASE_ACTION_IDS.addToCase,
        key: ADD_TO_CASE_ACTION_IDS.addToCase,
        onClick: handleAddToCaseClick,
        name: ADD_TO_CASE,
      },
    ];
  }, [ariaLabel, handleAddToCaseClick, canAttach]);

  return {
    addToCaseActionItems,
    handleAddToCaseClick,
  };
};
