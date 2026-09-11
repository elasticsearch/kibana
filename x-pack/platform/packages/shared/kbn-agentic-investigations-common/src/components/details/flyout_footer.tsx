/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { EuiButton, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { useBoolean } from '@kbn/react-hooks';
import type { Investigation } from '../../types';
import { BaseActions, type CardActionType } from '../actions';
import { AssignActionModal } from '../modals/assign_action_modal';
import { BaseActionModal } from '../modals/base_action_modal';
import { ApprovalModal } from '../modals/approval_modal/approval_modal';
import { MODAL_TRANSLATIONS } from '../modals/translations';
import { DETAILS_FLYOUT_LABELS } from './translations';

export interface ConversationDetailsFlyoutFooterProps {
  investigation: Investigation;
  /** Supplied by the caller because flyout slots render outside a `KibanaContextProvider`. */
  onOpenChat: () => void;
}

interface ModalState {
  type: CardActionType | null;
  recordId: Investigation['recordId'] | null;
}

const CLOSED_MODAL: ModalState = { type: null, recordId: null };

/**
 * Footer slot content. It owns its action modals rather than delegating them upwards: the flyout is
 * mounted through `core.overlays.openFlyout`, so there is no page-level React tree to host them.
 */
export const ConversationDetailsFlyoutFooter = ({
  investigation,
  onOpenChat,
}: ConversationDetailsFlyoutFooterProps) => {
  const [modalState, setModalState] = useState<ModalState>(CLOSED_MODAL);
  const [isApprovalOpen, { on: openApproval, off: closeApproval }] = useBoolean();

  const closeModal = useCallback(() => setModalState(CLOSED_MODAL), []);

  const onClickAction = useCallback(
    (action: CardActionType, recordId: Investigation['recordId']) => {
      setModalState({ type: action, recordId });
    },
    []
  );

  return (
    <>
      <EuiFlexGroup direction="row" gutterSize="s" alignItems="center" justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton
            iconType="productAgent"
            onClick={onOpenChat}
            size="s"
            data-test-subj="investigationFlyoutOpenChat"
          >
            {DETAILS_FLYOUT_LABELS.actions.openChat}
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <BaseActions
            investigation={investigation}
            isFlyout={true}
            onClickAction={onClickAction}
            onClickRecommendedAction={openApproval}
            onOpenChat={onOpenChat}
            data-test-subj="investigationFlyoutActions"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {isApprovalOpen ? (
        <ApprovalModal
          selectedRecommendedActionConversation={investigation}
          onConfirm={closeApproval}
          onClose={closeApproval}
        />
      ) : null}

      {modalState.type === 'assign' && modalState.recordId ? (
        <AssignActionModal
          recordId={modalState.recordId}
          initialAssignee={investigation.assignee}
          onClose={closeModal}
          onAssign={closeModal}
        />
      ) : null}

      {modalState.type === 'dismiss' && modalState.recordId ? (
        <BaseActionModal
          type="dismiss"
          title={MODAL_TRANSLATIONS.dismiss.title}
          recordId={modalState.recordId}
          onClose={closeModal}
          rationalePlaceholder={MODAL_TRANSLATIONS.dismiss.rationalePlaceholder}
          primaryAction={{
            color: 'danger',
            label: MODAL_TRANSLATIONS.dismiss.actionButtonLabel,
            onClick: closeModal,
          }}
        />
      ) : null}
    </>
  );
};
