/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';
import { Conversation } from './conversation';
import { ConversationHeader } from './conversation_header/conversation_header';
import { RoutedConversationsProvider } from '../../context/conversation/routed_conversations_provider';
import { ConversationRenderModeProvider } from '../../context/conversation/conversation_render_mode_context';
import { conversationBackgroundStyles, headerHeight } from './conversation.styles';

export const AgentBuilderConversationsView: React.FC<{}> = () => {
  const { euiTheme } = useEuiTheme();

  const containerStyles = css`
    display: flex;
    flex-direction: column;
    height: var(--kbn-application--content-height);
    ${conversationBackgroundStyles(euiTheme)}
  `;

  const headerStyles = css`
    flex-shrink: 0;
    height: ${headerHeight}px;
    display: flex;
    align-items: center;
    padding: ${euiTheme.size.m};
  `;

  const contentStyles = css`
    width: 100%;
    flex: 1;
    max-block-size: calc(var(--kbn-application--content-height) - ${headerHeight}px);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0 ${euiTheme.size.base} ${euiTheme.size.base} ${euiTheme.size.base};
  `;

  return (
    <ConversationRenderModeProvider>
      <RoutedConversationsProvider>
        <div css={containerStyles} data-test-subj="agentBuilderPageConversations">
          <div css={headerStyles}>
            <ConversationHeader />
          </div>
          <div css={contentStyles}>
            <Conversation />
          </div>
        </div>
      </RoutedConversationsProvider>
    </ConversationRenderModeProvider>
  );
};
