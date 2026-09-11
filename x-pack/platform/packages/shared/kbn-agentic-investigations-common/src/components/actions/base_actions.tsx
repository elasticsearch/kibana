/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  type IconType,
  type EuiContextMenuItemProps,
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiHorizontalRule,
  EuiPopover,
  useEuiTheme,
} from '@elastic/eui';
import { type Investigation } from '../../types';
import type { ConversationsActionsGroupProps } from '../conversation_card';
import { ActionButton } from './action_button';
import { ACTIONS_TRANSLATIONS } from './translations';
import { getActionButtonIconProps } from '../helpers';
import { useOpenInChat } from '../../hooks/use_open_in_chat';

interface ActionConfig {
  key: string;
  icon: IconType;
  color?: EuiContextMenuItemProps['color'];
  name: string;
  onClick: () => void;
  /** Inserts a horizontal rule before this item */
  separator?: boolean;
}

const useContextMenuItems = (
  actions: ActionConfig[],
  onClose: () => void
): React.ReactElement[] => {
  const { euiTheme } = useEuiTheme();
  return useMemo(
    () =>
      actions.flatMap(({ key, icon, color = 'text', name, onClick, separator }) => {
        const item = (
          <EuiContextMenuItem
            style={{
              padding: `${euiTheme.size.xs} ${euiTheme.size.m}`,
            }}
            key={key}
            icon={icon}
            color={color}
            onClick={(ev) => {
              ev.stopPropagation();
              onClose();
              onClick();
            }}
          >
            {name}
          </EuiContextMenuItem>
        );
        return separator
          ? [<EuiHorizontalRule key={`${key}-separator`} margin="none" />, item]
          : [item];
      }),
    [actions, euiTheme.size.xs, euiTheme.size.m, onClose]
  );
};

export type CardActionType = 'openIncident' | 'dismiss' | 'assign';
export interface BaseActionsProps {
  investigation: Investigation;
  isFlyout?: boolean;
  onClickAction: (action: CardActionType, recordId: Investigation['recordId']) => void;
  onClickRecommendedAction?: ConversationsActionsGroupProps['onClickRecommendedAction'];
  /**
   * Opens the conversation in chat. Required when rendering outside a `KibanaContextProvider`
   * (e.g. an Agent Builder flyout slot), where the default `useOpenInChat` cannot reach services.
   */
  onOpenChat?: () => void;
  'data-test-subj'?: string;
}

export const BaseActions = memo<BaseActionsProps>(
  ({
    investigation,
    isFlyout = false,
    onClickAction,
    onClickRecommendedAction,
    onOpenChat: onOpenChatOverride,
    'data-test-subj': dataTestSubj,
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const handleClose = useCallback(() => setIsOpen(false), []);
    const handleToggle = useCallback(() => setIsOpen((prev) => !prev), []);
    const openInChat = useOpenInChat(investigation.id);
    const onOpenChat = onOpenChatOverride ?? openInChat;

    const button = isFlyout ? (
      <EuiButton
        size="s"
        color="primary"
        fill
        iconType="chevronSingleDown"
        iconSide="right"
        onClick={handleToggle}
        data-test-subj={dataTestSubj ? `${dataTestSubj}-button` : undefined}
      >
        {ACTIONS_TRANSLATIONS.buttons.actions}
      </EuiButton>
    ) : (
      <ActionButton
        data-test-subj={dataTestSubj ? `${dataTestSubj}-button` : undefined}
        iconType="boxesVertical"
        tooltipContent={ACTIONS_TRANSLATIONS.tooltips.openMenu}
        onClick={handleToggle}
      />
    );

    const actionConfigs = useMemo<ActionConfig[]>(
      () => [
        ...(onClickRecommendedAction
          ? [
              {
                key: 'proposedAction',
                icon: getActionButtonIconProps(investigation).type,
                color: getActionButtonIconProps(investigation).color,
                name: investigation.primaryActionLabel ?? '',
                onClick: () =>
                  onClickRecommendedAction({
                    id: investigation.id,
                  }),
              },
            ]
          : []),
        ...(!isFlyout
          ? [
              {
                key: 'openChat',
                icon: 'productAgent',
                name: ACTIONS_TRANSLATIONS.buttons.openInChat,
                onClick: onOpenChat,
              },
            ]
          : []),
        {
          key: 'openIncident',
          icon: 'document',
          name: ACTIONS_TRANSLATIONS.buttons.openIncident,
          onClick: () => onClickAction('openIncident', investigation.recordId),
        },
        {
          key: 'assign',
          icon: 'user',
          name: ACTIONS_TRANSLATIONS.buttons.assign,
          onClick: () => onClickAction('assign', investigation.recordId),
          separator: true,
        },
        {
          key: 'dismiss',
          icon: 'trash',
          name: ACTIONS_TRANSLATIONS.buttons.dismiss,
          onClick: () => onClickAction('dismiss', investigation.recordId),
        },
      ],
      [onClickRecommendedAction, investigation, isFlyout, onOpenChat, onClickAction]
    );

    const items = useContextMenuItems(actionConfigs, handleClose);

    return (
      <EuiPopover
        anchorPosition="downRight"
        panelPaddingSize="none"
        data-test-subj={dataTestSubj}
        button={button}
        isOpen={isOpen}
        closePopover={handleClose}
        aria-label={ACTIONS_TRANSLATIONS.popover.ariaLabel}
      >
        <EuiContextMenuPanel
          css={`
            padding: 0;
          `}
          items={items}
          data-test-subj={dataTestSubj ? `${dataTestSubj}-panel` : undefined}
        />
      </EuiPopover>
    );
  }
);

BaseActions.displayName = 'BaseActions';
