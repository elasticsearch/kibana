/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { escapeRegExp, omit, debounce } from 'lodash';
import { i18n } from '@kbn/i18n';
import { htmlIdGenerator, EuiFlexGroup, EuiFlexItem, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { TabsBar, type TabsBarProps, type TabsBarApi } from '../tabs_bar';
import { getTabAttributes } from '../../utils/get_tab_attributes';
import { getTabMenuItemsFn } from '../../utils/get_tab_menu_items';
import {
  addTab,
  closeTab,
  selectTab,
  selectRecentlyClosedTab,
  insertTabAfter,
  replaceTabWith,
  closeOtherTabs,
  closeTabsToTheRight,
} from '../../utils/manage_tabs';
import type {
  TabItem,
  TabsServices,
  TabPreviewData,
  TabsEBTEvent,
  RecentlyClosedTabItem,
  TabMenuItem,
} from '../../types';
import { TabsEventName } from '../../types';
import { getNextTabNumber } from '../../utils/get_next_tab_number';
import { MAX_ITEMS_COUNT, TAB_SWITCH_DEBOUNCE_MS } from '../../constants';
import { TabsEventDataKeys } from '../../event_data_keys';

export interface TabbedContentProps
  extends Pick<
    TabsBarProps,
    | 'unsavedItemIds'
    | 'maxItemsCount'
    | 'onClearRecentlyClosed'
    | 'disableCloseButton'
    | 'disableInlineLabelEditing'
    | 'disableDragAndDrop'
    | 'disableTabsBarMenu'
  > {
  items: TabItem[];
  selectedItemId?: string;
  recentlyClosedItems: RecentlyClosedTabItem[];
  'data-test-subj'?: string;
  services: TabsServices;
  hideTabsBar?: boolean;
  renderContent?: (selectedItem: TabItem) => React.ReactNode;
  /**
   * Optional wrapper for the tabs bar. Receives the tabs bar node
   * and returns a node to render in its place.
   * When omitted, the default tabs bar is rendered as-is.
   */
  wrapTabsBar?: (tabsBar: React.ReactNode) => React.ReactNode;
  createItem: () => TabItem;
  customNewTabButton?: React.ReactElement;
  onChanged: (state: TabbedContentState) => void;
  getPreviewData?: (item: TabItem) => TabPreviewData;
  onEBTEvent: (event: TabsEBTEvent) => void;
  tabContentIdOverride?: string;
  appendRight?: React.ReactNode;
  /** Optional function to provide menu items placed after rename/duplicate */
  getTopTabMenuItems?: (item: TabItem) => TabMenuItem[];
  /** Optional function to provide additional menu items placed at the end of the menu */
  getAdditionalTabMenuItems?: (item: TabItem) => TabMenuItem[];
  /** Optional callback invoked when tabs are dropped due to the max tab limit */
  onTabLimitReached?: (droppedCount: number) => void;
}

export interface TabbedContentState {
  items: TabItem[];
  selectedItem: TabItem | null;
}

const VerticalRule = () => {
  const { euiTheme } = useEuiTheme();

  return (
    <span
      css={css`
        width: ${euiTheme.border.width.thin};
        height: 28px;
        background-color: ${euiTheme.colors.borderBasePlain};
      `}
    />
  );
};

export const TabbedContent: React.FC<TabbedContentProps> = ({
  items: managedItems,
  selectedItemId: managedSelectedItemId,
  recentlyClosedItems,
  unsavedItemIds,
  maxItemsCount = MAX_ITEMS_COUNT,
  services,
  hideTabsBar = false,
  renderContent,
  wrapTabsBar,
  createItem,
  onChanged,
  tabContentIdOverride,
  onClearRecentlyClosed,
  getPreviewData,
  onEBTEvent,
  customNewTabButton,
  disableCloseButton = false,
  disableInlineLabelEditing = false,
  disableDragAndDrop = false,
  disableTabsBarMenu = false,
  appendRight,
  getTopTabMenuItems,
  getAdditionalTabMenuItems,
  onTabLimitReached,
}) => {
  const { euiTheme } = useEuiTheme();
  const tabsBarApi = useRef<TabsBarApi | null>(null);
  const [generatedId] = useState(() => tabContentIdOverride ?? htmlIdGenerator()());
  const tabContentId = tabContentIdOverride ?? generatedId;
  const state = useMemo(
    () => prepareStateFromProps(managedItems, managedSelectedItemId),
    [managedItems, managedSelectedItemId]
  );
  const { items, selectedItem } = state;
  const stateRef = React.useRef<TabbedContentState>();
  stateRef.current = state;

  const changeState = useCallback(
    (getNextState: (prevState: TabbedContentState) => TabbedContentState) => {
      if (!stateRef.current) {
        return;
      }

      const nextState = getNextState(stateRef.current);
      onChanged(nextState);
    },
    [onChanged]
  );

  const onLabelEdited = useCallback(
    async (item: TabItem, newLabel: string) => {
      const editedItem = { ...item, label: newLabel };
      tabsBarApi.current?.moveFocusToNextSelectedItem(editedItem);
      changeState((prevState) => {
        const nextState = replaceTabWith(prevState, item, editedItem);

        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabRenamed,
          [TabsEventDataKeys.TAB_ID]: item.id,
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
        });

        return nextState;
      });
    },
    [changeState, onEBTEvent]
  );

  // Debounced tabSwitched EBT event sender
  const debouncedTabSwitched = useMemo(
    () => debounce((event: TabsEBTEvent) => onEBTEvent(event), TAB_SWITCH_DEBOUNCE_MS),
    [onEBTEvent]
  );

  const onSelect = useCallback(
    async (item: TabItem) => {
      tabsBarApi.current?.moveFocusToNextSelectedItem(item);
      changeState((prevState) => {
        const prevItems = prevState.items;
        const nextState = selectTab(prevState, item);

        const eventPayload = {
          [TabsEventDataKeys.TAB_ID]: item.id,
          [TabsEventDataKeys.FROM_INDEX]: prevItems.findIndex(
            (singleItem) => singleItem.id === prevState.selectedItem?.id
          ),
          [TabsEventDataKeys.TO_INDEX]: nextState.items.findIndex(
            (singleItem) => singleItem.id === item.id
          ),
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevItems.length,
        };

        debouncedTabSwitched({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabSwitched,
          ...eventPayload,
        });

        return nextState;
      });
    },
    [changeState, debouncedTabSwitched]
  );

  const onSelectRecentlyClosed = useCallback(
    async (item: RecentlyClosedTabItem) => {
      changeState((prevState) => {
        if (maxItemsCount && prevState.items.length >= maxItemsCount) {
          return prevState;
        }

        const newItem = createItem();
        const restoredItem = {
          ...omit(item, 'closedAt'),
          id: newItem.id,
          restoredFromId: item.id,
        };

        tabsBarApi.current?.moveFocusToNextSelectedItem(restoredItem);

        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabSelectRecentlyClosed,
          [TabsEventDataKeys.TAB_ID]: item.id,
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
        });

        return selectRecentlyClosedTab(prevState, restoredItem);
      });
    },
    [changeState, createItem, maxItemsCount, onEBTEvent]
  );

  const onRestoreRecentlyClosedGroup = useCallback(
    async (itemsToRestore: RecentlyClosedTabItem[]) => {
      if (itemsToRestore.length === 0) {
        return;
      }

      changeState((prevState) => {
        const remainingCapacity = maxItemsCount
          ? Math.max(0, maxItemsCount - prevState.items.length)
          : itemsToRestore.length;

        const droppedCount =
          itemsToRestore.length - Math.min(itemsToRestore.length, remainingCapacity);

        const restoredItems = itemsToRestore.slice(0, remainingCapacity).map((item) => {
          const newItem = createItem();
          return { ...omit(item, 'closedAt'), id: newItem.id, restoredFromId: item.id };
        });

        if (restoredItems.length === 0) {
          return prevState;
        }

        if (droppedCount > 0) {
          onTabLimitReached?.(droppedCount);
        }

        const nextSelectedItem = restoredItems.at(0) ?? prevState.selectedItem;
        if (nextSelectedItem) {
          tabsBarApi.current?.moveFocusToNextSelectedItem(nextSelectedItem);
        }

        restoredItems.forEach((restoredItem) => {
          onEBTEvent({
            [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabSelectRecentlyClosed,
            [TabsEventDataKeys.TAB_ID]: restoredItem.restoredFromId ?? restoredItem.id,
            [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
          });
        });

        return {
          items: [...prevState.items, ...restoredItems],
          selectedItem: nextSelectedItem,
        };
      });
    },
    [changeState, createItem, maxItemsCount, onEBTEvent, onTabLimitReached]
  );

  const onClose = useCallback(
    async (item: TabItem) => {
      changeState((prevState) => {
        const nextState = closeTab(prevState, item);
        if (nextState.selectedItem) {
          tabsBarApi.current?.moveFocusToNextSelectedItem(nextState.selectedItem);
        }

        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabClosed,
          [TabsEventDataKeys.TAB_ID]: item.id,
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
          [TabsEventDataKeys.REMAINING_TABS_COUNT]: nextState.items.length,
        });

        return nextState;
      });
    },
    [changeState, onEBTEvent]
  );

  const onReorder = useCallback(
    (reorderedItems: TabItem[], movedTabId: string) => {
      changeState((prevState) => {
        const prevItems = prevState.items;
        const nextState = { ...prevState, items: reorderedItems };

        if (!movedTabId) {
          return nextState;
        }

        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabReordered,
          [TabsEventDataKeys.TAB_ID]: movedTabId,
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
          [TabsEventDataKeys.FROM_INDEX]: prevItems.findIndex((item) => item.id === movedTabId),
          [TabsEventDataKeys.TO_INDEX]: reorderedItems.findIndex((item) => item.id === movedTabId),
        });

        return nextState;
      });
    },
    [changeState, onEBTEvent]
  );

  const onAdd = useCallback(async () => {
    const newItem = createItem();
    tabsBarApi.current?.moveFocusToNextSelectedItem(newItem);
    changeState((prevState) => {
      const nextState = addTab(prevState, newItem, maxItemsCount);

      onEBTEvent({
        [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabCreated,
        [TabsEventDataKeys.TAB_ID]: newItem.id,
        [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
      });

      return nextState;
    });
  }, [changeState, createItem, maxItemsCount, onEBTEvent]);

  const onDuplicate = useCallback(
    (item: TabItem) => {
      const newItem = createItem();
      newItem.duplicatedFromId = item.id;

      const copyLabel = i18n.translate('unifiedTabs.copyLabel', { defaultMessage: 'copy' });

      // Remove existing (copy) or (copy N) suffix to get base label
      const copyPattern = `\\s*\\(${escapeRegExp(copyLabel)}\\)(?:\\s+\\d+)?$`;
      const baseLabel = item.label.replace(new RegExp(copyPattern), '');

      // Create the copy base pattern: "Original Label (copy)"
      const copyBaseLabel = `${baseLabel} (${copyLabel})`;

      const nextNumber = getNextTabNumber(state.items, copyBaseLabel);
      newItem.label = nextNumber ? `${copyBaseLabel} ${nextNumber}` : copyBaseLabel;

      tabsBarApi.current?.moveFocusToNextSelectedItem(newItem);

      changeState((prevState) => {
        const nextState = insertTabAfter(prevState, newItem, item, maxItemsCount);

        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabDuplicated,
          [TabsEventDataKeys.TAB_ID]: item.id,
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
        });

        return nextState;
      });
    },
    [changeState, createItem, maxItemsCount, state.items, onEBTEvent]
  );

  const onCloseOtherTabs = useCallback(
    (item: TabItem) => {
      changeState((prevState) => {
        const nextState = closeOtherTabs(prevState, item);

        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabClosedOthers,
          [TabsEventDataKeys.TAB_ID]: item.id,
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
          [TabsEventDataKeys.CLOSED_TABS_COUNT]: prevState.items.length - nextState.items.length,
        });

        return nextState;
      });
    },
    [changeState, onEBTEvent]
  );

  const onCloseTabsToTheRight = useCallback(
    (item: TabItem) => {
      changeState((prevState) => {
        const nextState = closeTabsToTheRight(prevState, item);

        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabClosedToTheRight,
          [TabsEventDataKeys.TAB_ID]: item.id,
          [TabsEventDataKeys.TOTAL_TABS_OPEN]: prevState.items.length,
          [TabsEventDataKeys.CLOSED_TABS_COUNT]: prevState.items.length - nextState.items.length,
          [TabsEventDataKeys.REMAINING_TABS_COUNT]: nextState.items.length,
        });

        return nextState;
      });
    },
    [changeState, onEBTEvent]
  );

  const getTabMenuItems = useMemo(() => {
    return getTabMenuItemsFn({
      tabsState: state,
      maxItemsCount,
      onDuplicate,
      onCloseOtherTabs,
      onCloseTabsToTheRight,
      getTopTabMenuItems,
      getAdditionalTabMenuItems,
    });
  }, [
    state,
    maxItemsCount,
    onDuplicate,
    onCloseOtherTabs,
    onCloseTabsToTheRight,
    getTopTabMenuItems,
    getAdditionalTabMenuItems,
  ]);

  const tabsBarContainerCss = css`
    width: 100%;
    min-width: 0;
    background-color: ${euiTheme.colors.backgroundBasePlain};
  `;

  const tabsBarComponentCss = css`
    min-width: 0; /* Fixes an issue causing TabsBar to push appendRight to overflow as number of tabs grows */
  `;

  const appendRightContainerCss = css`
    margin-right: ${euiTheme.size.s};
  `;

  const tabsBar = (
    <EuiFlexGroup
      gutterSize="xs"
      alignItems="center"
      wrap={false}
      responsive={false}
      css={tabsBarContainerCss}
    >
      <EuiFlexItem grow={true} css={tabsBarComponentCss}>
        <TabsBar
          ref={tabsBarApi}
          items={items}
          selectedItem={selectedItem}
          recentlyClosedItems={recentlyClosedItems}
          unsavedItemIds={unsavedItemIds}
          maxItemsCount={maxItemsCount}
          tabContentId={tabContentId}
          getTabMenuItems={getTabMenuItems}
          services={services}
          onAdd={onAdd}
          onLabelEdited={onLabelEdited}
          onSelect={onSelect}
          onSelectRecentlyClosed={onSelectRecentlyClosed}
          onRestoreRecentlyClosedGroup={onRestoreRecentlyClosedGroup}
          onClearRecentlyClosed={onClearRecentlyClosed}
          onReorder={onReorder}
          onClose={onClose}
          getPreviewData={getPreviewData}
          onEBTEvent={onEBTEvent}
          customNewTabButton={customNewTabButton}
          disableCloseButton={disableCloseButton}
          disableInlineLabelEditing={disableInlineLabelEditing}
          disableDragAndDrop={disableDragAndDrop}
          disableTabsBarMenu={disableTabsBarMenu}
        />
      </EuiFlexItem>
      {appendRight ? (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup
            gutterSize="xs"
            alignItems="center"
            justifyContent="flexEnd"
            wrap={false}
            responsive={false}
          >
            <EuiFlexItem grow={false}>
              <VerticalRule />
            </EuiFlexItem>
            <EuiFlexItem grow={false} css={appendRightContainerCss}>
              {appendRight}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );

  const tabsBarNode = hideTabsBar ? null : tabsBar;
  const renderedTabsBar = wrapTabsBar ? wrapTabsBar(tabsBarNode) : tabsBarNode;

  // The separating line between tabs and content
  const tabsBarSeparatorCss = css`
    border-bottom: ${euiTheme.border.thin};
  `;

  if (!renderContent) {
    return <div css={tabsBarSeparatorCss}>{renderedTabsBar}</div>;
  }

  return (
    <EuiFlexGroup
      responsive={false}
      direction="column"
      gutterSize="none"
      className="eui-fullHeight"
    >
      {renderedTabsBar && (
        <EuiFlexItem grow={false} css={tabsBarSeparatorCss}>
          {renderedTabsBar}
        </EuiFlexItem>
      )}
      {selectedItem ? (
        <EuiFlexItem
          data-test-subj="unifiedTabs_selectedTabContent"
          role="tabpanel"
          id={tabContentId}
          aria-labelledby={getTabAttributes(selectedItem, tabContentId).id}
        >
          {renderContent(selectedItem)}
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );
};

function prepareStateFromProps(items: TabItem[], selectedItemId?: string): TabbedContentState {
  const selectedItem = selectedItemId && items.find((item) => item.id === selectedItemId);
  return {
    items,
    selectedItem: selectedItem || items[0],
  };
}
