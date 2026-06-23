/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/css';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { useAgentBuilderServices } from '../../../hooks/use_agent_builder_service';

const removeAriaLabel = i18n.translate('xpack.agentBuilder.attachmentPill.removeAriaLabel', {
  defaultMessage: 'Remove attachment',
});

export interface AttachmentPillProps {
  attachment: Attachment;
  onRemoveAttachment?: () => void;
}

const DEFAULT_ICON = 'document';

export const AttachmentPill: React.FC<AttachmentPillProps> = ({
  attachment,
  onRemoveAttachment,
}) => {
  const { attachmentsService } = useAgentBuilderServices();
  const { euiTheme } = useEuiTheme();
  const uiDefinition = attachmentsService.getAttachmentUiDefinition(attachment.type);
  const [isHovered, setIsHovered] = useState(false);

  const displayName = uiDefinition?.getLabel(attachment) ?? attachment.type;
  const canRemoveAttachment = Boolean(onRemoveAttachment);
  const iconType = uiDefinition?.getIcon?.() ?? DEFAULT_ICON;

  const iconContainerStyles = css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${euiTheme.size.xl};
    height: ${euiTheme.size.xl};
    border-radius: ${euiTheme.border.radius.small};
    background-color: ${euiTheme.colors.backgroundBasePrimary};
  `;

  const titleStyles = css`
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
  `;

  return (
    <EuiPanel
      hasShadow={false}
      hasBorder
      color="subdued"
      paddingSize="s"
      css={css`
        max-width: 200px;
        border: ${euiTheme.border.width.thin} solid ${euiTheme.colors.darkShade};
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-test-subj={`agentBuilderAttachmentPill-${attachment.id}`}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <div className={iconContainerStyles}>
            <EuiIcon type={iconType} size="m" color="primary" aria-hidden={true} />
          </div>
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 0 }}>
          <EuiText size="xs" className={titleStyles}>
            <strong>{displayName}</strong>
          </EuiText>
        </EuiFlexItem>
        {canRemoveAttachment && isHovered && (
          <EuiFlexItem grow={false}>
            <EuiToolTip content={removeAriaLabel} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="cross"
                size="xs"
                color="text"
                aria-label={removeAriaLabel}
                onClick={onRemoveAttachment}
                {...getEbtProps({
                  element: AGENT_BUILDER_UI_EBT.element.pageContent,
                  action: AGENT_BUILDER_UI_EBT.action.conversation.REMOVE_ATTACHMENT,
                  detail: 'conversation',
                })}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
