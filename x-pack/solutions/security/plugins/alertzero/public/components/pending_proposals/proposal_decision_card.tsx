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
  EuiMarkdownFormat,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { ProposalWithMetadata } from '@kbn/agentic-investigations-plugin/common';
import * as i18n from './translations';

const IMPACT_COLORS: Record<string, string> = {
  low: 'hollow',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export interface ProposalDecisionCardProps {
  proposal: ProposalWithMetadata;
  isSelected?: boolean;
  isBusy?: boolean;
  onApprove: (proposal: ProposalWithMetadata) => void;
  onDismiss: (proposal: ProposalWithMetadata) => void;
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

  return (
    <EuiPanel
      paddingSize="m"
      hasBorder
      color={isSelected ? 'primary' : 'plain'}
      data-test-subj={`alertZeroProposalCard-${proposal.id}`}
    >
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
          <EuiMarkdownFormat textSize="s" data-test-subj="alertZeroProposalComment">
            {proposal.comment}
          </EuiMarkdownFormat>
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
    </EuiPanel>
  );
};
