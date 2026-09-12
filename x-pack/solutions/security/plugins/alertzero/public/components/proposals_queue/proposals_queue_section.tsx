/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import styled from '@emotion/styled';
import {
  EuiAccordion,
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { ProposalItem } from '../../../common/proposals/list';
import { ProposalDecisionCard } from '../pending_proposals/proposal_decision_card';
import * as i18n from './translations';

// Mirrors the StyledAccordion in ConversationQueue so the two queues on the
// page read as one visual system.
const StyledAccordion = styled(EuiAccordion)`
  &.euiAccordion-isOpen {
    .euiAccordion__triggerWrapper {
      border-bottom: 1px solid ${({ theme }) => theme.euiTheme.colors.disabled};
    }
  }

  .euiAccordion__triggerWrapper {
    padding: ${({ theme }) =>
      `${theme.euiTheme.size.m} ${theme.euiTheme.size.l} ${theme.euiTheme.size.m} ${theme.euiTheme.size.m}`};
    box-sizing: border-box;
  }
`;

export interface ProposalsQueueSectionProps {
  id: string;
  label: string;
  proposals: ProposalItem[];
  isBusy: boolean;
  initialIsOpen?: boolean;
  /** Shown below the section label — used for the "Closed actions" caption. */
  caption?: string;
  /**
   * Maximum number of rows to show before revealing the rest on demand.
   * Omit (or pass `undefined`) to show all rows immediately.
   */
  maxVisible?: number;
  selectedProposalId?: string;
  onApprove: (proposal: ProposalItem) => void;
  onDismiss: (proposal: ProposalItem) => void;
}

export const ProposalsQueueSection: React.FC<ProposalsQueueSectionProps> = ({
  id,
  label,
  proposals,
  isBusy,
  initialIsOpen = true,
  caption,
  maxVisible,
  selectedProposalId,
  onApprove,
  onDismiss,
}) => {
  const { euiTheme } = useEuiTheme();
  const [showAll, setShowAll] = useState(false);

  const visible = maxVisible !== undefined && !showAll ? proposals.slice(0, maxVisible) : proposals;
  const remaining = proposals.length - visible.length;

  const buttonContent = (
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiTitle
          size="xxs"
          css={css`
            font-weight: ${euiTheme.font.weight.semiBold};
          `}
        >
          <h3>{label}</h3>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge
          color="hollow"
          aria-label={i18n.SECTION_COUNT_ARIA_LABEL(label, proposals.length)}
        >
          {proposals.length}
        </EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  return (
    <EuiPanel
      borderRadius="none"
      css={{ cursor: 'pointer', borderRadius: euiTheme.size.s }}
      paddingSize="none"
      hasBorder
      data-test-subj={`alertZeroProposalsQueueSection-${id}`}
    >
      <StyledAccordion
        id={`alertzero-proposals-section-${id}`}
        buttonContent={buttonContent}
        initialIsOpen={initialIsOpen}
        paddingSize="none"
        buttonProps={{
          css: css`
            &:hover {
              text-decoration: none;
            }
          `,
        }}
      >
        <EuiFlexGroup direction="column" gutterSize="none">
          {caption ? (
            <EuiFlexItem grow={false}>
              <EuiPanel paddingSize="s" color="subdued" borderRadius="none" hasShadow={false}>
                <EuiText size="xs" color="subdued">
                  <p>{caption}</p>
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>
          ) : null}

          {proposals.length > 0 ? (
            <>
              {visible.map((proposal) => (
                <EuiFlexItem key={proposal.id} grow={false}>
                  <EuiPanel paddingSize="m" borderRadius="none" hasBorder={false} hasShadow={false}>
                    <ProposalDecisionCard
                      proposal={proposal}
                      isSelected={proposal.id === selectedProposalId}
                      isBusy={isBusy}
                      onApprove={onApprove}
                      onDismiss={onDismiss}
                    />
                  </EuiPanel>
                </EuiFlexItem>
              ))}

              {remaining > 0 ? (
                <EuiFlexItem grow={false}>
                  <EuiPanel
                    paddingSize="s"
                    borderRadius="none"
                    hasBorder={false}
                    hasShadow={false}
                    css={{ textAlign: 'center' }}
                  >
                    <EuiButtonEmpty
                      size="xs"
                      onClick={() => setShowAll(true)}
                      data-test-subj={`alertZeroProposalsQueueShowMore-${id}`}
                    >
                      {i18n.SHOW_MORE(remaining)}
                    </EuiButtonEmpty>
                  </EuiPanel>
                </EuiFlexItem>
              ) : null}
            </>
          ) : (
            <EuiFlexItem grow={false}>
              <EuiPanel paddingSize="m" borderRadius="none" hasBorder={false} hasShadow={false}>
                <EuiText size="xs" color="subdued">
                  <p>{i18n.EMPTY_SECTION}</p>
                </EuiText>
              </EuiPanel>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </StyledAccordion>
      <EuiSpacer size="xs" />
    </EuiPanel>
  );
};
