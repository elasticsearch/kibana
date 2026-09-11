/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiButtonGroup, EuiFlexGroup, EuiFlexItem, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { ConversationRightActions } from './conversation_actions_right';
import { ConversationTitle } from './conversation_title';
import { useConversationReadOnly } from '../../../hooks/use_conversation';
import {
  type ConversationRenderMode,
  useConversationRenderMode,
} from '../../../context/conversation/conversation_render_mode_context';

const titleSlotStyles = css`
  min-width: 0;
`;

const labels = {
  readOnly: i18n.translate('xpack.agentBuilder.conversationHeader.readOnly', {
    defaultMessage: 'Read-Only',
  }),
  renderModeRounds: i18n.translate('xpack.agentBuilder.conversationHeader.renderModeRounds', {
    defaultMessage: 'Rounds',
  }),
  renderModeEvents: i18n.translate('xpack.agentBuilder.conversationHeader.renderModeEvents', {
    defaultMessage: 'Events',
  }),
};

const renderModeToggleOptions = [
  { id: 'rounds', label: labels.renderModeRounds },
  { id: 'events', label: labels.renderModeEvents },
];

const ConversationReadOnlyBadge = () => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiBadge
      color={euiTheme.colors.lightShade}
      iconType="lock"
      data-test-subj="agentBuilderConversationReadOnlyBadge"
      css={css`
        color: ${euiTheme.colors.text};
      `}
    >
      {labels.readOnly}
    </EuiBadge>
  );
};

interface ConversationHeaderProps {
  ariaLabelledBy?: string;
}
export const ConversationHeader = ({ ariaLabelledBy }: ConversationHeaderProps) => {
  const { isReadOnly } = useConversationReadOnly();
  const { renderMode, setRenderMode } = useConversationRenderMode();

  return (
    <EuiFlexGroup
      alignItems="center"
      justifyContent="spaceBetween"
      gutterSize="s"
      responsive={false}
    >
      <EuiFlexItem grow={true} css={titleSlotStyles}>
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false} css={titleSlotStyles}>
            <ConversationTitle ariaLabelledBy={ariaLabelledBy} />
          </EuiFlexItem>
          {isReadOnly && (
            <EuiFlexItem grow={false}>
              <ConversationReadOnlyBadge />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonGroup
              legend={i18n.translate('xpack.agentBuilder.conversationHeader.renderModeLegend', {
                defaultMessage: 'Conversation render mode',
              })}
              options={renderModeToggleOptions}
              idSelected={renderMode}
              onChange={(id) => setRenderMode(id as ConversationRenderMode)}
              buttonSize="compressed"
              data-test-subj="agentBuilderConversationRenderModeToggle"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <ConversationRightActions />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
