/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { IconType } from '@elastic/eui';
import { EuiTitle } from '@elastic/eui';
import type { ConversationTemplateServiceStartContract } from '@kbn/agent-builder-browser';
import type { Investigation } from '../types';
import { ConversationDetailsFlyoutHeader } from '../components/details/flyout_header';
import { ConversationDetailsFlyoutFooter } from '../components/details/flyout_footer';
import {
  AttachmentsTab,
  OverviewTab,
  TimelineTab,
} from '../components/details/details_flyout_tab_contents';
import { DETAILS_FLYOUT_LABELS } from '../components/details/translations';
import { InvestigationSlot, type InvestigationLoader } from './investigation_slot';

/**
 * Tab ids are prefixed with the solution's template id because Agent Builder's tab ids are a
 * global keyspace and duplicate registration throws. `timeline` is deliberately not reused: Agent
 * Builder's built-in tab of that name renders chat execution events, not investigation events.
 */
export const getInvestigationTabIds = (templateId: string): readonly string[] => [
  `${templateId}.overview`,
  `${templateId}.attachments`,
  `${templateId}.timeline`,
];

export interface RegisterAgenticInvestigationTemplateUIOptions {
  conversationTemplates: ConversationTemplateServiceStartContract;
  /** Solution-owned conversation template id. Agent Builder throws if it is already registered. */
  templateId: string;
  /** Localized template display name, shown in Agent Builder's title badge. */
  name: string;
  icon?: IconType;
  loadInvestigation: InvestigationLoader;
}

/**
 * Every slot of an open flyout resolves the same investigation, so concurrent loads for one
 * conversation share a request instead of issuing one per slot.
 */
const shareConcurrentLoads = (load: InvestigationLoader): InvestigationLoader => {
  const inFlight = new Map<string, Promise<Investigation>>();

  return (conversationId) => {
    const pending = inFlight.get(conversationId);
    if (pending) {
      return pending;
    }

    const request = load(conversationId).finally(() => inFlight.delete(conversationId));
    inFlight.set(conversationId, request);
    return request;
  };
};

/**
 * Registers one solution's agentic investigation flyout UI: the tabs Agent Builder renders, plus
 * the header and footer of its conversation details flyout.
 *
 * Call once per solution from the plugin's `start`. Tabs are registered per template rather than
 * shared, so each solution's tab components close over its own investigation loader.
 */
export const registerAgenticInvestigationTemplateUI = ({
  conversationTemplates,
  templateId,
  name,
  icon,
  loadInvestigation,
}: RegisterAgenticInvestigationTemplateUIOptions): void => {
  const load = shareConcurrentLoads(loadInvestigation);
  const [overviewTabId, attachmentsTabId, timelineTabId] = getInvestigationTabIds(templateId);

  conversationTemplates.registerTab(overviewTabId, () => ({
    label: DETAILS_FLYOUT_LABELS.tabs.overview,
    content: function OverviewTabContent({ conversation }) {
      return (
        <InvestigationSlot conversation={conversation} loadInvestigation={load}>
          {(investigation) => <OverviewTab investigation={investigation} />}
        </InvestigationSlot>
      );
    },
  }));

  conversationTemplates.registerTab(attachmentsTabId, ({ attachmentsService }) => ({
    label: DETAILS_FLYOUT_LABELS.tabs.attachments,
    content: function AttachmentsTabContent({ conversation }) {
      return <AttachmentsTab conversation={conversation} attachmentsService={attachmentsService} />;
    },
  }));

  conversationTemplates.registerTab(timelineTabId, () => ({
    label: DETAILS_FLYOUT_LABELS.tabs.timeline,
    content: function TimelineTabContent({ conversation }) {
      return (
        <InvestigationSlot conversation={conversation} loadInvestigation={load}>
          {(investigation) => <TimelineTab events={investigation.events} />}
        </InvestigationSlot>
      );
    },
  }));

  conversationTemplates.registerTemplateUIDefinition(templateId, ({ openSidebarConversation }) => ({
    name,
    icon,
    tabs: [overviewTabId, attachmentsTabId, timelineTabId],
    detailsFlyout: {
      header: function InvestigationFlyoutHeader({ conversation }) {
        return (
          <InvestigationSlot
            conversation={conversation}
            loadInvestigation={load}
            // Agent Builder points the flyout's `aria-labelledby` at the header, so it must not
            // collapse to nothing when the investigation is unavailable.
            fallback={
              <EuiTitle size="s">
                <h2>{conversation.title}</h2>
              </EuiTitle>
            }
          >
            {(investigation) => <ConversationDetailsFlyoutHeader investigation={investigation} />}
          </InvestigationSlot>
        );
      },
      footer: function InvestigationFlyoutFooter({ conversation }) {
        return (
          <InvestigationSlot conversation={conversation} loadInvestigation={load} fallback={null}>
            {(investigation) => (
              <ConversationDetailsFlyoutFooter
                investigation={investigation}
                onOpenChat={() => openSidebarConversation(conversation.id)}
              />
            )}
          </InvestigationSlot>
        );
      },
    },
  }));
};
