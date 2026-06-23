/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MouseEvent, KeyboardEvent, CSSProperties } from 'react';
import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiToolTip,
  useEuiTheme,
  type EuiThemeComputed,
  type DraggableProvidedDragHandleProps,
  keys,
  useGeneratedHtmlId,
  EuiProgress,
  EuiTextTruncate,
  EuiIcon,
} from '@elastic/eui';
import { TabMenu } from '../tab_menu';
import { EditTabLabel, type EditTabLabelProps } from './edit_tab_label';
import { getTabAttributes } from '../../utils/get_tab_attributes';
import type { TabItem, TabsSizeConfig, GetTabMenuItems, TabsServices } from '../../types';
import { TabStatus, type TabPreviewData } from '../../types';
import { TabWithBackground } from '../tabs_visual_glue_to_app_container/tab_with_background';
import { TabPreview } from '../tab_preview';
import { useTabLabelWidth } from './use_tab_label_width';

export interface TabProps {
  item: TabItem;
  isSelected: boolean;
  selectedItemId?: string;
  isUnsaved?: boolean;
  isDragging?: boolean;
  hideRightSeparator?: boolean;
  onHoverChange?: (itemId: string, isHovered: boolean) => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  tabContentId: string;
  tabsSizeConfig: TabsSizeConfig;
  getTabMenuItems?: GetTabMenuItems;
  getPreviewData?: (item: TabItem) => TabPreviewData;
  services: TabsServices;
  onLabelEdited: EditTabLabelProps['onLabelEdited'];
  onSelect: (item: TabItem) => Promise<void>;
  onClose: ((item: TabItem) => Promise<void>) | undefined;
  onSelectedTabKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => Promise<void>;
  disableCloseButton?: boolean;
  disableInlineLabelEditing?: boolean;
  disableDragAndDrop?: boolean;
}

const closeButtonLabel = i18n.translate('unifiedTabs.closeTabButton', {
  defaultMessage: 'Close tab',
});

const unsavedChangesIndicatorTitle = i18n.translate('unifiedTabs.unsavedChangesTabIndicatorTitle', {
  defaultMessage: 'Unsaved changes',
});

export const Tab: React.FC<TabProps> = (props) => {
  const {
    item,
    isSelected,
    selectedItemId,
    isUnsaved,
    isDragging,
    hideRightSeparator,
    onHoverChange,
    dragHandleProps,
    tabContentId,
    tabsSizeConfig,
    getTabMenuItems,
    getPreviewData,
    services,
    onLabelEdited,
    onSelect,
    onClose,
    onSelectedTabKeyDown,
    disableCloseButton = false,
    disableInlineLabelEditing = false,
    disableDragAndDrop = false,
  } = props;
  const { euiTheme } = useEuiTheme();
  const tabLabelId = useGeneratedHtmlId({ prefix: 'tabLabel' });
  const tabInteractiveElementRef = useRef<HTMLDivElement | null>(null);
  const [isInlineEditActive, setIsInlineEditActive] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [isActionPopoverOpen, setActionPopover] = useState<boolean>(false);
  const prevSelectedItemIdRef = useRef<string | undefined>(selectedItemId);
  const previewData = useMemo(() => getPreviewData?.(item), [getPreviewData, item]);

  const hidePreview = useCallback(() => setShowPreview(false), [setShowPreview]);

  const onToggleActionsMenu = useCallback(
    (isOpen: boolean) => {
      setActionPopover(isOpen);
      hidePreview();
    },
    [setActionPopover, hidePreview]
  );

  const onSelectEvent = useCallback(
    async (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
      event.stopPropagation();
      hidePreview();

      if (!isSelected) {
        await onSelect(item);
      }
    },
    [onSelect, item, isSelected, hidePreview]
  );

  const onCloseEvent = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      await onClose?.(item);
    },
    [onClose, item]
  );

  const onClick = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      if (document.activeElement && document.activeElement !== event.target) {
        (document.activeElement as HTMLElement).blur();
      }
      await onSelectEvent(event);
    },
    [onSelectEvent]
  );

  const onDoubleClick = useCallback(
    (event?: MouseEvent<HTMLDivElement>) => {
      event?.stopPropagation();
      if (!disableInlineLabelEditing) {
        hidePreview();
        setActionPopover(false);
        setIsInlineEditActive(true);
      }
    },
    [setIsInlineEditActive, hidePreview, setActionPopover, disableInlineLabelEditing]
  );

  const onEnterRenaming = useCallback(async () => {
    if (!isSelected) {
      await onSelect(item);
    }
    // Wait for the selection to propagate before enabling edit mode
    setTimeout(() => onDoubleClick(), 0);
  }, [item, isSelected, onDoubleClick, onSelect]);

  const onKeyDownEvent = useCallback(
    async (event: KeyboardEvent<HTMLDivElement>) => {
      // per https://www.w3.org/WAI/ARIA/apg/patterns/tabs/

      if (!isSelected && event.key === keys.ENTER) {
        event.preventDefault();
        tabInteractiveElementRef.current?.focus();
        await onSelectEvent(event);
        return;
      }

      if (!isSelected || isDragging) {
        return;
      }

      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        setActionPopover(true);
        return;
      }

      await onSelectedTabKeyDown?.(event);
    },
    [isSelected, isDragging, onSelectEvent, setActionPopover, onSelectedTabKeyDown]
  );

  const fontWeight = isSelected ? euiTheme.font.weight.semiBold : euiTheme.font.weight.regular;

  const { tabLabelRef, tabLabelWidth, tabLabelTextWidth } = useTabLabelWidth({
    item,
    tabsSizeConfig,
    fontWeight,
  });

  useEffect(() => {
    if (isInlineEditActive && !isSelected) {
      setIsInlineEditActive(false);
    }
  }, [isInlineEditActive, isSelected, setIsInlineEditActive]);

  // dismisses action popover when the selected tab changes
  useEffect(() => {
    if (prevSelectedItemIdRef.current !== selectedItemId && !isSelected && isActionPopoverOpen) {
      setActionPopover(false);
    }
    prevSelectedItemIdRef.current = selectedItemId;
  }, [selectedItemId, isSelected, isActionPopoverOpen]);

  const isLoading = previewData?.status === TabStatus.RUNNING;

  const mainTabContent = (
    <div css={getTabContainerCss(euiTheme, tabsSizeConfig, isSelected, fontWeight, isDragging)}>
      <div
        ref={tabInteractiveElementRef}
        {...(!disableDragAndDrop ? dragHandleProps : {})}
        {...getTabAttributes(item, tabContentId)}
        data-test-subj={`unifiedTabs_selectTabBtn_${item.id}`}
        aria-labelledby={tabLabelId}
        role="tab"
        tabIndex={isSelected ? 0 : -1}
        aria-haspopup={!isInlineEditActive}
        aria-selected={isSelected}
        css={css`
          &:focus,
          &:focus-visible {
            outline: none;
          }
        `}
        onClick={isInlineEditActive ? undefined : onClick}
        onDoubleClick={isInlineEditActive ? undefined : onDoubleClick}
        onKeyDown={isInlineEditActive ? undefined : onKeyDownEvent}
      >
        <div css={getTabContentCss(euiTheme)}>
          {isInlineEditActive ? (
            <EditTabLabel
              item={item}
              onLabelEdited={onLabelEdited}
              onExit={() => {
                setIsInlineEditActive(false);
                tabInteractiveElementRef.current?.focus();
              }}
            />
          ) : (
            <div css={getTabLabelContainerCss(euiTheme)} className="unifiedTabs__tabLabel">
              {isLoading && (
                <EuiProgress
                  size="xs"
                  color="primary"
                  position="absolute"
                  css={css`
                    // Pull the bar up by the tab's top border width so it sits on top of the
                    // border edge instead of below it.
                    top: -${euiTheme.border.width.thick};
                    // we can't simply use overflow: hidden; because then curved notches are not visible
                    border-top-left-radius: ${euiTheme.border.radius.small};
                    border-top-right-radius: ${euiTheme.border.radius.small};
                  `}
                />
              )}
              <EuiFlexGroup
                ref={tabLabelRef}
                gutterSize="xs"
                alignItems="center"
                justifyContent="spaceBetween"
                wrap={false}
                responsive={false}
                style={{ width: tabLabelWidth, fontWeight }}
              >
                <EuiText
                  id={tabLabelId}
                  color="inherit"
                  size="s"
                  css={getTabLabelCss()}
                  className="unifiedTabs__tabLabelText"
                >
                  <EuiTextTruncate
                    text={item.label}
                    width={tabLabelTextWidth}
                    truncation="middle"
                    title=""
                  />
                </EuiText>
                {isUnsaved && (
                  <EuiIcon
                    data-test-subj={`unifiedTabs__tabChangesIndicator-${item.id}`}
                    type="dot"
                    title={unsavedChangesIndicatorTitle}
                  />
                )}
              </EuiFlexGroup>
            </div>
          )}
        </div>
      </div>
      {!isInlineEditActive && (
        <div className="unifiedTabs__tabActions">
          <EuiFlexGroup responsive={false} direction="row" gutterSize="none">
            {!!getTabMenuItems && (
              <EuiFlexItem grow={false} className="unifiedTabs__tabMenuBtn">
                {!item.customMenuButton && (
                  <TabMenu
                    item={item}
                    getTabMenuItems={getTabMenuItems}
                    isPopoverOpen={isActionPopoverOpen}
                    isSelected={isSelected}
                    setPopover={onToggleActionsMenu}
                    onEnterRenaming={onEnterRenaming}
                  />
                )}
                {item.customMenuButton ?? null}
              </EuiFlexItem>
            )}
            {!disableCloseButton && !!onClose && (
              <EuiFlexItem grow={false} className="unifiedTabs__closeTabBtn">
                <EuiToolTip content={closeButtonLabel} disableScreenReaderOutput>
                  <EuiButtonIcon
                    aria-label={closeButtonLabel}
                    color="text"
                    data-test-subj={`unifiedTabs_closeTabBtn_${item.id}`}
                    iconType="cross"
                    onClick={onCloseEvent}
                    tabIndex={isSelected ? 0 : -1}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </div>
      )}
    </div>
  );

  const tabWithBackground = (
    <TabWithBackground
      data-test-subj={`unifiedTabs_tab_${item.id}`}
      isSelected={isSelected}
      isDragging={isDragging}
      isLoading={isLoading}
      hideRightSeparator={hideRightSeparator}
      services={services}
      onMouseEnter={() => onHoverChange?.(item.id, true)}
      onMouseLeave={() => onHoverChange?.(item.id, false)}
    >
      {mainTabContent}
    </TabWithBackground>
  );

  if (!previewData) {
    return tabWithBackground;
  }

  return (
    <TabPreview
      showPreview={showPreview}
      setShowPreview={setShowPreview}
      stopPreviewOnHover={isInlineEditActive || isActionPopoverOpen}
      tabItem={item}
      previewData={previewData}
    >
      {tabWithBackground}
    </TabPreview>
  );
};

function getTabContainerCss(
  euiTheme: EuiThemeComputed,
  tabsSizeConfig: TabsSizeConfig,
  isSelected: boolean,
  fontWeight: CSSProperties['fontWeight'],
  isDragging?: boolean
) {
  // TODO: remove the usage of deprecated colors

  return css`
    position: relative;
    min-width: ${tabsSizeConfig.regularTabMinWidth}px;
    max-width: ${tabsSizeConfig.regularTabMaxWidth}px;

    .unifiedTabs__tabActions {
      position: absolute;
      top: ${euiTheme.size.s};
      right: ${euiTheme.size.xs};
      opacity: 0;
      transition: opacity ${euiTheme.animation.fast};
    }

    .unifiedTabs__tabLabelText {
      color: ${isSelected || isDragging ? euiTheme.colors.text : euiTheme.colors.subduedText};
      font-weight: ${fontWeight};
    }

    &:hover .unifiedTabs__tabLabelText {
      color: ${euiTheme.colors.text};
    }

    ${!isSelected
      ? `
      &:hover .unifiedTabs__tabLabelText {
        color: ${euiTheme.colors.primary};
      }
    `
      : ''}

    &:hover,
    &:focus-within {
      .unifiedTabs__tabActions {
        opacity: 1;
      }

      .unifiedTabs__tabLabel {
        width: calc(100% - ${euiTheme.size.l} * 2 - ${euiTheme.size.xs});
        mask-image: linear-gradient(
          to right,
          rgb(255, 0, 0) calc(100% - ${euiTheme.size.s}),
          rgba(255, 0, 0, 0.1) 100%
        );
      }
    }
  `;
}

function getTabContentCss(euiTheme: EuiThemeComputed) {
  return css`
    display: inline-flex;
    align-items: center;
    width: 100%;
    height: ${euiTheme.size.xxl};
    padding-inline: ${euiTheme.size.xs};
  `;
}

function getTabLabelContainerCss(euiTheme: EuiThemeComputed) {
  return css`
    padding-inline: ${euiTheme.size.xs};
  `;
}

function getTabLabelCss() {
  return css`
    overflow: hidden;
  `;
}
