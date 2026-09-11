/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import {
  SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
  type ServiceMapContextAttachmentData,
} from '../../../common/agent_builder/attachments';

type ServiceMapContextAttachment = Attachment<
  typeof SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
  ServiceMapContextAttachmentData
>;

/** Exported separately so the definition object can be unit-tested without a live attachments service. */
export function createServiceMapContextAttachmentDefinition() {
  return {
    getLabel: () =>
      i18n.translate('xpack.apm.agentBuilder.attachments.serviceMapContext.label', {
        defaultMessage: 'Service map context',
      }),
    getIcon: () => 'graphApp' as const,
    renderInlineContent: ({ attachment }: { attachment: ServiceMapContextAttachment }) => {
      const { environment, kuery, timeRange, serviceGroupId, highlightedServiceNames } =
        attachment.data ?? {};
      return (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {timeRange && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{`${timeRange.from} → ${timeRange.to}`}</EuiBadge>
            </EuiFlexItem>
          )}
          {environment && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{environment}</EuiBadge>
            </EuiFlexItem>
          )}
          {kuery && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{kuery}</EuiBadge>
            </EuiFlexItem>
          )}
          {serviceGroupId && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">
                {i18n.translate('xpack.apm.agentBuilder.attachments.serviceMapContext.group', {
                  defaultMessage: 'Group: {serviceGroupId}',
                  values: { serviceGroupId },
                })}
              </EuiBadge>
            </EuiFlexItem>
          )}
          {highlightedServiceNames?.map((serviceName) => (
            <EuiFlexItem grow={false} key={serviceName}>
              <EuiBadge color="primary">{serviceName}</EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      );
    },
  };
}

export const registerServiceMapContextAttachment = (
  attachments: AttachmentServiceStartContract
) => {
  attachments.addAttachmentType<ServiceMapContextAttachment>(
    SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE,
    createServiceMapContextAttachmentDefinition()
  );
};
