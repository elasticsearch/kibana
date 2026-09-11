/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import type { TimelineItem } from '@kbn/timelines-plugin/common';
import type { CaseAttachmentWithoutOwner } from '@kbn/cases-plugin/public/types';
import { ADD_TO_CASE } from '@kbn/response-ops-alerts-table/translations';
import type { CustomBulkAction } from '../../../../../common/types';
import { useCanAttachToCase } from '../../hooks/use_can_attach_to_case';
import { useKibana } from '../../../../common/lib/kibana';
import { generateEventAttachmentWithoutOwner } from '../utils';

/**
 * Utility function converting multiple timeline items into single attachment (when attaching multiple timeline items to a case)
 */
const timelineItemsToCaseEventAttachment = (
  timelineItems: TimelineItem[]
): CaseAttachmentWithoutOwner[] => {
  const eventAttachment = generateEventAttachmentWithoutOwner({
    attachmentId: timelineItems.map((item) => item._id),
    index: timelineItems.map((item) => item._index),
  });
  return eventAttachment ? [eventAttachment] : [];
};

/** Stable key for the bulk "Add to case" item — imported by the menu component's icon map. */
export const BULK_ADD_TO_CASE_ACTION_ID = 'attach-case' as const;

/**
 * Prepares bulk actions related to case event attachments
 */
export const useBulkAddEventsToCaseActions = ({
  clearSelection,
}: {
  clearSelection: VoidFunction;
}): CustomBulkAction[] => {
  const {
    services: { cases: casesService },
  } = useKibana();

  const canAttach = useCanAttachToCase();
  const CasesContext = useMemo(() => casesService.ui.getCasesContext(), [casesService]);
  const isCasesContextAvailable = Boolean(CasesContext);

  const onSuccess = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const selectCaseModal = casesService.hooks.useCasesAddToExistingCaseModal({
    onSuccess,
  });

  return useMemo(() => {
    return isCasesContextAvailable && selectCaseModal && canAttach
      ? [
          {
            label: ADD_TO_CASE,
            key: BULK_ADD_TO_CASE_ACTION_ID,
            'data-test-subj': BULK_ADD_TO_CASE_ACTION_ID,
            disableOnQuery: true,
            disabledLabel: ADD_TO_CASE,
            onClick: (events: TimelineItem[] = []) =>
              selectCaseModal.open({
                getAttachments: (): CaseAttachmentWithoutOwner[] =>
                  timelineItemsToCaseEventAttachment(events),
              }),
          },
        ]
      : [];
  }, [isCasesContextAvailable, selectCaseModal, canAttach]);
};
