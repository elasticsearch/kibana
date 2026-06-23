/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KeyboardEvent } from 'react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import useLatest from 'react-use/lib/useLatest';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import type { DropResult } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  euiDragDropReorder,
  useEuiTheme,
  keys,
} from '@elastic/eui';
import { Tab, type TabProps } from '../tab';
import type { TabItem, TabsServices, TabsEBTEvent, RecentlyClosedTabItem } from '../../types';
import { TabsEventName } from '../../types';
import { getTabIdAttribute } from '../../utils/get_tab_attributes';
import { useResponsiveTabs } from '../../hooks/use_responsive_tabs';
import { TabsBarWithBackground } from '../tabs_visual_glue_to_app_container/tabs_bar_with_background';
import { TabsBarMenu, type TabsBarMenuProps } from '../tabs_bar_menu';
import { TabsEventDataKeys } from '../../event_data_keys';
import { OptionalDraggable } from './optional_draggable';
import { OptionalDroppable } from './optional_droppable';

const growingFlexItemCss = css`
  min-width: 0;
`;

enum shortcutActions {
  MOVE_LEFT = 'moveLeft',
  MOVE_RIGHT = 'moveRight',
  MOVE_HOME = 'moveHome',
  MOVE_END = 'moveEnd',
  CLOSE_TAB = 'closeTab',
}

export type TabsBarProps = Pick<
  TabProps,
  | 'getTabMenuItems'
  | 'getPreviewData'
  | 'onLabelEdited'
  | 'onSelect'
  | 'onClose'
  | 'tabContentId'
  | 'disableCloseButton'
  | 'disableInlineLabelEditing'
  | 'disableDragAndDrop'
> & {
  items: TabItem[];
  selectedItem: TabItem | null;
  recentlyClosedItems: RecentlyClosedTabItem[];
  unsavedItemIds?: string[];
  maxItemsCount?: number;
  services: TabsServices;
  onAdd: () => Promise<void>;
  onSelectRecentlyClosed: TabsBarMenuProps['onSelectRecentlyClosed'];
  onRestoreRecentlyClosedGroup: TabsBarMenuProps['onRestoreRecentlyClosedGroup'];
  onReorder: (items: TabItem[], movedTabId: string) => void;
  onEBTEvent: (event: TabsEBTEvent) => void;
  onClearRecentlyClosed: TabsBarMenuProps['onClearRecentlyClosed'];
  customNewTabButton?: React.ReactElement;
  disableTabsBarMenu?: boolean;
};

export interface TabsBarApi {
  moveFocusToNextSelectedItem: (item: TabItem) => void;
}

export const TabsBar = forwardRef<TabsBarApi, TabsBarProps>(
  (
    {
      items,
      selectedItem,
      recentlyClosedItems,
      unsavedItemIds,
      maxItemsCount,
      tabContentId,
      getTabMenuItems,
      services,
      onAdd,
      onLabelEdited,
      onSelect,
      onSelectRecentlyClosed,
      onRestoreRecentlyClosedGroup,
      onClearRecentlyClosed,
      onReorder,
      onClose,
      getPreviewData,
      onEBTEvent,
      customNewTabButton,
      disableCloseButton = false,
      disableInlineLabelEditing = false,
      disableDragAndDrop = false,
      disableTabsBarMenu = false,
    },
    componentRef
  ) => {
    const { euiTheme } = useEuiTheme();
    const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
    const [tabsContainerWithPlusElement, setTabsContainerWithPlusElement] =
      useState<HTMLDivElement | null>(null);
    const [tabsContainerElement, setTabsContainerElement] = useState<HTMLDivElement | null>(null);
    const tabsContainerRef = useRef<HTMLDivElement | null>(null);
    tabsContainerRef.current = tabsContainerElement;
    const hasReachedMaxItemsCount = maxItemsCount ? items.length >= maxItemsCount : false;
    const moveFocusToItemIdRef = useRef<string | null>(null);

    const emitOnKeyUsedEvent = useCallback(
      (shortcut: string) => {
        onEBTEvent({
          [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabsKeyboardShortcutsUsed,
          [TabsEventDataKeys.SHORTCUT_USED]: shortcut,
        });
      },
      [onEBTEvent]
    );

    const handleHoverChange = useCallback((itemId: string, isHovered: boolean) => {
      setHoveredTabId(isHovered ? itemId : null);
    }, []);

    const moveFocusToNextSelectedItem = useCallback((item: TabItem) => {
      moveFocusToItemIdRef.current = item.id;
    }, []);

    useImperativeHandle(
      componentRef,
      () => ({
        moveFocusToNextSelectedItem,
      }),
      [moveFocusToNextSelectedItem]
    );

    const addButtonLabel = i18n.translate('unifiedTabs.createTabButton', {
      defaultMessage: 'New tab',
    });

    const { tabsSizeConfig, scrollRightButton, scrollLeftButton, tabsContainerCss } =
      useResponsiveTabs({
        items,
        hasReachedMaxItemsCount,
        tabsContainerWithPlusElement,
        tabsContainerElement,
      });

    const onTabsLimitReached = useLatest(() =>
      onEBTEvent({ [TabsEventDataKeys.TABS_EVENT_NAME]: TabsEventName.tabsLimitReached })
    );

    useEffect(() => {
      if (hasReachedMaxItemsCount) {
        onTabsLimitReached.current();
      }
    }, [hasReachedMaxItemsCount, onTabsLimitReached]);

    useEffect(() => {
      if (selectedItem && tabsContainerRef.current) {
        const selectedTab = tabsContainerRef.current.querySelector(
          `#${getTabIdAttribute(selectedItem)}`
        );
        if (selectedTab) {
          selectedTab.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });

          if (moveFocusToItemIdRef.current === selectedItem.id) {
            (selectedTab as HTMLDivElement).focus();
            moveFocusToItemIdRef.current = null;
          }
        }
      }
    }, [selectedItem]);

    const onDragStart = useCallback(() => {
      setHoveredTabId(null);
    }, []);

    const onDragEnd = useCallback(
      ({ source, destination }: DropResult) => {
        if (source && destination) {
          const reorderedItems = euiDragDropReorder(items, source.index, destination.index);
          const movedTabId = items[source.index].id;

          onReorder(reorderedItems, movedTabId);
        }
      },
      [items, onReorder]
    );

    const selectAndMoveFocusToItemIndex = useCallback(
      async (itemIndex: number) => {
        const item = items[itemIndex];

        if (item && item.id !== selectedItem?.id) {
          moveFocusToItemIdRef.current = item.id;
          await onSelect(item);
        }
      },
      [items, selectedItem, onSelect]
    );

    const onSelectedTabKeyDown = useCallback(
      async (event: KeyboardEvent<HTMLDivElement>) => {
        const firstItemIndex = 0;
        const lastItemIndex = items.length - 1;

        const selectedItemIndex = items.findIndex((item) => item.id === selectedItem?.id);
        if (selectedItemIndex < 0) {
          return;
        }

        if (event.key === keys.ARROW_LEFT) {
          await selectAndMoveFocusToItemIndex(
            selectedItemIndex > 0 ? selectedItemIndex - 1 : lastItemIndex
          );
          emitOnKeyUsedEvent(shortcutActions.MOVE_LEFT);

          return;
        }

        if (event.key === keys.ARROW_RIGHT) {
          await selectAndMoveFocusToItemIndex(
            selectedItemIndex < lastItemIndex ? selectedItemIndex + 1 : firstItemIndex
          );

          emitOnKeyUsedEvent(shortcutActions.MOVE_RIGHT);

          return;
        }

        if (event.key === keys.HOME && items.length > 0) {
          await selectAndMoveFocusToItemIndex(0);

          emitOnKeyUsedEvent(shortcutActions.MOVE_HOME);

          return;
        }

        if (event.key === keys.END && items.length > 0) {
          await selectAndMoveFocusToItemIndex(lastItemIndex);

          emitOnKeyUsedEvent(shortcutActions.MOVE_END);

          return;
        }

        if (
          (event.key === 'Delete' || event.key === keys.BACKSPACE) &&
          selectedItem &&
          items.length > 1
        ) {
          await onClose?.(selectedItem);

          emitOnKeyUsedEvent(shortcutActions.CLOSE_TAB);

          return;
        }
      },
      [items, selectedItem, selectAndMoveFocusToItemIndex, onClose, emitOnKeyUsedEvent]
    );

    const ariaOwnsValue = useMemo(
      () => items.map((item) => getTabIdAttribute(item)).join(' '),
      [items]
    );

    const mainTabsBarContent = (
      <EuiFlexGroup
        responsive={false}
        alignItems="center"
        gutterSize="s"
        css={css`
          padding-right: ${euiTheme.size.s};
        `}
      >
        <EuiFlexItem ref={setTabsContainerWithPlusElement} grow css={growingFlexItemCss}>
          <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false} css={growingFlexItemCss}>
              <div
                aria-orientation="horizontal"
                aria-owns={ariaOwnsValue}
                ref={setTabsContainerElement}
                role="tablist"
                css={tabsContainerCss}
              >
                {/*
                  OptionalDroppable provides the drag-drop context wrapper.
                  When disableDragAndDrop=false, it sets up EuiDragDropContext and EuiDroppable.
                  When false, it renders a plain flex container with consistent styling.
                  This eliminates conditional rendering logic from this file.
                */}
                <OptionalDroppable
                  disableDragAndDrop={disableDragAndDrop}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                >
                  {/* Render each tab, optionally wrapped with drag functionality */}
                  {items.map((item, index) => {
                    const nextItem = items[index + 1];
                    const hideRightSeparator =
                      item.id === hoveredTabId || // hide own separator if hovered
                      item.id === selectedItem?.id || // hide own separator if selected
                      nextItem?.id === selectedItem?.id || // hide left sibling separator if next is selected
                      nextItem?.id === hoveredTabId; // hide left sibling separator if next is hovered

                    return (
                      /*
                        OptionalDraggable uses render prop pattern to conditionally wrap each tab with EuiDraggable.
                      */
                      <OptionalDraggable
                        item={item}
                        index={index}
                        disableDragAndDrop={disableDragAndDrop}
                        key={item.id}
                      >
                        {/* Render prop receives drag-related props when drag is enabled */}
                        {({ dragHandleProps, isDragging }) => (
                          <Tab
                            item={item}
                            isSelected={selectedItem?.id === item.id}
                            selectedItemId={selectedItem?.id}
                            isUnsaved={unsavedItemIds?.includes(item.id)}
                            isDragging={isDragging}
                            hideRightSeparator={hideRightSeparator}
                            onHoverChange={handleHoverChange}
                            dragHandleProps={dragHandleProps}
                            tabContentId={tabContentId}
                            tabsSizeConfig={tabsSizeConfig}
                            services={services}
                            getTabMenuItems={getTabMenuItems}
                            getPreviewData={getPreviewData}
                            onLabelEdited={onLabelEdited}
                            onSelect={onSelect}
                            onSelectedTabKeyDown={onSelectedTabKeyDown}
                            onClose={items.length > 1 ? onClose : undefined} // prevents closing the last tab
                            disableCloseButton={disableCloseButton}
                            disableInlineLabelEditing={disableInlineLabelEditing}
                            disableDragAndDrop={disableDragAndDrop}
                          />
                        )}
                      </OptionalDraggable>
                    );
                  })}
                </OptionalDroppable>
              </div>
            </EuiFlexItem>
            {!!scrollLeftButton && <EuiFlexItem grow={false}>{scrollLeftButton}</EuiFlexItem>}
            {!!scrollRightButton && <EuiFlexItem grow={false}>{scrollRightButton}</EuiFlexItem>}
            {!hasReachedMaxItemsCount && (
              <EuiFlexItem grow={false}>
                {!customNewTabButton && (
                  <EuiToolTip content={addButtonLabel} disableScreenReaderOutput>
                    <EuiButtonIcon
                      data-test-subj="unifiedTabs_tabsBar_newTabBtn"
                      iconType="plus"
                      color="text"
                      aria-label={addButtonLabel}
                      onClick={onAdd}
                    />
                  </EuiToolTip>
                )}
                {customNewTabButton ?? null}
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        {!disableTabsBarMenu && (
          <EuiFlexItem grow={false}>
            <TabsBarMenu
              items={items}
              selectedItem={selectedItem}
              recentlyClosedItems={recentlyClosedItems}
              hasReachedMaxItemsCount={hasReachedMaxItemsCount}
              getPreviewData={getPreviewData}
              onSelect={onSelect}
              onSelectRecentlyClosed={onSelectRecentlyClosed}
              onRestoreRecentlyClosedGroup={onRestoreRecentlyClosedGroup}
              onClearRecentlyClosed={onClearRecentlyClosed}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );

    return (
      <TabsBarWithBackground data-test-subj="unifiedTabs_tabsBar" services={services}>
        {mainTabsBarContent}
      </TabsBarWithBackground>
    );
  }
);
