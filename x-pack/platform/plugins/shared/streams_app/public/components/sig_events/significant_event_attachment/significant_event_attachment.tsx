/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiPanel } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  ActionButtonType,
  type AttachmentUIDefinition,
} from '@kbn/agent-builder-browser/attachments';
import type { SignificantEventAttachment } from '@kbn/streams-plugin/common';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE } from '@kbn/streams-plugin/common';
import type { ChromeStart } from '@kbn/core/public';

import type { StreamsAppStartDependencies } from '../../../types';
import { getSigEventStatusColor } from '../significant_events_discovery/components/shared/status_display';
import { SigEventDetails } from '../sig_event_details/sig_event_details';
import type { FocusedSignificantEventService } from '../../../services/significant_events/focused_significant_event_service';
import { registerSignificantEventAutoAttach } from '../lib/significant_event_auto_attach';

const labels = {
  fallback: i18n.translate('xpack.streams.significantEventAttachment.fallbackLabel', {
    defaultMessage: 'Significant event',
  }),
  open: i18n.translate('xpack.streams.significantEventAttachment.openButton', {
    defaultMessage: 'Open',
  }),
};

export const significantEventAttachmentDefinition: AttachmentUIDefinition<SignificantEventAttachment> =
  {
    getLabel: (attachment) => attachment.data.title || labels.fallback,
    getIcon: () => 'significantEvents',
    getHeader: ({ attachment }) => ({
      icon: 'significantEvents',
      subtitle: labels.fallback,
      badges: [
        { label: attachment.data.status, color: getSigEventStatusColor(attachment.data.status) },
      ],
    }),
    getActionButtons: ({ openCanvas, isCanvas }) => {
      if (isCanvas || !openCanvas) {
        return [];
      }
      return [
        {
          label: labels.open,
          type: ActionButtonType.SECONDARY,
          handler: openCanvas,
        },
      ];
    },
    renderCanvasContent: ({ attachment }) => (
      <EuiPanel hasShadow={false} hasBorder={false} paddingSize="m">
        <SigEventDetails event={attachment.data} />
      </EuiPanel>
    ),
  };

export const registerSignificantEventAttachment = ({
  agentBuilder,
  chrome,
  focusedSignificantEventService,
}: {
  agentBuilder: NonNullable<StreamsAppStartDependencies['agentBuilder']>;
  chrome: ChromeStart;
  focusedSignificantEventService: FocusedSignificantEventService;
}): (() => void) => {
  agentBuilder.attachments.addAttachmentType(
    SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
    significantEventAttachmentDefinition
  );

  return registerSignificantEventAutoAttach({
    agentBuilder,
    chrome,
    focusedSignificantEventService,
  });
};
