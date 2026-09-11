/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ATTACK_CARD_DELETE_ACTION_TEST_ID } from '../../../../../common/cases/attachments/attack/test_ids';
import { useRemoveAttackAttachment } from '../hooks/use_remove_attack_attachment';
import type { RemoveAttackConfirmation } from './connected_remove_attack_modal';
import { ConnectedRemoveAttackModal } from './connected_remove_attack_modal';

const REMOVE_ATTACK_TOOLTIP = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.remove.buttonLabel',
  { defaultMessage: 'Remove attack from case' }
);

export interface RemoveAttackCardActionProps {
  /** The case the attachment belongs to. */
  caseId: string;
  /** The attachment saved object id — what the bulk-delete endpoint takes. */
  savedObjectId: string;
  /** The attack document `_id`, saved as the attachment id. */
  attackId: string;
  /** The attack title, shown in the confirmation prompt. */
  attackTitle: string;
}

/**
 * Removes a `security.attack` attachment from its own entry in the case activity log, offering to
 * take the alerts the attack brought in with it.
 *
 * Registered in place of the Cases framework's default trash action so the offer is made at the
 * point an analyst removes an attack, which is the same place an alert attachment is removed from.
 */
export const RemoveAttackCardAction = ({
  caseId,
  savedObjectId,
  attackId,
  attackTitle,
}: RemoveAttackCardActionProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { mutate: removeAttack, isLoading: isRemoving } = useRemoveAttackAttachment();

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const attackIds = useMemo(() => [attackId], [attackId]);

  const onConfirm = useCallback(
    ({ alertAttachmentIds }: RemoveAttackConfirmation) =>
      removeAttack({ caseId, attackAttachmentIds: [savedObjectId], alertAttachmentIds }),
    [caseId, removeAttack, savedObjectId]
  );

  return (
    <>
      <EuiToolTip content={REMOVE_ATTACK_TOOLTIP} disableScreenReaderOutput position="top">
        <EuiButtonIcon
          aria-label={REMOVE_ATTACK_TOOLTIP}
          color="danger"
          data-test-subj={`${ATTACK_CARD_DELETE_ACTION_TEST_ID}-${savedObjectId}`}
          iconType="trash"
          id={`${savedObjectId}-remove-attack`}
          isDisabled={isRemoving}
          onClick={openModal}
        />
      </EuiToolTip>
      {/* Mounted only while open so the case's attachments are fetched once per removal, not once
          per rendered activity card. */}
      {isModalOpen ? (
        <ConnectedRemoveAttackModal
          attackIds={attackIds}
          attackTitle={attackTitle}
          caseId={caseId}
          onCancel={closeModal}
          onConfirm={onConfirm}
        />
      ) : null}
    </>
  );
};

RemoveAttackCardAction.displayName = 'RemoveAttackCardAction';
