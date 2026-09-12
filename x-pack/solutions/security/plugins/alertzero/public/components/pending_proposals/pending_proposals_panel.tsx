/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiLoadingSpinner, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { usePendingProposals } from '../../hooks/use_proposals_api';
import { useProposalDecisions } from '../../hooks/use_proposal_decisions';
import { ProposalDecisionCard } from './proposal_decision_card';
import { ProposalDecisionModals } from './proposal_decision_modals';
import * as i18n from './translations';

export interface PendingProposalsPanelProps {
  /** Scopes the list to one conversation. Omit for the whole space. */
  conversationId?: string;
  selectedProposalId?: string;
  showTitle?: boolean;
  hideWhenEmpty?: boolean;
}

/**
 * Durable proposals awaiting a decision. Approving resumes the workflow that
 * created the proposal, so the resulting action is attributed to the approver.
 */
export const PendingProposalsPanel: React.FC<PendingProposalsPanelProps> = ({
  conversationId,
  selectedProposalId,
  showTitle = true,
  hideWhenEmpty = false,
}) => {
  const { data, isLoading, error } = usePendingProposals(conversationId);
  const decisions = useProposalDecisions();

  const proposals = data?.proposals ?? [];

  if (isLoading) {
    return <EuiLoadingSpinner size="l" aria-label={i18n.LOADING} />;
  }

  if (error) {
    return <EuiEmptyPrompt iconType="warning" title={<h3>{i18n.LOAD_ERROR}</h3>} />;
  }

  if (proposals.length === 0) {
    return hideWhenEmpty ? null : (
      <EuiText size="s" color="subdued" data-test-subj="alertZeroPendingProposalsEmpty">
        <p>{i18n.EMPTY}</p>
      </EuiText>
    );
  }

  return (
    <div data-test-subj="alertZeroPendingProposalsPanel">
      {showTitle ? (
        <>
          <EuiTitle size="xs">
            <h3>{i18n.SECTION_TITLE}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
        </>
      ) : null}

      {decisions.decisionFailed ? (
        <>
          <KbnDangerCallout announceOnMount title={i18n.DECISION_FAILED} />
          <EuiSpacer size="s" />
        </>
      ) : null}

      {proposals.map((proposal) => (
        <React.Fragment key={proposal.id}>
          <ProposalDecisionCard
            proposal={proposal}
            isSelected={proposal.id === selectedProposalId}
            isBusy={decisions.isBusy}
            onApprove={decisions.requestApproval}
            onDismiss={decisions.requestDismissal}
          />
          <EuiSpacer size="m" />
        </React.Fragment>
      ))}

      <ProposalDecisionModals decisions={decisions} />
    </div>
  );
};
