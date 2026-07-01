/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { CoreStart } from '@kbn/core/public';
import {
  ActionButtonType,
  type ActionButton,
  type AttachmentUIDefinition,
  type GetActionButtonsParams,
} from '@kbn/agent-builder-browser/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import {
  MONITOR_ATTACHMENT_TYPE,
  type MonitorAttachmentData,
} from '../../../common/agent_builder/attachments/monitor_attachment_schema';
import { SYNTHETICS_API_URLS } from '../../../common/constants';
import { MonitorInlineContent } from './monitor_inline_content';
import { buildMonitorRequestBody } from './monitor_attachment_payload';

export { MONITOR_ATTACHMENT_TYPE };

export type MonitorAttachment = Attachment<typeof MONITOR_ATTACHMENT_TYPE, MonitorAttachmentData>;

export interface MonitorAttachmentDefinitionServices {
  http: CoreStart['http'];
  application: CoreStart['application'];
  notifications: CoreStart['notifications'];
}

interface SaveMonitorResponse {
  id?: string;
  config_id?: string;
}

export const createMonitorAttachmentDefinition = (
  services: MonitorAttachmentDefinitionServices
): AttachmentUIDefinition<MonitorAttachment> => ({
  getLabel: (attachment) => attachment.data.metadata.name,
  getIcon: () => 'globe',
  renderInlineContent: (props) => <MonitorInlineContent {...props} />,
  getActionButtons: (params) => buildActionButtons(params, services),
});

const buildActionButtons = (
  { attachment, updateOrigin }: GetActionButtonsParams<MonitorAttachment>,
  { http, application, notifications }: MonitorAttachmentDefinitionServices
): ActionButton[] => {
  const { data, origin } = attachment;
  const isDraft = !origin;

  if (isDraft) {
    return [
      {
        label: i18n.translate('xpack.synthetics.monitorAttachment.saveButton', {
          defaultMessage: 'Save monitor',
        }),
        icon: 'save',
        type: ActionButtonType.PRIMARY,
        handler: async () => {
          try {
            const response = await http.post<SaveMonitorResponse>(
              SYNTHETICS_API_URLS.SYNTHETICS_MONITORS,
              { body: JSON.stringify(buildMonitorRequestBody(data)) }
            );
            const savedId = response.config_id ?? response.id;
            if (savedId) {
              await updateOrigin(savedId);
            }
            notifications.toasts.addSuccess({
              title: i18n.translate('xpack.synthetics.monitorAttachment.saveSuccessTitle', {
                defaultMessage: 'Monitor "{name}" created',
                values: { name: data.metadata.name },
              }),
            });
          } catch (error) {
            notifications.toasts.addError(toToastError(error), {
              title: i18n.translate('xpack.synthetics.monitorAttachment.saveErrorTitle', {
                defaultMessage: 'Failed to save monitor "{name}"',
                values: { name: data.metadata.name },
              }),
            });
          }
        },
      },
    ];
  }

  const configId = origin;

  return [
    {
      label: i18n.translate('xpack.synthetics.monitorAttachment.updateButton', {
        defaultMessage: 'Update monitor',
      }),
      icon: 'save',
      type: ActionButtonType.PRIMARY,
      handler: async () => {
        try {
          await http.put(`${SYNTHETICS_API_URLS.SYNTHETICS_MONITORS}/${configId}`, {
            body: JSON.stringify(buildMonitorRequestBody(data)),
          });
          notifications.toasts.addSuccess({
            title: i18n.translate('xpack.synthetics.monitorAttachment.updateSuccessTitle', {
              defaultMessage: 'Monitor "{name}" updated',
              values: { name: data.metadata.name },
            }),
          });
        } catch (error) {
          notifications.toasts.addError(toToastError(error), {
            title: i18n.translate('xpack.synthetics.monitorAttachment.updateErrorTitle', {
              defaultMessage: 'Failed to update monitor "{name}"',
              values: { name: data.metadata.name },
            }),
          });
        }
      },
    },
    {
      label: i18n.translate('xpack.synthetics.monitorAttachment.viewButton', {
        defaultMessage: 'View in Synthetics',
      }),
      icon: 'popout',
      type: ActionButtonType.OVERFLOW,
      handler: () => {
        application.navigateToUrl(http.basePath.prepend(`/app/synthetics/monitor/${configId}`));
      },
    },
  ];
};

// `notifications.toasts.addError` requires an `Error`; fetch errors from `core.http`
// often surface as `IHttpFetchError` (response.body.message) — unwrap here.
const toToastError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'Unknown error';
  return new Error(message);
};
