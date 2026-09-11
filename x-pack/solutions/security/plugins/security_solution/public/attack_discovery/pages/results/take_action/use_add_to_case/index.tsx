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
import React, { useCallback, useMemo } from 'react';

import { useKibana } from '../../../../../common/lib/kibana';
import * as i18n from './translations';

interface Props {
  canUserCreateAndReadCases: () => boolean;
  title: string;
  onClick?: () => void;
}

export interface AddToNewCaseParams {
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

export const useAddToNewCase = ({
  canUserCreateAndReadCases,
  title,
  onClick,
}: Props): {
  disabled: boolean;
  onAddToNewCase: (params: AddToNewCaseParams) => void;
} => {
  const { cases } = useKibana().services;
  const { alertsIndexPattern } = useAssistantContext();

  const createCaseFlyout = cases.hooks.useCasesAddToNewCaseFlyout({
    initialValue: {
      description: i18n.CASE_DESCRIPTION(title),
      title,
    },
    toastContent: i18n.ADD_TO_CASE_SUCCESS,
  });
  const openCreateCaseFlyout = useCallback(
    ({
      alertIds,
      attachments: providedAttachments,
      headerContent,
      markdownComments,
      replacements,
    }: AddToNewCaseParams & { headerContent?: React.ReactNode }) => {
      // The attack attachment path builds its own payload; post it verbatim rather than
      // rebuilding the markdown comment and alert attachments from ids.
      if (providedAttachments != null && providedAttachments.length > 0) {
        createCaseFlyout.open({ attachments: providedAttachments, headerContent });
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

      createCaseFlyout.open({
        attachments,
        headerContent,
      });
    },
    [alertsIndexPattern, createCaseFlyout]
  );

  const headerContent = useMemo(
    () => <div>{i18n.CREATE_A_CASE_FOR_ATTACK_DISCOVERY(title)}</div>,
    [title]
  );

  const onAddToNewCase = useCallback(
    ({ alertIds, attachments, markdownComments, replacements }: AddToNewCaseParams) => {
      if (onClick) {
        onClick();
      }

      openCreateCaseFlyout({
        alertIds,
        attachments,
        headerContent,
        markdownComments,
        replacements,
      });
    },
    [headerContent, onClick, openCreateCaseFlyout]
  );

  return {
    disabled: !canUserCreateAndReadCases(),
    onAddToNewCase,
  };
};
