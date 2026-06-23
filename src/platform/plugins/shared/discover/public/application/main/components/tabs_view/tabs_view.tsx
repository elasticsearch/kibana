/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo } from 'react';
import { EuiResizeObserver } from '@elastic/eui';
import { UnifiedTabs, type UnifiedTabsProps } from '@kbn/unified-tabs';
import { i18n } from '@kbn/i18n';
import { AppMenuComponent } from '@kbn/core-chrome-app-menu-components';
import { MAX_DISCOVER_SESSION_TABS } from '@kbn/saved-search-plugin/common';
import { ChromeAppHeader, useIsChromeNextProjectHeader } from '../chrome_app_header';
import { SingleTabView, type SingleTabViewProps } from '../single_tab_view';
import {
  createTabItem,
  internalStateActions,
  selectAllTabs,
  selectRecentlyClosedTabs,
  selectIsTabsBarHidden,
  useInternalStateDispatch,
  useInternalStateSelector,
  useCurrentTabRuntimeState,
} from '../../state_management/redux';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { usePreviewData } from './use_preview_data';
import { useAppMenuData } from './use_app_menu_data';

export const TabsView = (props: SingleTabViewProps) => {
  const services = useDiscoverServices();
  const dispatch = useInternalStateDispatch();
  const items = useInternalStateSelector(selectAllTabs);
  const recentlyClosedItems = useInternalStateSelector(selectRecentlyClosedTabs);
  const currentTabId = useInternalStateSelector((state) => state.tabs.unsafeCurrentId);
  const { getPreviewData } = usePreviewData(props.runtimeStateManager);
  const hideTabsBar = useInternalStateSelector(selectIsTabsBarHidden);
  const unsavedTabIds = useInternalStateSelector((state) => state.tabs.unsavedIds);
  const currentDataView = useCurrentTabRuntimeState((tab) => tab.currentDataView$);
  const scopedEbtManager = useCurrentTabRuntimeState((tab) => tab.scopedEbtManager$);
  const isChromeNextProjectHeader = useIsChromeNextProjectHeader();

  const {
    shouldCollapseAppMenu,
    onResize,
    getTopTabMenuItems,
    getAdditionalTabMenuItems,
    topNavMenuItems,
  } = useAppMenuData({ currentDataView });

  const onEvent: UnifiedTabsProps['onEBTEvent'] = useCallback(
    (event) => {
      void scopedEbtManager.trackTabsEvent(event);
    },
    [scopedEbtManager]
  );

  const onChanged: UnifiedTabsProps['onChanged'] = useCallback(
    (updateState) => dispatch(internalStateActions.updateTabs(updateState)),
    [dispatch]
  );

  const onClearRecentlyClosed: UnifiedTabsProps['onClearRecentlyClosed'] = useCallback(
    () => dispatch(internalStateActions.clearRecentlyClosedTabs()),
    [dispatch]
  );

  const createItem: UnifiedTabsProps['createItem'] = useCallback(
    () => createTabItem(items),
    [items]
  );

  const renderContent: UnifiedTabsProps['renderContent'] = useCallback(
    () => <SingleTabView key={currentTabId} {...props} />,
    [currentTabId, props]
  );

  const wrapTabsBar = useMemo((): UnifiedTabsProps['wrapTabsBar'] => {
    if (isChromeNextProjectHeader) {
      return (tabsBar) => (
        <ChromeAppHeader
          menu={topNavMenuItems}
          hasTabs={Boolean(tabsBar)}
          titleAppend={tabsBar}
          isCollapsed={shouldCollapseAppMenu}
        />
      );
    }
  }, [isChromeNextProjectHeader, topNavMenuItems, shouldCollapseAppMenu]);

  const appendRight = useMemo(() => {
    if (!isChromeNextProjectHeader) {
      return <AppMenuComponent config={topNavMenuItems} isCollapsed={shouldCollapseAppMenu} />;
    }
    return undefined;
  }, [isChromeNextProjectHeader, topNavMenuItems, shouldCollapseAppMenu]);

  const onTabLimitReached: UnifiedTabsProps['onTabLimitReached'] = useCallback(
    (droppedCount: number) => {
      services.toastNotifications.addWarning({
        title: i18n.translate('discover.tabs.tabLimitReachedWarningTitle', {
          defaultMessage: 'Tab limit reached',
        }),
        text: i18n.translate('discover.tabs.tabLimitReachedWarningText', {
          defaultMessage:
            'The last {droppedCount, plural, one {# tab} other {# tabs}} in the group {droppedCount, plural, one {was} other {were}} not restored because the maximum number of {maxTabs} tabs has been reached.',
          values: { droppedCount, maxTabs: MAX_DISCOVER_SESSION_TABS },
        }),
      });
    },
    [services.toastNotifications]
  );

  return (
    /**
     * AppMenuComponent handles responsiveness on its own, however, there are some edge cases e.g opening push flyout
     * where this might not be good enough.
     */
    <EuiResizeObserver onResize={onResize}>
      {(resizeRef) => (
        <div ref={resizeRef} className="eui-fullHeight">
          <UnifiedTabs
            services={services}
            items={items}
            selectedItemId={currentTabId}
            recentlyClosedItems={recentlyClosedItems}
            unsavedItemIds={unsavedTabIds}
            maxItemsCount={MAX_DISCOVER_SESSION_TABS}
            hideTabsBar={hideTabsBar}
            createItem={createItem}
            getPreviewData={getPreviewData}
            renderContent={renderContent}
            onChanged={onChanged}
            onEBTEvent={onEvent}
            onClearRecentlyClosed={onClearRecentlyClosed}
            onTabLimitReached={onTabLimitReached}
            getTopTabMenuItems={getTopTabMenuItems}
            getAdditionalTabMenuItems={getAdditionalTabMenuItems}
            wrapTabsBar={wrapTabsBar}
            appendRight={appendRight}
          />
        </div>
      )}
    </EuiResizeObserver>
  );
};
