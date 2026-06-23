/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonIcon, EuiFlexGroup, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { useConversationContext } from '../../../context/conversation/conversation_context';
import { MoreActionsButton } from './more_actions_button';

const labels = {
  container: i18n.translate('xpack.agentBuilder.conversationActions.container', {
    defaultMessage: 'Conversation actions',
  }),
  close: i18n.translate('xpack.agentBuilder.conversationActions.close', {
    defaultMessage: 'Close',
  }),
};

export interface ConversationRightActionsProps {
  onClose?: () => void;
}

export const ConversationRightActions: React.FC<ConversationRightActionsProps> = ({ onClose }) => {
  const { isEmbeddedContext } = useConversationContext();

  return (
    <EuiFlexGroup
      gutterSize="xs"
      justifyContent="flexEnd"
      alignItems="center"
      aria-label={labels.container}
      responsive={false}
    >
      <MoreActionsButton onCloseSidebar={isEmbeddedContext ? onClose : undefined} />
      {isEmbeddedContext && (
        <EuiToolTip content={labels.close} disableScreenReaderOutput>
          <EuiButtonIcon
            color="text"
            iconType="cross"
            size="m"
            onClick={onClose}
            aria-label={labels.close}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.conversation.CLOSE,
              detail: 'conversation',
            })}
          />
        </EuiToolTip>
      )}
    </EuiFlexGroup>
  );
};
