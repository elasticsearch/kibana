/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useRef } from 'react';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import { useKibana } from '../../common/lib/kibana/use_kibana';

export interface UseAgentBuilderAttachmentParams {
  /**
   * Optional stable ID for the attachment. When provided, the platform will
   * replace any existing attachment with the same ID instead of creating a new one.
   * Falls back to `${attachmentType}-${Date.now()}` when omitted.
   */
  attachmentId?: string;
  /**
   * Type of attachment (e.g., 'alert', 'attack_discovery')
   */
  attachmentType: string;
  /**
   * Data for the attachment. Optional when `origin` is provided.
   */
  attachmentData?: Record<string, unknown>;
  /**
   * Saved-object ID that links this attachment to its source. When set, the platform
   * can call the server-side `resolve` to refresh stale data and the card intent is
   * derived from this field rather than from the attachment data.
   */
  origin?: string;
  /**
   * Prompt/input text for the agent builder conversation
   */
  attachmentPrompt?: string;
  /**
   * Short description shown alongside the attachment in the conversation.
   */
  attachmentDescription?: string;
}

export interface UseAgentBuilderAttachmentResult {
  /**
   * Function to open the agent builder flyout with attachments and prefilled conversation
   */
  openAgentBuilderFlyout: () => void;
}

/**
 * Hook to handle agent builder attachment functionality.
 * Opens a conversation flyout with attachments and prefilled conversation.
 */
export const useAgentBuilderAttachment = ({
  attachmentId,
  attachmentType,
  attachmentData,
  origin,
  attachmentPrompt,
}: UseAgentBuilderAttachmentParams): UseAgentBuilderAttachmentResult => {
  const { agentBuilder } = useKibana().services;
  const hasWarned = useRef(false);

  const openAgentBuilderFlyout = useCallback(() => {
    if (!agentBuilder?.openChat) {
      if (!hasWarned.current) {
        window.console.warn(
          'useAgentBuilderAttachment: agentBuilder service or openChat method is not available. ' +
            'Ensure the agentBuilder plugin is enabled.'
        );
        hasWarned.current = true;
      }
      return;
    }

    const attachment: AttachmentInput = {
      id: attachmentId ?? `${attachmentType}-${Date.now()}`,
      type: attachmentType,
      data: attachmentData,
      origin,
    };

    agentBuilder.openChat({
      autoSendInitialMessage: false,
      newConversation: true,
      initialMessage: attachmentPrompt,
      attachments: [attachment],
      sessionTag: 'security',
    });
  }, [attachmentId, attachmentType, attachmentData, origin, attachmentPrompt, agentBuilder]);

  return {
    openAgentBuilderFlyout,
  };
};
