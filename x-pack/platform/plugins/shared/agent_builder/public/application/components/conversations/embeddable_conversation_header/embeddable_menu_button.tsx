/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiButtonIcon, EuiPopover, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { ConversationsPopoverView } from './conversations_popover_view';
import { AgentsPopoverView } from './agents_popover_view';

const POPOVER_HEIGHT = 500;
const POPOVER_WIDTH = 400;

const openMenuLabel = i18n.translate('xpack.agentBuilder.embeddableMenuButton.openMenu', {
  defaultMessage: 'Open navigation menu',
});

export const EmbeddableMenuButton: React.FC = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [view, setView] = useState<'conversations' | 'agents'>('conversations');

  const closePopover = () => {
    setIsPopoverOpen(false);
    setView('conversations');
  };

  const button = (
    <EuiToolTip content={openMenuLabel} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="menu"
        aria-label={openMenuLabel}
        color="text"
        size="m"
        onClick={() => setIsPopoverOpen((v) => !v)}
        data-test-subj="agentBuilderEmbeddableMenuButton"
        {...getEbtProps({
          element: AGENT_BUILDER_UI_EBT.element.pageContent,
          action: AGENT_BUILDER_UI_EBT.action.conversation.OPEN_EMBEDDABLE_MENU,
          detail: 'conversation',
        })}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downRight"
      aria-label={openMenuLabel}
    >
      {view === 'conversations' ? (
        <ConversationsPopoverView
          panelHeight={POPOVER_HEIGHT}
          panelWidth={POPOVER_WIDTH}
          onSwitchToAgents={() => setView('agents')}
          onClose={closePopover}
        />
      ) : (
        <AgentsPopoverView
          panelHeight={POPOVER_HEIGHT}
          panelWidth={POPOVER_WIDTH}
          onBack={() => setView('conversations')}
          onClose={closePopover}
        />
      )}
    </EuiPopover>
  );
};
