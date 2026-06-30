/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiContextMenu,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { type ActionButton, ActionButtonType } from '@kbn/agent-builder-browser/attachments';

interface AttachmentActionsProps {
  buttons: ActionButton[];
  iconOnly?: boolean;
}

export const AttachmentActions: React.FC<AttachmentActionsProps> = ({
  buttons,
  iconOnly = false,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const secondaryButtons = buttons.filter((b) => b.type === ActionButtonType.SECONDARY);
  const primaryButtons = buttons.filter((b) => b.type === ActionButtonType.PRIMARY);
  const overflowButtons = buttons.filter((b) => b.type === ActionButtonType.OVERFLOW);

  const togglePopover = useCallback(() => {
    setIsPopoverOpen((prev) => !prev);
  }, []);

  const closePopover = useCallback(() => {
    setIsPopoverOpen(false);
  }, []);

  const maybeWrapWithTooltip = useCallback((button: ActionButton, element: React.ReactElement) => {
    if (!button.disabled || !button.disabledReason) {
      return element;
    }

    return (
      <EuiToolTip content={button.disabledReason}>
        <span tabIndex={0}>{element}</span>
      </EuiToolTip>
    );
  }, []);

  // Derive the navigation/click props for an EUI button. When `href` is set we
  // render an anchor (so middle-click / cmd-click / "Open in new tab" all work
  // natively); `rel="noopener noreferrer"` is added automatically when
  // `openInNewTab` is true.
  const getNavProps = (button: ActionButton) => ({
    href: button.href,
    target: button.href && button.openInNewTab ? '_blank' : undefined,
    rel: button.href && button.openInNewTab ? 'noopener noreferrer' : undefined,
    onClick: button.handler,
  });

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="flexEnd" responsive={false}>
      {secondaryButtons.map((button) => (
        <EuiFlexItem grow={false} key={button.label}>
          {iconOnly ? (
            <EuiToolTip content={button.disabled ? button.disabledReason : button.label}>
              <span tabIndex={button.disabled ? 0 : undefined}>
                <EuiButtonIcon
                  aria-label={button.label}
                  color="text"
                  size="s"
                  iconType={button.icon ?? ''}
                  isDisabled={button.disabled}
                  {...getNavProps(button)}
                />
              </span>
            </EuiToolTip>
          ) : (
            maybeWrapWithTooltip(
              button,
              <EuiButtonEmpty
                color={button.color ?? 'text'}
                size="s"
                iconType={button.icon}
                isDisabled={button.disabled}
                {...getNavProps(button)}
              >
                {button.label}
              </EuiButtonEmpty>
            )
          )}
        </EuiFlexItem>
      ))}
      {primaryButtons.map((button) => (
        <EuiFlexItem grow={false} key={button.label}>
          {iconOnly ? (
            <EuiToolTip content={button.disabled ? button.disabledReason : button.label}>
              <span tabIndex={button.disabled ? 0 : undefined}>
                <EuiButtonIcon
                  aria-label={button.label}
                  color="text"
                  size="s"
                  iconType={button.icon ?? ''}
                  isDisabled={button.disabled}
                  {...getNavProps(button)}
                />
              </span>
            </EuiToolTip>
          ) : (
            maybeWrapWithTooltip(
              button,
              <EuiButton
                color={button.color ?? 'text'}
                size="s"
                iconType={button.icon}
                isDisabled={button.disabled}
                {...getNavProps(button)}
              >
                {button.label}
              </EuiButton>
            )
          )}
        </EuiFlexItem>
      ))}
      {overflowButtons.length > 0 && (
        <EuiFlexItem grow={false}>
          <EuiPopover
            aria-label={i18n.translate('xpack.agentBuilder.attachmentActions.moreActionsPopover', {
              defaultMessage: 'Attachment actions',
            })}
            button={
              <EuiToolTip
                content={i18n.translate('xpack.agentBuilder.attachmentActions.moreActions', {
                  defaultMessage: 'More actions',
                })}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  color="text"
                  iconType="boxesVertical"
                  aria-label={i18n.translate('xpack.agentBuilder.attachmentActions.moreActions', {
                    defaultMessage: 'More actions',
                  })}
                  onClick={togglePopover}
                  size="s"
                />
              </EuiToolTip>
            }
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            panelPaddingSize="none"
            anchorPosition="downRight"
          >
            <EuiContextMenu
              initialPanelId={0}
              panels={[
                {
                  id: 0,
                  items: overflowButtons.map((button) => ({
                    name: button.label,
                    icon: button.icon,
                    disabled: button.disabled,
                    toolTipContent: button.disabled ? button.disabledReason : undefined,
                    href: button.href,
                    target: button.href && button.openInNewTab ? '_blank' : undefined,
                    rel: button.href && button.openInNewTab ? 'noopener noreferrer' : undefined,
                    onClick: () => {
                      closePopover();
                      button.handler();
                    },
                  })),
                },
              ]}
            />
          </EuiPopover>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
