/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { Investigation } from '../../types';
import { useOpenInChat } from '../../hooks/use_open_in_chat';
import { ConversationDetailsFlyoutHeader } from './flyout_header';
import { ConversationDetailsFlyoutFooter } from './flyout_footer';
import { OverviewTab, TimelineTab } from './details_flyout_tab_contents';
import { DETAILS_FLYOUT_LABELS } from './translations';

type LocalTabId = 'overview' | 'timeline';

const TABS: ReadonlyArray<{ id: LocalTabId; label: string }> = [
  { id: 'overview', label: DETAILS_FLYOUT_LABELS.tabs.overview },
  { id: 'timeline', label: DETAILS_FLYOUT_LABELS.tabs.timeline },
];

export interface InvestigationDetailsFlyoutProps {
  investigation: Investigation;
  onClose: () => void;
}

/**
 * Renders the investigation flyout from a page that already holds the `Investigation`.
 *
 * This is the second host for the same header/tab/footer components Agent Builder renders through
 * the conversation template registry. It exists because an AlertZero investigation has no Agent
 * Builder conversation id yet, so `openConversationDetails` has nothing to resolve. Once
 * investigations are backed by conversations this host can go and the registry becomes the only
 * one. It has no attachments tab for the same reason: attachments live on the conversation.
 */
export const InvestigationDetailsFlyout = ({
  investigation,
  onClose,
}: InvestigationDetailsFlyoutProps) => {
  const [selectedTabId, setSelectedTabId] = useState<LocalTabId>('overview');
  const titleId = useGeneratedHtmlId({ prefix: 'investigationDetailsFlyoutTitle' });
  const onOpenChat = useOpenInChat(investigation.id);

  return (
    <EuiFlyout
      type="push"
      size="s"
      paddingSize="m"
      onClose={onClose}
      ownFocus={false}
      aria-labelledby={titleId}
      data-test-subj="investigationDetailsFlyout"
    >
      <EuiFlyoutHeader hasBorder css={{ borderBlockEnd: 'none' }}>
        <div id={titleId}>
          <ConversationDetailsFlyoutHeader investigation={investigation} />
        </div>
        <EuiSpacer size="m" />
        <EuiTabs size="m">
          {TABS.map(({ id, label }) => (
            <EuiTab key={id} isSelected={selectedTabId === id} onClick={() => setSelectedTabId(id)}>
              {label}
            </EuiTab>
          ))}
        </EuiTabs>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {selectedTabId === 'overview' ? (
          <OverviewTab investigation={investigation} />
        ) : (
          <TimelineTab events={investigation.events} />
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <ConversationDetailsFlyoutFooter investigation={investigation} onOpenChat={onOpenChat} />
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
