/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  EuiTextTruncate,
} from '@elastic/eui';
import type { AttachmentRenderProps } from '@kbn/agent-builder-browser/attachments';
import { i18n } from '@kbn/i18n';
import type { MonitorAttachment } from './monitor_attachment_definition';

export const MonitorInlineContent: React.FC<AttachmentRenderProps<MonitorAttachment>> = ({
  attachment,
}) => {
  const { data, origin: savedConfigId } = attachment;
  const isDraft = !savedConfigId;

  return (
    <EuiPanel paddingSize="s" hasShadow={false} hasBorder>
      <EuiFlexGroup direction="column" gutterSize="xs">
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="s" wrap>
            <EuiFlexItem grow={false}>
              <EuiBadge color={isDraft ? 'default' : 'success'}>
                {isDraft
                  ? i18n.translate('xpack.synthetics.monitorAttachment.statusDraft', {
                      defaultMessage: 'draft',
                    })
                  : i18n.translate('xpack.synthetics.monitorAttachment.statusSaved', {
                      defaultMessage: 'saved',
                    })}
              </EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">
                {i18n.translate('xpack.synthetics.monitorAttachment.typeHttp', {
                  defaultMessage: 'HTTP',
                })}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        {data.urls && (
          <EuiFlexItem>
            <EuiText size="s">
              <EuiTextTruncate text={data.urls} truncation="end" />
            </EuiText>
          </EuiFlexItem>
        )}

        {data.schedule && (
          <EuiFlexItem>
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.synthetics.monitorAttachment.scheduleEvery', {
                defaultMessage: 'Every {number}{unit}',
                values: { number: data.schedule.number, unit: data.schedule.unit },
              })}
            </EuiText>
          </EuiFlexItem>
        )}

        {data.locations && data.locations.length > 0 && (
          <EuiFlexItem>
            <EuiFlexGroup gutterSize="xs" wrap alignItems="center">
              {data.locations.map((location) => (
                <EuiFlexItem key={location.id} grow={false}>
                  <EuiBadge color="hollow">{location.label ?? location.id}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
        )}

        {data.metadata.description && (
          <EuiFlexItem>
            <EuiText size="s">{data.metadata.description}</EuiText>
          </EuiFlexItem>
        )}

        {data.metadata.tags && data.metadata.tags.length > 0 && (
          <EuiFlexItem>
            <EuiFlexGroup gutterSize="xs" wrap>
              {data.metadata.tags.map((tag) => (
                <EuiFlexItem key={tag} grow={false}>
                  <EuiBadge color="default">{tag}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
