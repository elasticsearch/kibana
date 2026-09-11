/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  EuiTitle,
  useEuiTheme,
  EuiTextTruncate,
} from '@elastic/eui';
import { type Investigation } from '../../types';
import type { BaseActionsProps } from '../actions';
import { ConversationsActionsGroup } from './actions_group';

interface ConversationCardProps {
  investigation: Investigation;
  hasBorder: boolean;
  /** Marks the card whose details flyout is currently open. */
  isSelected?: boolean;
  onClickRecommendedAction: BaseActionsProps['onClickRecommendedAction'];
  onClickAction: BaseActionsProps['onClickAction'];
  onClickCard: (id: Investigation['id']) => void;
}

export const ConversationCard = memo<ConversationCardProps>(
  ({
    investigation,
    hasBorder,
    isSelected = false,
    onClickRecommendedAction,
    onClickAction,
    onClickCard,
  }) => {
    const { euiTheme } = useEuiTheme();

    return (
      <EuiPanel
        paddingSize="l"
        role="button"
        tabIndex={0}
        aria-label={investigation.title}
        aria-current={isSelected || undefined}
        borderRadius="none"
        css={{
          cursor: 'pointer',
          borderBottom: hasBorder ? `1px solid ${euiTheme.colors.disabled}` : 'none',
          borderRadius: hasBorder ? 'none' : `0 0 ${euiTheme.size.s} ${euiTheme.size.s}`,
          boxSizing: 'border-box',
          boxShadow: 'none',
          backgroundColor: isSelected ? euiTheme.colors.backgroundBaseInteractiveSelect : undefined,
          '&:hover': {
            backgroundColor: isSelected
              ? euiTheme.colors.backgroundBaseInteractiveSelect
              : euiTheme.colors.backgroundBaseSubdued,
            boxShadow: 'none',
          },
        }}
        hasBorder={false}
        hasShadow={false}
        onClick={() => onClickCard(investigation.id)}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClickCard(investigation.id);
          }
        }}
      >
        <EuiFlexGroup
          alignItems="flexStart"
          gutterSize="l"
          responsive
          justifyContent="spaceBetween"
          direction="row"
        >
          <EuiFlexItem grow={true}>
            <EuiFlexGroup gutterSize="xs" responsive direction="column">
              <EuiFlexItem grow={false}>
                <EuiTitle size="xxs">
                  <EuiTextTruncate text={investigation.title} />
                </EuiTitle>
              </EuiFlexItem>
              {investigation.summary ? (
                <EuiFlexItem grow={false}>
                  <EuiText size="s" color="subdued">
                    <EuiTextTruncate text={investigation.summary} />
                  </EuiText>
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <ConversationsActionsGroup
              investigation={investigation}
              onClickRecommendedAction={onClickRecommendedAction}
              onClickAction={onClickAction}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }
);

ConversationCard.displayName = 'ConversationCard';
