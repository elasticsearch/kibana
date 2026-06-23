/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useRef } from 'react';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiSplitPanel,
  EuiText,
  EuiToolTip,
  useEuiTheme,
  useResizeObserver,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { ActionButton, HeaderBadge } from '@kbn/agent-builder-browser/attachments';
import { i18n } from '@kbn/i18n';
import type { IconType } from '@elastic/eui';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { AttachmentActions } from './attachment_actions';

const PREVIEW_ONLY_LABEL = i18n.translate('xpack.agentBuilder.attachmentHeader.previewOnly', {
  defaultMessage: 'Read-only preview',
});

const CLOSE_PREVIEW_LABEL = i18n.translate('xpack.agentBuilder.attachmentHeader.closePreview', {
  defaultMessage: 'Close preview',
});

const CLOSE_BUTTON_ARIA_LABEL = i18n.translate('xpack.agentBuilder.attachmentHeader.close', {
  defaultMessage: 'Close',
});

export const HEADER_HEIGHT = 72;

interface AttachmentHeaderProps {
  icon?: IconType;
  title: string;
  /** Optional subtitle rendered under the title. */
  subtitle?: string;
  /** Optional badges rendered alongside the title. */
  badges?: HeaderBadge[];
  actionButtons?: ActionButton[];
  onClose?: () => void;
  onClosePreview?: () => void;
  /**
   * Controls preview UI state from the parent.
   * - none: show regular action buttons
   * - preview_available: show "Preview Only" badge
   * - previewing: show "Close preview" button and hide action buttons
   */
  previewBadgeState?: 'none' | 'preview_available' | 'previewing';
}

export const COMPACT_WIDTH_THRESHOLD = 560;

export const AttachmentHeader: React.FC<AttachmentHeaderProps> = ({
  icon,
  title,
  subtitle,
  badges,
  actionButtons,
  onClose,
  onClosePreview,
  previewBadgeState = 'none',
}) => {
  const { euiTheme } = useEuiTheme();

  const measureRef = useRef<HTMLDivElement | null>(null);
  const { width: headerWidth } = useResizeObserver(measureRef.current);
  const isCompact = headerWidth > 0 && headerWidth <= COMPACT_WIDTH_THRESHOLD;

  const textStyles = css`
    font-weight: ${euiTheme.font.weight.semiBold};
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  `;

  const subtitleStyles = css`
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  `;

  const headerStyles = css`
    position: relative;
    border-bottom: ${euiTheme.border.thin};
    border-color: ${euiTheme.colors.borderBaseSubdued};
    min-height: ${HEADER_HEIGHT}px;
  `;

  const badgeStyles = css`
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translate(-50%, 50%);
    z-index: ${euiTheme.levels.content};
  `;

  const hasCloseButton = Boolean(onClose);
  const hasActionButtons = actionButtons && actionButtons.length > 0;

  if (!hasCloseButton && !hasActionButtons) {
    return null;
  }

  return (
    <div ref={measureRef} style={{ width: '100%' }}>
      <EuiSplitPanel.Inner color="subdued" css={headerStyles} paddingSize="m">
        {previewBadgeState === 'preview_available' && (
          <EuiBadge iconType="readOnly" css={badgeStyles}>
            {PREVIEW_ONLY_LABEL}
          </EuiBadge>
        )}
        <EuiFlexGroup
          responsive={false}
          direction="row"
          justifyContent="spaceBetween"
          alignItems="center"
          gutterSize="m"
          style={{ width: '100%' }}
        >
          {/* Start: icon + title/badges/subtitle */}
          <EuiFlexItem grow={true} style={{ minWidth: 0 }}>
            <EuiFlexGroup
              gutterSize="s"
              alignItems="center"
              responsive={false}
              style={{ minWidth: 0 }}
            >
              {icon && (
                <EuiFlexItem grow={false} style={{ flexShrink: 0 }}>
                  <EuiIcon type={icon} color="subdued" size="l" aria-hidden={true} />
                </EuiFlexItem>
              )}
              <EuiFlexItem
                grow={true}
                style={{
                  minWidth: 0,
                  borderLeft: euiTheme.border.thin,
                  borderColor: euiTheme.colors.borderBaseSubdued,
                  paddingLeft: euiTheme.size.s,
                }}
              >
                <EuiFlexGroup
                  direction="column"
                  gutterSize="none"
                  responsive={false}
                  style={{ minWidth: 0 }}
                >
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup
                      gutterSize="none"
                      alignItems="center"
                      responsive={false}
                      wrap
                      style={{
                        minWidth: 0,
                        columnGap: euiTheme.size.s,
                        rowGap: isCompact ? 0 : euiTheme.size.xs,
                      }}
                    >
                      <EuiFlexItem grow={false} style={{ minWidth: 0 }}>
                        <EuiText css={textStyles} size="s">
                          {title}
                        </EuiText>
                      </EuiFlexItem>
                      {badges && badges.length > 0 && (
                        <EuiFlexItem grow={false}>
                          <EuiBadgeGroup gutterSize="xs">
                            {badges.map((badge, index) => (
                              <EuiBadge key={index} color={badge.color} iconType={badge.iconType}>
                                {badge.label}
                              </EuiBadge>
                            ))}
                          </EuiBadgeGroup>
                        </EuiFlexItem>
                      )}
                    </EuiFlexGroup>
                  </EuiFlexItem>
                  {subtitle && (
                    <EuiFlexItem grow={false}>
                      <EuiText css={subtitleStyles} size="xs" color="subdued">
                        {subtitle}
                      </EuiText>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          {/* End: action buttons + close button */}
          <EuiFlexItem grow={false} style={{ flexShrink: 0 }}>
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              {previewBadgeState !== 'previewing' && hasActionButtons && (
                <EuiFlexItem grow={false}>
                  <AttachmentActions buttons={actionButtons} iconOnly={isCompact} />
                </EuiFlexItem>
              )}
              {previewBadgeState === 'previewing' && (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty color="text" size="s" iconType="cross" onClick={onClosePreview}>
                    {CLOSE_PREVIEW_LABEL}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              )}
              {onClose && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={CLOSE_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
                    <EuiButtonIcon
                      aria-label={CLOSE_BUTTON_ARIA_LABEL}
                      iconType="cross"
                      onClick={onClose}
                      size="s"
                      color="text"
                      {...getEbtProps({
                        element: AGENT_BUILDER_UI_EBT.element.pageContent,
                        action: AGENT_BUILDER_UI_EBT.action.conversation.ATTACHMENT_CLOSE,
                        detail: 'attachment',
                      })}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
    </div>
  );
};
