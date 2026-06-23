/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import type { TimelineItem } from '@kbn/timelines-plugin/common';
import type { CaseAttachmentWithoutOwner } from '@kbn/cases-plugin/public/types';
import { APP_ID } from '../../../../../common';
import { useKibana } from '../../../../common/lib/kibana';
import type { CustomBulkAction } from '../../../../../common/types';
import { ADD_TO_EXISTING_CASE, ADD_TO_NEW_CASE } from '../translations';
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

  const userCasesPermissions = useMemo(() => {
    return casesService?.helpers.canUseCases([APP_ID]);
  }, [casesService]);
  const CasesContext = useMemo(() => casesService?.ui.getCasesContext(), [casesService]);
  const isCasesContextAvailable = Boolean(casesService && CasesContext);

  const onSuccess = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const createCaseFlyout = casesService?.hooks.useCasesAddToNewCaseFlyout({ onSuccess });
  const selectCaseModal = casesService?.hooks.useCasesAddToExistingCaseModal({
    onSuccess,
  });

  return useMemo(() => {
    return isCasesContextAvailable &&
      createCaseFlyout &&
      selectCaseModal &&
      userCasesPermissions?.create &&
      userCasesPermissions?.read
      ? [
          {
            label: ADD_TO_NEW_CASE,
            key: 'attach-new-case',
            'data-test-subj': 'attach-new-case',
            disableOnQuery: true,
            disabledLabel: ADD_TO_NEW_CASE,
            onClick: (events: TimelineItem[] = []) =>
              createCaseFlyout.open({
                attachments: timelineItemsToCaseEventAttachment(events),
              }),
          },
          {
            label: ADD_TO_EXISTING_CASE,
            key: 'attach-existing-case',
            disableOnQuery: true,
            disabledLabel: ADD_TO_EXISTING_CASE,
            'data-test-subj': 'attach-existing-case',
            onClick: (events: TimelineItem[] = []) =>
              selectCaseModal.open({
                getAttachments: (): CaseAttachmentWithoutOwner[] =>
                  timelineItemsToCaseEventAttachment(events),
              }),
          },
        ]
      : [];
  }, [
    createCaseFlyout,
    isCasesContextAvailable,
    selectCaseModal,
    userCasesPermissions?.create,
    userCasesPermissions?.read,
  ]);
};
