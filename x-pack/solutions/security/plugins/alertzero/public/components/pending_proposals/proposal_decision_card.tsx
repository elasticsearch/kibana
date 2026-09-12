/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { isDecided } from '@kbn/agentic-investigations-plugin/common';
import type { ProposalItem } from '../../../common/proposals/list';
import * as i18n from './translations';

const IMPACT_COLORS: Record<string, string> = {
  low: 'hollow',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

const DECISION_BADGE_COLORS: Record<string, string> = {
  approved: 'success',
  executing: 'success',
  succeeded: 'success',
  failed: 'danger',
  dismissed: 'hollow',
};

export interface ProposalDecisionCardProps {
  /**
   * `ProposalItem` is a widened superset of `ProposalWithMetadata` (only adds
   * an optional `conversationTitle`). The per-conversation panel passes plain
   * `ProposalWithMetadata` and still type-checks because the extra field is
   * optional — preferred over a sibling prop that could disagree with `proposal`.
   */
  proposal: ProposalItem;
  isSelected?: boolean;
  isBusy?: boolean;
  onApprove: (proposal: ProposalItem) => void;
  onDismiss: (proposal: ProposalItem) => void;
}

/**
 * Everything shown here is either stored on the proposal or resolved from the
 * action workflow's own metadata on read, so the card can never describe a
 * different action than the one that would run.
 */
export const ProposalDecisionCard: React.FC<ProposalDecisionCardProps> = ({
  proposal,
  isSelected,
  isBusy,
  onApprove,
  onDismiss,
}) => {
  const [showInput, setShowInput] = useState(false);
  const actionName = proposal.action?.name ?? proposal.actionWorkflowId;
  // Derived from data, not a prop: a prop can disagree with the stored status,
  // the data cannot disagree with itself.
  const decided = isDecided(proposal.status);

  return (
    <EuiPanel
      paddingSize="m"
      hasBorder
      color={isSelected ? 'primary' : 'plain'}
      data-test-subj={`alertZeroProposalCard-${proposal.id}`}
    >
      {proposal.conversationTitle ? (
        <>
          <EuiText size="xs" color="subdued" data-test-subj="alertZeroProposalConversationTitle">
            <p>{proposal.conversationTitle}</p>
          </EuiText>
          <EuiSpacer size="xs" />
        </>
      ) : null}

      <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4>{actionName ?? i18n.NO_ACTION}</h4>
          </EuiTitle>
        </EuiFlexItem>
        {proposal.category ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow" data-test-subj="alertZeroProposalCategory">
              {proposal.category}
            </EuiBadge>
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem grow={false}>
          <EuiBadge color={IMPACT_COLORS[proposal.impact] ?? 'hollow'}>{proposal.impact}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{proposal.confidence}</EuiBadge>
        </EuiFlexItem>
        {proposal.expired ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="danger" data-test-subj="alertZeroProposalExpired">
              {i18n.EXPIRED}
            </EuiBadge>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      {proposal.comment ? (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s">
            <p>{proposal.comment}</p>
          </EuiText>
        </>
      ) : null}

      {!proposal.actionWorkflowId ? (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued">
            <p>{i18n.NO_ACTION}</p>
          </EuiText>
        </>
      ) : null}

      {proposal.actionInput ? (
        <>
          <EuiSpacer size="s" />
          <EuiButtonEmpty
            size="xs"
            flush="left"
            iconType={showInput ? 'arrowDown' : 'arrowRight'}
            onClick={() => setShowInput((value) => !value)}
            data-test-subj="alertZeroProposalToggleInput"
          >
            {proposal.actionWorkflowId}
          </EuiButtonEmpty>
          {showInput ? (
            <EuiCodeBlock language="json" paddingSize="s" fontSize="s" isCopyable>
              {JSON.stringify(proposal.actionInput, null, 2)}
            </EuiCodeBlock>
          ) : null}
        </>
      ) : null}

      <EuiSpacer size="m" />

      {decided ? (
        <EuiBadge
          color={DECISION_BADGE_COLORS[proposal.status] ?? 'hollow'}
          data-test-subj="alertZeroProposalDecision"
        >
          {i18n.PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
        </EuiBadge>
      ) : (
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButton
              size="s"
              fill
              isDisabled={proposal.expired || isBusy}
              onClick={() => onApprove(proposal)}
              data-test-subj="alertZeroProposalApprove"
            >
              {i18n.APPROVE}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              color="danger"
              isDisabled={isBusy}
              onClick={() => onDismiss(proposal)}
              data-test-subj="alertZeroProposalDismiss"
            >
              {i18n.DISMISS}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </EuiPanel>
  );
};
