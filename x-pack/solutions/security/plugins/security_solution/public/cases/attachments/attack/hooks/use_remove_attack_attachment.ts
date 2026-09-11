/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import { useRefreshCaseViewPage } from '@kbn/cases-plugin/public';
import { useKibana } from '../../../../common/lib/kibana';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import { bulkDeleteCaseAttachments } from '../api';

export const REMOVE_ATTACK_ATTACHMENT_MUTATION_KEY = ['POST', 'attack-attachment-bulk-delete'];

// The alerts are deliberately uncounted: the prompt counts alert *documents* while the removal
// takes alert *attachments*, and one attachment can carry several documents. Restating a number
// here would risk contradicting the one the user was shown.
const getSuccessWithAlerts = (attackCount: number) =>
  i18n.translate('xpack.securitySolution.attackDiscovery.cases.remove.successWithAlerts', {
    defaultMessage:
      'Removed {attackCount, plural, one {the attack and its related alerts} other {# attacks and their related alerts}} from the case',
    values: { attackCount },
  });

const getSuccess = (attackCount: number) =>
  i18n.translate('xpack.securitySolution.attackDiscovery.cases.remove.success', {
    defaultMessage:
      'Removed {attackCount, plural, one {the attack} other {# attacks}} from the case',
    values: { attackCount },
  });

const getErrorTitle = (attackCount: number) =>
  i18n.translate('xpack.securitySolution.attackDiscovery.cases.remove.error', {
    defaultMessage:
      'Failed to remove {attackCount, plural, one {the attack} other {the attacks}} from the case',
    values: { attackCount },
  });

export interface RemoveAttackAttachmentParams {
  /** The case the attachments belong to. */
  caseId: string;
  /**
   * Saved object ids of the attack attachments to remove: one for a row action, several for a
   * bulk selection.
   */
  attackAttachmentIds: readonly string[];
  /**
   * Saved object ids of the alert attachments to remove alongside the attacks. Empty when the
   * user left the prompt's checkbox unchecked, which removes the attacks on their own.
   */
  alertAttachmentIds: readonly string[];
}

/**
 * Removes `security.attack` attachments from a case, optionally taking the alert attachments
 * the removal prompt resolved as safe to remove with them.
 *
 * Everything goes in one bulk-delete call so a partial failure cannot leave an attack removed
 * with its alerts stranded — the endpoint deletes all of the ids or none of them. The attack
 * ids are sent first, which matters only when the set is large enough to be batched.
 *
 * On success the case view page cache is invalidated through the same hook the Cases single
 * delete uses, so the activity log, the Attacks section and the Attachments tab badge all
 * update without a manual refresh. On failure nothing is invalidated and the case is unchanged.
 */
export const useRemoveAttackAttachment = () => {
  const { http } = useKibana().services;
  const { addError, addSuccess } = useAppToasts();
  const refreshCaseViewPage = useRefreshCaseViewPage();

  return useMutation<void, Error, RemoveAttackAttachmentParams>(
    ({ caseId, attackAttachmentIds, alertAttachmentIds }) =>
      bulkDeleteCaseAttachments({
        http,
        caseId,
        attachmentIds: [...attackAttachmentIds, ...alertAttachmentIds],
      }),
    {
      mutationKey: REMOVE_ATTACK_ATTACHMENT_MUTATION_KEY,
      onSuccess: (_result, { attackAttachmentIds, alertAttachmentIds }) => {
        refreshCaseViewPage();
        addSuccess(
          alertAttachmentIds.length > 0
            ? getSuccessWithAlerts(attackAttachmentIds.length)
            : getSuccess(attackAttachmentIds.length)
        );
      },
      onError: (error, { attackAttachmentIds }) => {
        addError(error, { title: getErrorTitle(attackAttachmentIds.length) });
      },
    }
  );
};
