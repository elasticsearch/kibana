/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import classNames from 'classnames';
import type { MouseEventHandler } from 'react';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { EuiContextMenuPanelDescriptor, IconType } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiContextMenu,
  EuiIcon,
  EuiIconTip,
  EuiNotificationBadge,
  EuiPopover,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { Action, ActionExecutionContext } from '@kbn/ui-actions-plugin/public';
import { buildContextMenuForActions, triggers } from '@kbn/ui-actions-plugin/public';

import { css } from '@emotion/react';
import type { EmbeddableApiContext, PublishesTitle, ViewMode } from '@kbn/presentation-publishing';
import { apiCanLockHoverActions, useBatchedPublishingSubjects } from '@kbn/presentation-publishing';
import type { ActionWithContext } from '@kbn/ui-actions-plugin/public/context_menu/build_eui_context_menu_panels';
import { BehaviorSubject, Subscription, switchMap } from 'rxjs';
import {
  ON_OPEN_PANEL_MENU,
  PANEL_NOTIFICATION_TRIGGER,
} from '@kbn/ui-actions-plugin/common/trigger_ids';
import { uiActions } from '../../../kibana_services';
import type { DefaultPresentationPanelApi, PresentationPanelProps } from '../types';
import {
  DEFAULT_QUICK_ACTIONS,
  EmbeddableRendererContext,
} from '../../embeddable_renderer_context';

const getContextMenuAriaLabel = (title?: string, index?: number) => {
  if (title) {
    return i18n.translate('embeddableApi.contextMenu.ariaLabelWithTitle', {
      defaultMessage: 'Menu for {title}',
      values: { title },
    });
  }
  if (index) {
    return i18n.translate('embeddableApi.contextMenu.ariaLabelWithIndex', {
      defaultMessage: 'Menu for panel {index}',
      values: { index },
    });
  }
  return i18n.translate('embeddableApi.contextMenu.ariaLabel', {
    defaultMessage: 'Panel menu',
  });
};

const ALLOWED_NOTIFICATIONS = ['ACTION_FILTERS_NOTIFICATION'] as const;

const createClickHandler =
  (action: Action<EmbeddableApiContext>, context: ActionExecutionContext<EmbeddableApiContext>) =>
  (event: React.MouseEvent) => {
    if (event.currentTarget instanceof HTMLAnchorElement) {
      // from react-router's <Link/>
      if (
        !event.defaultPrevented && // onClick prevented default
        event.button === 0 && // ignore everything but left clicks
        (!event.currentTarget.target || event.currentTarget.target === '_self') && // let browser handle "target=_blank" etc.
        !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) // ignore clicks with modifier keys
      ) {
        event.preventDefault();
      }
    }
    (event.currentTarget as HTMLElement).blur();
    action.execute(context);
  };

export interface PresentationPanelHoverActionsProps {
  api: DefaultPresentationPanelApi;
  index?: number;
  getActions: PresentationPanelProps['getActions'];
  setDragHandle: (id: string, ref: HTMLElement | null) => void;
  actionPredicate?: (actionId: string) => boolean;
  className?: string;
  viewMode?: ViewMode;
  showNotifications?: boolean;
  showBorder?: boolean;
}

export const PresentationPanelHoverActions = ({
  api,
  index,
  getActions,
  setDragHandle,
  actionPredicate,
  className,
  viewMode,
  showNotifications = true,
}: PresentationPanelHoverActionsProps) => {
  const [quickActions, setQuickActions] = useState<Action<EmbeddableApiContext>[]>([]);
  const [contextMenuPanels, setContextMenuPanels] = useState<EuiContextMenuPanelDescriptor[]>([]);
  const [showNotification, setShowNotification] = useState<boolean>(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<Action<EmbeddableApiContext>[]>([]);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);

  const { euiTheme } = useEuiTheme();

  const [
    title,
    description,
    hidePanelTitle,
    hasLockedHoverActions,
    parentHideTitle,
    disabledActionIds,
  ] = useBatchedPublishingSubjects(
    api.title$ ?? new BehaviorSubject(undefined),
    api.description$ ?? new BehaviorSubject(undefined),
    api.hideTitle$ ?? new BehaviorSubject(false),
    api.hasLockedHoverActions$ ?? new BehaviorSubject(false),
    (api.parentApi as Partial<PublishesTitle>)?.hideTitle$ ?? new BehaviorSubject(false),
    api.disabledActionIds$ ?? new BehaviorSubject(undefined)
  );

  const hideTitle = hidePanelTitle || parentHideTitle;
  const showDescription = description && (!title || hideTitle);

  const contextQuickActions = useContext(EmbeddableRendererContext)?.quickActions;
  const quickActionIds = useMemo(() => {
    const actionMode = viewMode === 'edit' ? 'edit' : 'view';
    return (contextQuickActions?.[actionMode] ?? DEFAULT_QUICK_ACTIONS[actionMode])?.filter(
      (actionId) => actionId && (disabledActionIds ?? [])?.indexOf(actionId) === -1
    );
  }, [viewMode, contextQuickActions, disabledActionIds]);

  const onClose = useCallback(() => {
    setIsContextMenuOpen(false);
    if (apiCanLockHoverActions(api)) {
      api?.lockHoverActions(false);
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    let canceled = false;

    const apiContext = { embeddable: api };
    const subscriptions = new Subscription();
    const handleActionCompatibilityChange = (
      type: 'quickActions' | 'notifications',
      isCompatible: boolean,
      action: Action<EmbeddableApiContext>
    ) => {
      if (canceled) return;
      (type === 'quickActions' ? setQuickActions : setNotifications)((currentActions) => {
        const newActions = currentActions?.filter((current) => current.id !== action.id);
        if (isCompatible) return [...newActions, action];
        return newActions;
      });
    };

    (async () => {
      // subscribe to any frequently changing context menu actions
      const frequentlyChangingActions = await uiActions.getFrequentlyChangingActionsForTrigger(
        ON_OPEN_PANEL_MENU,
        apiContext
      );
      if (canceled) return;

      for (const frequentlyChangingAction of frequentlyChangingActions) {
        if ((quickActionIds as readonly string[]).includes(frequentlyChangingAction.id)) {
          const compatibilitySubscription = frequentlyChangingAction
            .getCompatibilityChangesSubject(apiContext)
            ?.pipe(
              switchMap(async () => {
                return await frequentlyChangingAction.isCompatible({
                  ...apiContext,
                  trigger: triggers[ON_OPEN_PANEL_MENU],
                });
              })
            )
            .subscribe(async (isCompatible) => {
              handleActionCompatibilityChange(
                'quickActions',
                isCompatible,
                frequentlyChangingAction as Action<EmbeddableApiContext>
              );
            });
          subscriptions.add(compatibilitySubscription);
        }
      }

      // subscribe to any frequently changing notification actions
      const frequentlyChangingNotifications =
        await uiActions.getFrequentlyChangingActionsForTrigger(
          PANEL_NOTIFICATION_TRIGGER,
          apiContext
        );
      if (canceled) return;

      for (const frequentlyChangingNotification of frequentlyChangingNotifications) {
        if (
          (ALLOWED_NOTIFICATIONS as readonly string[]).includes(frequentlyChangingNotification.id)
        ) {
          const compatibilitySubscription = frequentlyChangingNotification
            .getCompatibilityChangesSubject(apiContext)
            ?.pipe(
              switchMap(async () => {
                return await frequentlyChangingNotification.isCompatible({
                  ...apiContext,
                  trigger: triggers[PANEL_NOTIFICATION_TRIGGER],
                });
              })
            )
            .subscribe(async (isCompatible) => {
              handleActionCompatibilityChange(
                'notifications',
                isCompatible,
                frequentlyChangingNotification as Action<EmbeddableApiContext>
              );
            });
          subscriptions.add(compatibilitySubscription);
        }
      }
    })();

    return () => {
      canceled = true;
      subscriptions.unsubscribe();
    };
  }, [api, quickActionIds]);

  useEffect(() => {
    if (!api) return;

    let canceled = false;
    const apiContext = { embeddable: api };

    (async () => {
      let compatibleActions = (await (async () => {
        if (getActions) return await getActions(ON_OPEN_PANEL_MENU, apiContext);
        return (
          (await uiActions.getTriggerCompatibleActions(ON_OPEN_PANEL_MENU, {
            embeddable: api,
          })) ?? []
        );
      })()) as Action<EmbeddableApiContext>[];
      if (canceled) return;

      if (disabledActionIds) {
        compatibleActions = compatibleActions.filter(
          (action) => disabledActionIds.indexOf(action.id) === -1
        );
      }

      if (actionPredicate) {
        compatibleActions = compatibleActions.filter(({ id }) => actionPredicate(id));
      }

      compatibleActions.sort(
        ({ order: orderA }, { order: orderB }) => (orderB || 0) - (orderA || 0)
      );

      const contextMenuActions = compatibleActions.filter(
        ({ id }) => !(quickActionIds as readonly string[]).includes(id)
      );

      const menuPanels = await buildContextMenuForActions({
        actions: contextMenuActions.map((action) => ({
          action,
          context: apiContext,
          trigger: triggers[ON_OPEN_PANEL_MENU],
        })) as ActionWithContext[],
        closeMenu: onClose,
      });
      setContextMenuPanels(menuPanels);
      setShowNotification(contextMenuActions.some((action) => action.showNotification));
      setQuickActions(
        compatibleActions.filter(({ id }) => (quickActionIds as readonly string[]).includes(id))
      );
    })();

    return () => {
      canceled = true;
    };
  }, [
    actionPredicate,
    api,
    getActions,
    isContextMenuOpen,
    onClose,
    viewMode,
    quickActionIds,
    disabledActionIds,
  ]);

  const quickActionElements = useMemo(() => {
    if (!api || quickActions.length < 1) return [];

    const apiContext = { embeddable: api, trigger: triggers[ON_OPEN_PANEL_MENU] };

    return quickActions
      .sort(({ order: orderA }, { order: orderB }) => {
        const orderComparison = (orderB || 0) - (orderA || 0);
        return orderComparison;
      })
      .map((action) => {
        const name = action.getDisplayName(apiContext);
        const iconType = action.getIconType(apiContext) as IconType;
        const id = action.id;

        return {
          iconType,
          'data-test-subj': `embeddablePanelAction-${action.id}`,
          onClick: createClickHandler(action, apiContext),
          name,
          id,
        };
      });
  }, [api, quickActions]);

  const notificationElements = useMemo(() => {
    if (!showNotifications || !api) return [];
    return notifications?.map((notification) => {
      let notificationComponent = notification.MenuItem ? (
        React.createElement(notification.MenuItem, {
          key: notification.id,
          context: {
            embeddable: api,
            trigger: triggers[PANEL_NOTIFICATION_TRIGGER],
          },
        })
      ) : (
        <EuiNotificationBadge
          data-test-subj={`embeddablePanelNotification-${notification.id}`}
          key={notification.id}
          css={{ marginTop: euiTheme.size.xs, marginRight: euiTheme.size.xs }}
          onClick={() =>
            notification.execute({ embeddable: api, trigger: triggers[PANEL_NOTIFICATION_TRIGGER] })
          }
        >
          {notification.getDisplayName({
            embeddable: api,
            trigger: triggers[PANEL_NOTIFICATION_TRIGGER],
          })}
        </EuiNotificationBadge>
      );

      if (notification.getDisplayNameTooltip) {
        const tooltip = notification.getDisplayNameTooltip({
          embeddable: api,
          trigger: triggers[PANEL_NOTIFICATION_TRIGGER],
        });

        if (tooltip) {
          notificationComponent = (
            <EuiToolTip position="top" content={tooltip} key={notification.id}>
              {notificationComponent}
            </EuiToolTip>
          );
        }
      }

      return notificationComponent;
    });
  }, [api, euiTheme.size.xs, notifications, showNotifications]);

  const contextMenuClasses = classNames({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    embPanel__optionsMenuPopover: true,
    'embPanel__optionsMenuPopover-notification': showNotification,
  });

  const ContextMenuButton = (
    <EuiToolTip content={getContextMenuAriaLabel(title, index)} disableScreenReaderOutput>
      <EuiButtonIcon
        color="text"
        data-test-subj="embeddablePanelToggleMenuIcon"
        aria-label={getContextMenuAriaLabel(title, index)}
        onClick={() => {
          setIsContextMenuOpen(!isContextMenuOpen);
          if (apiCanLockHoverActions(api)) {
            api.lockHoverActions(!hasLockedHoverActions);
          }
        }}
        iconType="boxesVertical"
      />
    </EuiToolTip>
  );

  const dragHandle = useMemo(
    // memoize the drag handle to avoid calling `setDragHandle` unnecessarily
    () => (
      <button
        className={`embPanel--dragHandle`}
        css={css`
          cursor: move;
          visibility: hidden; // default for every mode **except** edit mode
          width: 0px;

          .embPanel__hoverActionsAnchor--editMode & {
            width: auto;
            visibility: visible; // overwrite visibility in edit mode
          }
        `}
        ref={(ref) => {
          dragHandleRef.current = ref;
          setDragHandle('hoverActions', ref);
        }}
      >
        <EuiIcon
          type="move"
          color="text"
          css={css`
            margin: ${euiTheme.size.xs};
          `}
          data-test-subj="embeddablePanelDragHandle"
          aria-label={i18n.translate('embeddableApi.dragHandle', {
            defaultMessage: 'Move panel',
          })}
        />
      </button>
    ),
    [setDragHandle, euiTheme.size.xs]
  );

  const showContextMenu = useMemo(() => {
    return contextMenuPanels.some(({ items }) => items?.length);
  }, [contextMenuPanels]);

  return (
    <>
      {api && (quickActionElements.length || showContextMenu) && (
        <div
          className={classNames('embPanel__hoverActions', className)}
          data-test-subj={`hover-actions-${api.uuid}`}
        >
          {dragHandle}
          {/* Wrapping all "right actions" in a span so that flex space-between works as expected */}
          <span>
            {showNotifications && notificationElements}
            {showDescription && (
              <EuiIconTip
                size="m"
                title={!hideTitle ? title || undefined : undefined}
                content={description}
                position="top"
                data-test-subj="embeddablePanelDescriptionTooltip"
                type="info"
                iconProps={{
                  css: css`
                    margin: ${euiTheme.size.xs};
                  `,
                }}
              />
            )}
            {quickActionElements.map(
              ({ iconType, 'data-test-subj': dataTestSubj, onClick, name }, i) => (
                <EuiToolTip
                  key={`main_action_${dataTestSubj}_${api?.uuid}`}
                  content={name}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType={iconType}
                    color="text"
                    onClick={onClick as MouseEventHandler}
                    data-test-subj={dataTestSubj}
                    aria-label={name as string}
                  />
                </EuiToolTip>
              )
            )}
            {showContextMenu ? (
              <EuiPopover
                repositionOnScroll
                panelPaddingSize="none"
                anchorPosition="downRight"
                button={ContextMenuButton}
                isOpen={isContextMenuOpen}
                className={contextMenuClasses}
                closePopover={onClose}
                aria-label={getContextMenuAriaLabel(title, index)}
                data-test-subj={
                  isContextMenuOpen
                    ? 'embeddablePanelContextMenuOpen'
                    : 'embeddablePanelContextMenuClosed'
                }
                focusTrapProps={{
                  closeOnMouseup: true,
                  clickOutsideDisables: false,
                  onClickOutside: onClose,
                }}
              >
                <EuiContextMenu
                  data-test-subj="presentationPanelContextMenuItems"
                  initialPanelId={'mainMenu'}
                  panels={contextMenuPanels}
                />
              </EuiPopover>
            ) : null}
          </span>
        </div>
      )}
    </>
  );
};
