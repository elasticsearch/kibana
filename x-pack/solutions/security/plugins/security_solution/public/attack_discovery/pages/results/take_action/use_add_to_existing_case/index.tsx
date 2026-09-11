/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { COMMENT_ATTACHMENT_TYPE, SECURITY_ALERT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import type {
  CaseAttachmentWithoutOwner,
  CaseAttachmentsWithoutOwner,
} from '@kbn/cases-plugin/public/types';
import { useAssistantContext } from '@kbn/elastic-assistant';
import { getOriginalAlertIds, type Replacements } from '@kbn/elastic-assistant-common';
import { useCallback } from 'react';

import { useKibana } from '../../../../../common/lib/kibana';
import * as i18n from './translations';

interface Props {
  canUserCreateAndReadCases: () => boolean;
  onClick?: () => void;
}

export interface AddToExistingCaseParams {
  alertIds: string[];
  markdownComments: string[];
  replacements?: Replacements;
  /**
   * When provided and non-empty, these attachments are posted verbatim and `alertIds` /
   * `markdownComments` are ignored. The attack attachment path uses this to post a
   * `security.attack` attachment plus one `security.alert` attachment batching its constituent
   * alerts, instead of a markdown user comment.
   */
  attachments?: CaseAttachmentsWithoutOwner;
}

export const useAddToExistingCase = ({
  canUserCreateAndReadCases,
  onClick,
}: Props): {
  disabled: boolean;
  onAddToExistingCase: (params: AddToExistingCaseParams) => void;
} => {
  const { cases } = useKibana().services;
  const { alertsIndexPattern } = useAssistantContext();

  const { open: openSelectCaseModal } = cases.hooks.useCasesAddToExistingCaseModal({
    onClose: onClick,
    successToaster: {
      title: i18n.ADD_TO_CASE_SUCCESS,
    },
  });

  const onAddToExistingCase = useCallback(
    ({
      alertIds,
      attachments: providedAttachments,
      markdownComments,
      replacements,
    }: AddToExistingCaseParams) => {
      // The attack attachment path builds its own payload; post it verbatim rather than
      // rebuilding the markdown comment and alert attachments from ids.
      if (providedAttachments != null && providedAttachments.length > 0) {
        openSelectCaseModal({ getAttachments: () => providedAttachments });
        return;
      }

      const userCommentAttachments = markdownComments.map<CaseAttachmentWithoutOwner>((x) => ({
        type: COMMENT_ATTACHMENT_TYPE,
        data: { content: x },
      }));

      const originalAlertIds = getOriginalAlertIds({ alertIds, replacements });
      const alertAttachments = originalAlertIds.map<CaseAttachmentWithoutOwner>((alertId) => ({
        type: SECURITY_ALERT_ATTACHMENT_TYPE,
        attachmentId: alertId,
        metadata: {
          index: alertsIndexPattern ?? '',
          rule: {
            id: null,
            name: null,
          },
        },
      }));

      const attachments = [...userCommentAttachments, ...alertAttachments];

      openSelectCaseModal({ getAttachments: () => attachments });
    },
    [alertsIndexPattern, openSelectCaseModal]
  );

  return {
    disabled: !canUserCreateAndReadCases(),
    onAddToExistingCase,
  };
};
