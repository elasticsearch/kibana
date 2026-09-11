/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import styled from '@emotion/styled';
import {
  EuiAccordion,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiPanel,
  useEuiTheme,
  EuiText,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { CONVERSATION_QUEUE_LABELS, type Investigation, type RecommendedAction } from '../../types';
import { EMPTY_CONVERSATION_QUEUE } from './translations';
import { ConversationCard, type ConversationsActionsGroupProps } from '../conversation_card';
import { type BaseActionsProps } from '../actions';

interface ConversationQueueProps {
  briefingId: string;
  briefingType: RecommendedAction;
  briefingList: Investigation[];
  onClickAction: BaseActionsProps['onClickAction'];
  onClickCard: (id: Investigation['id']) => void;
  onClickRecommendedAction: ConversationsActionsGroupProps['onClickRecommendedAction'];
  isFiltered?: boolean;
  /** Id of the conversation whose details flyout is open, highlighted in the list. */
  selectedId?: string;
}

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

export const ConversationQueue = memo<ConversationQueueProps>(
  ({
    briefingId,
    briefingType,
    briefingList,
    isFiltered = false,
    onClickAction,
    onClickCard,
    onClickRecommendedAction,
    selectedId,
  }) => {
    const { euiTheme } = useEuiTheme();
    const buttonContent = (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle
            size="xxs"
            css={css`
              font-weight: ${euiTheme.font.weight.semiBold};
            `}
          >
            <h3>{CONVERSATION_QUEUE_LABELS[briefingType]}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{briefingList.length}</EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
    );

    return (
      <EuiPanel
        key={briefingId}
        borderRadius="none"
        css={{
          cursor: 'pointer',
          borderRadius: euiTheme.size.s,
        }}
        paddingSize="none"
        hasBorder
      >
        <StyledAccordion
          id={`conversation-container-${briefingId}`}
          buttonContent={buttonContent}
          initialIsOpen
          paddingSize="none"
          buttonProps={{
            css: css`
              &:hover {
                text-decoration: none;
              }
            `,
          }}
        >
          {briefingList.length > 0 ? (
            <EuiFlexGroup direction="column" gutterSize="none">
              {briefingList.map((investigation, i) => (
                <EuiFlexItem key={investigation.id} grow={false}>
                  <ConversationCard
                    investigation={investigation}
                    hasBorder={i < briefingList.length - 1}
                    isSelected={investigation.id === selectedId}
                    onClickAction={onClickAction}
                    onClickCard={onClickCard}
                    onClickRecommendedAction={onClickRecommendedAction}
                  />
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          ) : (
            <EuiPanel>
              <EuiText size="xs" color="subdued">
                {isFiltered
                  ? EMPTY_CONVERSATION_QUEUE.emptyQueueWithFilter
                  : EMPTY_CONVERSATION_QUEUE.emptyQueue}
              </EuiText>
            </EuiPanel>
          )}
        </StyledAccordion>
      </EuiPanel>
    );
  }
);

ConversationQueue.displayName = 'ConversationQueue';
