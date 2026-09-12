/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiConfirmModal, EuiText, useGeneratedHtmlId } from '@elastic/eui';
import type { ProposalDecisions } from '../../hooks/use_proposal_decisions';
import { DismissProposalModal } from './dismiss_proposal_modal';
import * as i18n from './translations';

export interface ProposalDecisionModalsProps {
  /**
   * A single controller for both modals so that `isBusy` and `decisionFailed`
   * are page-level facts — a per-component instance would show the failure
   * callout in only one section and leave other sections' buttons live during
   * an in-flight write.
   */
  decisions: ProposalDecisions;
}

export const ProposalDecisionModals: React.FC<ProposalDecisionModalsProps> = ({ decisions }) => {
  const approveModalTitleId = useGeneratedHtmlId();
  const { pendingApproval, pendingDismissal } = decisions;

  return (
    <>
      {pendingApproval ? (
        <EuiConfirmModal
          title={i18n.APPROVE_MODAL_TITLE}
          aria-labelledby={approveModalTitleId}
          titleProps={{ id: approveModalTitleId }}
          onCancel={decisions.cancelApproval}
          onConfirm={decisions.confirmApproval}
          cancelButtonText={i18n.CANCEL}
          confirmButtonText={i18n.APPROVE_CONFIRM}
          buttonColor="primary"
          isLoading={decisions.isApproving}
          data-test-subj="alertZeroApproveProposalModal"
        >
          <EuiText size="s">
            <p>{pendingApproval.action?.name ?? pendingApproval.actionWorkflowId}</p>
            <p>{i18n.APPROVE_RUNS_AS_YOU}</p>
          </EuiText>
        </EuiConfirmModal>
      ) : null}

      {pendingDismissal ? (
        <DismissProposalModal
          proposalId={pendingDismissal.id}
          onClose={decisions.cancelDismissal}
          onConfirm={decisions.confirmDismissal}
        />
      ) : null}
    </>
  );
};
