/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { DataView } from '@kbn/data-views-plugin/public';
import { getInitialESQLQuery } from '@kbn/esql-utils';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import type { DiscoverAppMenuItemType } from '@kbn/discover-utils';
import {
  AppMenuActionId,
  AppMenuRegistry,
  dismissFlyouts,
  DiscoverFlyouts,
} from '@kbn/discover-utils';
import { ESQL_TYPE } from '@kbn/data-view-utils';
import { DISCOVER_APP_ID } from '@kbn/deeplinks-analytics';
import type { RuleTypeWithDescription } from '@kbn/alerts-ui-shared';
import { useGetRuleTypesPermissions } from '@kbn/alerts-ui-shared';
import useObservable from 'react-use/lib/useObservable';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import { useI18n } from '@kbn/i18n-react';
import { shouldShowAlertingV2CreateRuleFlyout } from '@kbn/alerting-v2-utils';
import type { DiscoverAppLocatorParams } from '../../../../../common';
import { createDataViewDataSource } from '../../../../../common/data_sources';
import type { DiscoverServices } from '../../../../build_services';
import type { AppMenuDiscoverParams } from './app_menu_actions';
import {
  getAlertsAppMenuItem,
  getCreateRuleOptionsAppMenuItem,
  getNewSearchAppMenuItem,
  getOpenSearchAppMenuItem,
  getShareAppMenuItem,
  getInspectAppMenuItem,
  getBackgroundSearchFlyout,
  enhanceAppMenuItemWithRunAction,
} from './app_menu_actions';
import { useProfileAccessor } from '../../../../context_awareness';
import {
  internalStateActions,
  selectTabSavedSearchByValueAttributes,
  useCurrentDataView,
  useCurrentTabSelector,
  useCurrentTabDataStateContainer,
  useInternalStateDispatch,
  useInternalStateGetState,
  useInternalStateSubscribe,
  useRuntimeStateManager,
} from '../../state_management/redux';
import type { DiscoverAppState } from '../../state_management/redux';
import { useCurrentTabMenuActions } from '../../hooks/use_current_tab_menu_actions';
import { useDataState } from '../../hooks/use_data_state';
import { TransferAction } from '../../../../plugin_imports/embeddable_editor_service';

const TAB_SCOPED_APP_MENU_ITEM_IDS = new Set<string>([
  AppMenuActionId.alerts,
  AppMenuActionId.export,
  AppMenuActionId.inspect,
]);

export interface UseTopNavLinksParams {
  dataView: DataView | undefined;
  services: DiscoverServices;
  hasUnsavedChanges: boolean;
  isEsqlMode: boolean;
  adHocDataViews: DataView[];
  hasShareIntegration: boolean;
  persistedDiscoverSession: DiscoverSession | undefined;
  onOpenSaveModal: () => void;
  onOpenSaveAsModal: () => void;
}

/**
 * Helper function to build the top nav links
 */
export const useTopNavLinks = ({
  dataView,
  services,
  hasUnsavedChanges,
  isEsqlMode,
  adHocDataViews,
  hasShareIntegration,
  persistedDiscoverSession,
  onOpenSaveModal,
  onOpenSaveAsModal,
}: UseTopNavLinksParams): AppMenuConfig => {
  const intl = useI18n();
  const dispatch = useInternalStateDispatch();
  const getState = useInternalStateGetState();
  const subscribe = useInternalStateSubscribe();
  const runtimeStateManager = useRuntimeStateManager();
  const currentDataView = useCurrentDataView();
  const appId = useObservable(services.application.currentAppId$);
  const currentTab = useCurrentTabSelector((tabState) => tabState);
  const { authorizedRuleTypes }: { authorizedRuleTypes: RuleTypeWithDescription[] } =
    useGetRuleTypesPermissions({
      http: services.http,
      toasts: services.notifications.toasts,
    });
  const dataStateContainer = useCurrentTabDataStateContainer();
  const totalHits$ = dataStateContainer.data$.totalHits$;
  const totalHitsState = useDataState(totalHits$);
  const { canSwitchLanguageMode, isDataViewMode, openInspector, switchLanguageMode } =
    useCurrentTabMenuActions({ currentDataView });

  const getAuthorizedWriteConsumerIds = (ruleTypes: RuleTypeWithDescription[]): string[] =>
    ruleTypes
      .filter((ruleType) =>
        Object.values(ruleType.authorizedConsumers).some((consumer) => consumer.all)
      )
      .map((ruleType) => ruleType.id);

  const transferBackToEditor = useCallback(async () => {
    const byValueState = await selectTabSavedSearchByValueAttributes({
      tabId: currentTab.id,
      getState,
      runtimeStateManager,
      services,
    });

    services.embeddableEditor.transferBackToEditor(TransferAction.SaveByValue, {
      state: {
        byValueState,
        controlGroupState: currentTab.attributes.controlGroupState,
      },
    });
  }, [
    currentTab.id,
    currentTab.attributes.controlGroupState,
    getState,
    runtimeStateManager,
    services,
  ]);

  const discoverParams: AppMenuDiscoverParams = useMemo(
    () => ({
      isEsqlMode,
      dataView,
      adHocDataViews,
      authorizedRuleTypeIds: getAuthorizedWriteConsumerIds(authorizedRuleTypes),
    }),
    [isEsqlMode, dataView, adHocDataViews, authorizedRuleTypes]
  );

  const showCreateRuleV2 = isEsqlMode && shouldShowAlertingV2CreateRuleFlyout(services.core);

  const appMenuItems: DiscoverAppMenuItemType[] = useMemo(() => {
    const items: DiscoverAppMenuItemType[] = [];

    const hasV1AlertsAccess = discoverParams.authorizedRuleTypeIds.length > 0;
    const shouldShowAlertsMenu = hasV1AlertsAccess || showCreateRuleV2;

    if (services.triggersActionsUi && shouldShowAlertsMenu) {
      const alertsAppMenuItem = getAlertsAppMenuItem({
        discoverParams,
        services,
        tabId: currentTab.id,
        getState,
        dispatch,
      });
      items.push(alertsAppMenuItem);
    }

    if (
      !!appId &&
      services.data.search.isBackgroundSearchEnabled &&
      services.capabilities.discover_v2.storeSearchSession
    ) {
      const backgroundSearchFlyoutMenuItem = getBackgroundSearchFlyout({
        onClick: ({ context: { onFinishAction } }) => {
          services.data.search.showSearchSessionsFlyout({
            appId,
            trackingProps: { openedFrom: 'background search button' },
            onBackgroundSearchOpened: ({ session, event }) => {
              event?.preventDefault();
              void dispatch(
                internalStateActions.openSearchSessionInNewTab({ searchSession: session })
              );
            },
            onClose: onFinishAction,
          });
        },
      });
      items.push(backgroundSearchFlyoutMenuItem);
    }

    if (!services.embeddableEditor.isEmbeddedEditor()) {
      const defaultEsqlState: Pick<DiscoverAppState, 'query'> | undefined =
        isEsqlMode && currentDataView.type === ESQL_TYPE
          ? { query: { esql: getInitialESQLQuery(currentDataView) } }
          : undefined;
      const locatorParams: DiscoverAppLocatorParams = defaultEsqlState
        ? defaultEsqlState
        : currentDataView.isPersisted()
        ? { dataViewId: currentDataView.id }
        : { dataViewSpec: currentDataView.toMinimalSpec() };
      const newSearchMenuItem = getNewSearchAppMenuItem({
        newSearchUrl: services.locator.getRedirectUrl(locatorParams),
        onNewSearch: () => {
          const defaultState: DiscoverAppState = defaultEsqlState ?? {
            dataSource: currentDataView.id
              ? createDataViewDataSource({ dataViewId: currentDataView.id })
              : undefined,
          };
          services.application.navigateToApp(DISCOVER_APP_ID, { state: { defaultState } });
        },
      });
      items.push(newSearchMenuItem);
    }

    if (!services.embeddableEditor.isEmbeddedEditor()) {
      const openSearchMenuItem = getOpenSearchAppMenuItem({
        onOpenSavedSearch: (discoverSessionId) =>
          dispatch(internalStateActions.openDiscoverSession({ discoverSessionId })),
      });
      items.push(openSearchMenuItem);
    }

    const shareAppMenuItem = getShareAppMenuItem({
      discoverParams,
      services,
      hasIntegrations: hasShareIntegration,
      hasUnsavedChanges,
      currentTab,
      persistedDiscoverSession,
      totalHitsState,
      intl,
    });
    items.push(...shareAppMenuItem);

    if (canSwitchLanguageMode) {
      items.push({
        id: AppMenuActionId.switchLanguageMode,
        order: 2,
        label: isDataViewMode
          ? i18n.translate('discover.localMenu.switchToESQLTitle', {
              defaultMessage: 'Query in ES|QL',
            })
          : i18n.translate('discover.localMenu.switchToClassicTitle', {
              defaultMessage: 'Switch to Classic',
            }),
        tooltipContent: isDataViewMode
          ? i18n.translate('discover.localMenu.switchToESQLTooltip', {
              defaultMessage:
                'Search, transform, join and aggregate your data with ES|QL or PromQL',
            })
          : i18n.translate('discover.localMenu.switchToClassicTooltip', {
              defaultMessage: 'Search your data with data views and KQL in Classic Discover',
            }),
        iconType: isDataViewMode ? 'code' : 'discoverApp',
        testId: isDataViewMode ? 'select-text-based-language-btn' : 'select-classic-mode-btn',
        run: switchLanguageMode,
      });
    }

    items.push(getInspectAppMenuItem({ onOpenInspector: openInspector }));

    const firstTabScopedMenuItem = items
      .filter(({ id }) => TAB_SCOPED_APP_MENU_ITEM_IDS.has(id))
      .sort((left, right) => left.order - right.order)[0];

    if (firstTabScopedMenuItem) {
      const firstItemIndex = items.findIndex(({ id }) => id === firstTabScopedMenuItem.id);

      if (firstItemIndex >= 0) {
        items[firstItemIndex] = {
          ...items[firstItemIndex],
          separator: 'above',
        };
      }
    }

    return items;
  }, [
    canSwitchLanguageMode,
    services,
    discoverParams,
    appId,
    dispatch,
    getState,
    isEsqlMode,
    currentDataView,
    currentTab,
    isDataViewMode,
    openInspector,
    persistedDiscoverSession,
    hasShareIntegration,
    hasUnsavedChanges,
    totalHitsState,
    intl,
    showCreateRuleV2,
    switchLanguageMode,
  ]);

  const getAppMenuAccessor = useProfileAccessor('getAppMenu');

  const appMenuRegistry = useMemo(() => {
    const newAppMenuRegistry = new AppMenuRegistry();

    newAppMenuRegistry.registerItems(appMenuItems);

    if (services.capabilities.discover_v2.save) {
      const isEmbeddedEditor = services.embeddableEditor.isEmbeddedEditor();

      const savedAsButton = {
        run: async () => {
          onOpenSaveAsModal();
        },
        id: 'saveAs',
        order: 1,
        label: i18n.translate('discover.localMenu.saveAsTitle', {
          defaultMessage: 'Save as',
        }),
        iconType: 'save',
        testId: 'interactiveSaveMenuItem',
      };

      newAppMenuRegistry.setPrimaryActionItem({
        id: 'save',
        label: isEmbeddedEditor
          ? i18n.translate('discover.localMenu.saveAndReturnTitle', {
              defaultMessage: 'Save and return',
            })
          : i18n.translate('discover.localMenu.saveTitle', {
              defaultMessage: 'Save',
            }),
        testId: 'discoverSaveButton',
        iconType: isEmbeddedEditor ? 'checkCircleFill' : 'save',
        run: async () => {
          if (isEmbeddedEditor && services.embeddableEditor.isByValueEditor()) {
            await transferBackToEditor();
          } else {
            onOpenSaveModal();
          }
        },
        popoverWidth: 170,
        popoverTestId: 'discoverSaveButtonPopover',
        splitButtonProps: {
          secondaryButtonAriaLabel: i18n.translate('discover.localMenu.saveOptionsAriaLabel', {
            defaultMessage: 'Save options',
          }),
          // Show different split button options when in embedded editor mode
          ...(isEmbeddedEditor
            ? {
                items: [
                  savedAsButton,
                  {
                    run: () =>
                      services.embeddableEditor.transferBackToEditor(TransferAction.Cancel),
                    id: 'cancel',
                    order: 100,
                    label: i18n.translate('discover.localMenu.cancelTitle', {
                      defaultMessage: 'Cancel',
                    }),
                    iconType: 'undo',
                    testId: 'discoverCancelButton',
                  },
                ],
              }
            : {
                showNotificationIndicator: hasUnsavedChanges,
                notificationIndicatorTooltipContent: hasUnsavedChanges
                  ? i18n.translate('discover.localMenu.unsavedChangesTooltip', {
                      defaultMessage: 'You have unsaved changes',
                    })
                  : undefined,
                items: [
                  {
                    ...savedAsButton,
                    disableButton: !persistedDiscoverSession,
                  },
                  {
                    run: async () => {
                      dismissFlyouts([DiscoverFlyouts.lensEdit]);

                      const internalState = getState();

                      if (internalState.persistedDiscoverSession) {
                        await dispatch(internalStateActions.resetDiscoverSession()).unwrap();
                      }
                    },
                    id: 'resetChanges',
                    order: 2,
                    label: i18n.translate('discover.localMenu.resetChangesTitle', {
                      defaultMessage: 'Reset changes',
                    }),
                    iconType: 'undo',
                    testId: 'revertUnsavedChangesButton',
                    disableButton: !hasUnsavedChanges,
                  },
                ],
              }),
        },
      });
    }

    // Allow profile accessors to add additional items/popover items
    const getAppMenu = getAppMenuAccessor(() => ({
      appMenuRegistry: () => newAppMenuRegistry,
    }));

    const registry = getAppMenu(discoverParams).appMenuRegistry(newAppMenuRegistry);

    const CreateRuleOptionsFlyout = services.alertingVTwo?.CreateRuleOptionsFlyout;

    if (showCreateRuleV2 && CreateRuleOptionsFlyout) {
      registry.registerItem(
        getCreateRuleOptionsAppMenuItem({
          CreateRuleOptionsFlyout,
          baseItem: registry.getItem(AppMenuActionId.alerts),
          alertsPopoverItems: registry.getPopoverItems(AppMenuActionId.alerts),
          services,
          tabId: currentTab.id,
          getState,
          subscribe,
        })
      );
    }

    return registry;
  }, [
    getAppMenuAccessor,
    discoverParams,
    appMenuItems,
    services,
    currentTab.id,
    dispatch,
    getState,
    subscribe,
    showCreateRuleV2,
    hasUnsavedChanges,
    transferBackToEditor,
    persistedDiscoverSession,
    onOpenSaveModal,
    onOpenSaveAsModal,
  ]);

  return useMemo((): AppMenuConfig => {
    const config = appMenuRegistry.getAppMenuConfig();

    return {
      items: config.items?.map((item) =>
        enhanceAppMenuItemWithRunAction({
          appMenuItem: item,
          services,
        })
      ),
      primaryActionItem: config.primaryActionItem
        ? enhanceAppMenuItemWithRunAction({
            appMenuItem: config.primaryActionItem,
            services,
          })
        : undefined,
    };
  }, [appMenuRegistry, services]);
};
