/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { useQuery } from '@kbn/react-query';
import { useKibana } from '../../../../common/lib/kibana';
import { useRemovableAlertAttachments } from '../hooks/use_removable_alert_attachments';
import type { CaseAttachment } from '../utils';
import { fetchCaseAttachments } from '../api';
import { RemoveAttackModal } from './remove_attack_modal';

/** What the confirmed removal should delete, beyond the attack attachments themselves. */
export interface RemoveAttackConfirmation {
  /**
   * Saved object ids of the alert attachments to remove alongside the attacks. Empty unless the
   * user opted out, so the caller can always pass these straight to a bulk delete.
   */
  alertAttachmentIds: string[];
}

export interface ConnectedRemoveAttackModalProps {
  /** The case the attachments belong to. */
  caseId: string;
  /**
   * Attack document ids of the attachments being removed: one for a row action, several for a
   * bulk selection.
   */
  attackIds: readonly string[];
  /** Names what is being removed in the prompt — an attack title, or a count of them. */
  attackTitle: string;
  /** Closes the prompt without removing anything. */
  onCancel: () => void;
  /** Called once the user confirms. Nothing is removed until this runs. */
  onConfirm: (confirmation: RemoveAttackConfirmation) => void;
}

export const FETCH_CASE_ATTACHMENTS_QUERY_KEY = ['GET', 'attack-attachment-case-attachments'];

const NO_ATTACHMENTS: CaseAttachment[] = [];

/**
 * Resolves the removable alerts of the attacks being removed and feeds the confirmation prompt.
 *
 * The case's attachments are fetched here rather than taken as a prop, because the activity log
 * hands a registered attachment's actions only the case id and title. Mount this only while the
 * prompt is open: it costs the attachments request and the attack resolution behind it.
 */
export const ConnectedRemoveAttackModal = ({
  caseId,
  attackIds,
  attackTitle,
  onCancel,
  onConfirm,
}: ConnectedRemoveAttackModalProps) => {
  const { http } = useKibana().services;

  const {
    data: comments,
    isLoading: isLoadingAttachments,
    isError,
  } = useQuery<CaseAttachment[]>(
    [...FETCH_CASE_ATTACHMENTS_QUERY_KEY, caseId],
    ({ signal }) => fetchCaseAttachments({ http, caseId, signal }),
    { retry: false, refetchOnWindowFocus: false }
  );

  const { attachmentIds, alertIds, isResolvable, isLoading } = useRemovableAlertAttachments({
    comments: comments ?? NO_ATTACHMENTS,
    attackIds,
  });

  const onModalConfirm = useCallback(
    ({ removeRelatedAlerts }: { removeRelatedAlerts: boolean }) => {
      onCancel();
      onConfirm({ alertAttachmentIds: removeRelatedAlerts ? attachmentIds : [] });
    },
    [attachmentIds, onCancel, onConfirm]
  );

  return (
    <RemoveAttackModal
      // The count names alert documents, not attachments: an alert attachment can carry several.
      alertCount={alertIds.length}
      attackTitle={attackTitle}
      isLoading={isLoadingAttachments || isLoading}
      // A failed attachments request leaves the case's other attacks invisible, which is exactly
      // what the unresolvable explanation covers.
      isResolvable={!isError && isResolvable}
      onCancel={onCancel}
      onConfirm={onModalConfirm}
    />
  );
};

ConnectedRemoveAttackModal.displayName = 'ConnectedRemoveAttackModal';
