/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { ALERT_RULE_NAME } from '@kbn/rule-data-utils';
import { useAgentBuilderAvailability } from '../../../../agent_builder/hooks/use_agent_builder_availability';
import { useAgentBuilderAttachment } from '../../../../agent_builder/hooks/use_agent_builder_attachment';
import { useReportAddToChat } from '../../../../agent_builder/hooks/use_report_add_to_chat';
import { stringifyEssentialAlertData } from '../../../../agent_builder/helpers';
import { ALERT_ATTACHMENT_PROMPT } from '../../../../agent_builder/components/prompts';
import { SecurityAgentBuilderAttachments } from '../../../../../common/constants';
import type { AlertTableContextMenuItem } from '../types';
import * as i18n from '../../../../agent_builder/components/translations';

export interface UseAddToChatActionParams {
  /**
   * ECS row data as field/value pairs (already available in alert_context_menu).
   */
  ecsData: Array<{ field: string; value: string[] }>;
  /**
   * Closes the context menu popover after the action is triggered.
   */
  onMenuItemClick: () => void;
  /**
   * Alert document ID used to build a stable attachment ID.
   */
  alertId: string;
}

export const useAddToChatAction = ({
  ecsData,
  onMenuItemClick,
  alertId,
}: UseAddToChatActionParams): { addToChatActionItems: AlertTableContextMenuItem[] } => {
  const { isAgentBuilderEnabled, hasValidAgentBuilderLicense } = useAgentBuilderAvailability();
  const reportAddToChat = useReportAddToChat();

  const rawData = useMemo(
    () =>
      ecsData.reduce<Record<string, string[]>>((acc, { field, value }) => {
        acc[field] = value;
        return acc;
      }, {}),
    [ecsData]
  );

  const alertAttachment = useMemo(
    () => ({
      attachmentId: `alert-${alertId}`,
      attachmentType: SecurityAgentBuilderAttachments.alert,
      attachmentData: {
        alert: stringifyEssentialAlertData(rawData),
        attachmentLabel: rawData[ALERT_RULE_NAME]?.[0],
      },
      attachmentPrompt: ALERT_ATTACHMENT_PROMPT,
    }),
    [alertId, rawData]
  );

  const { openAgentBuilderFlyout } = useAgentBuilderAttachment(alertAttachment);

  const addToChatActionItems: AlertTableContextMenuItem[] = useMemo(() => {
    if (!isAgentBuilderEnabled) {
      return [];
    }

    return [
      {
        name: i18n.ADD_TO_CHAT,
        'data-test-subj': 'add-to-chat-action',
        disabled: !hasValidAgentBuilderLicense,
        onClick: () => {
          reportAddToChat({ pathway: 'alerts_flyout', attachments: ['alert'] });
          openAgentBuilderFlyout();
          onMenuItemClick();
        },
      },
    ];
  }, [
    isAgentBuilderEnabled,
    hasValidAgentBuilderLicense,
    reportAddToChat,
    openAgentBuilderFlyout,
    onMenuItemClick,
  ]);

  return { addToChatActionItems };
};
