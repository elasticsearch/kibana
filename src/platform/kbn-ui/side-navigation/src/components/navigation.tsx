/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, type ReactNode } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { EuiButton, EuiSpacer, useEuiTheme, useIsWithinBreakpoints } from '@elastic/eui';

import type { NavigationStructure, SideNavLogo, MenuItem, SecondaryMenuItem } from '../../types';
import {
  MAIN_PANEL_ID,
  MAX_FOOTER_ITEMS,
  MORE_MENU_ID,
  NAVIGATION_ROOT_SELECTOR,
  NAVIGATION_SELECTOR_PREFIX,
} from '../constants';
import { SideNav } from './side_nav';
import { SideNavCollapseButton } from './collapse_button';
import { focusMainContent } from '../utils/focus_main_content';
import { getHasSubmenu } from '../utils/get_has_submenu';
import { useLayoutWidth } from '../hooks/use_layout_width';
import { useNavigation } from '../hooks/use_navigation';
import { useNewItems } from '../hooks/use_new_items';
import { useResponsiveMenu } from '../hooks/use_responsive_menu';
import { getHighContrastSeparator } from '../hooks/use_high_contrast_mode_styles';

const navigationWrapperStyles = css`
  display: flex;
`;

export interface NavigationProps {
  /**
   * The active path for the navigation, used for highlighting the current item.
   */
  activeItemId?: string;
  /**
   * Whether the navigation is collapsed. This can be controlled by the parent component.
   */
  isCollapsed: boolean;
  /**
   * The navigation structure containing primary, secondary, and footer items.
   */
  items: NavigationStructure;
  /**
   * The logo object containing the route ID, href, label, and type.
   */
  logo?: SideNavLogo;
  /**
   * Required by the grid layout to set the width of the navigation slot.
   */
  setWidth: (width: number) => void;
  /**
   * (optional) Callback fired when a navigation item is clicked.
   */
  onItemClick?: (item: MenuItem | SecondaryMenuItem | SideNavLogo) => void;
  /**
   * Callback fired when the collapse button is toggled.
   *
   * The collapsed state's source of truth lives in chrome_service.tsx as a BehaviorSubject
   * that is persisted to localStorage. External consumers rely on this state.
   */
  onToggleCollapsed?: (isCollapsed: boolean) => void;
  /**
   * (optional) Content to display inside the side panel footer.
   */
  sidePanelFooter?: ReactNode;
  /**
   * When true, renders a centered horizontal separator at the top of the side nav,
   * between the global header and the logo/primary menu.
   */
  showTopSeparator?: boolean;
  /**
   * (optional) Callback fired when the customize button is clicked.
   * When not provided, the button is hidden.
   */
  onCustomizeNavigation?: () => void;
  /**
   * (optional) data-test-subj attribute for testing purposes.
   */
  'data-test-subj'?: string;
}

export const Navigation = ({
  activeItemId,
  isCollapsed: isCollapsedProp,
  items,
  logo,
  onCustomizeNavigation,
  onItemClick,
  onToggleCollapsed,
  setWidth,
  showTopSeparator = false,
  sidePanelFooter,
  ...rest
}: NavigationProps) => {
  const forcedCollapsed = useIsWithinBreakpoints(['xs', 's']);
  const isCollapsed = forcedCollapsed || isCollapsedProp;
  const euiThemeContext = useEuiTheme();

  const topSeparatorStyles = css`
    position: relative;
    flex-shrink: 0;
    ${getHighContrastSeparator(euiThemeContext, { side: 'bottom' })}
  `;

  const popoverItemPrefix = `${NAVIGATION_SELECTOR_PREFIX}-popoverItem`;
  const popoverFooterItemPrefix = `${NAVIGATION_SELECTOR_PREFIX}-popoverFooterItem`;
  const sidePanelItemPrefix = `${NAVIGATION_SELECTOR_PREFIX}-sidePanelItem`;
  const moreMenuTriggerTestSubj = `${NAVIGATION_SELECTOR_PREFIX}-moreMenuTrigger`;

  const {
    actualActiveItemId,
    visuallyActivePageId,
    visuallyActiveSubpageId,
    isSidePanelOpen,
    openerNode,
  } = useNavigation(isCollapsed, items, logo?.id, activeItemId);

  const [isAnyPopoverLocked, setIsAnyPopoverLocked] = useState(false);

  const { overflowMenuItems, primaryMenuRef, visibleMenuItems } = useResponsiveMenu(
    isCollapsed,
    items.primaryItems,
    (items.overflowItems?.length ?? 0) > 0
  );

  const allOverflowItems = [...overflowMenuItems, ...(items.overflowItems ?? [])];
  const hasMoreMenu = allOverflowItems.length > 0;

  const setSize = visibleMenuItems.length + (hasMoreMenu ? 1 : 0);

  const { getIsNewPrimary, getIsNewSecondary } = useNewItems(
    [...items.primaryItems, ...(items.overflowItems ?? []), ...items.footerItems],
    activeItemId
  );

  useLayoutWidth({ isCollapsed, isSidePanelOpen, setWidth });

  // Create the collapse button if a toggle callback is provided or if the navigation is not forced to be collapsed (e.g. on mobile)
  const collapseButton =
    onToggleCollapsed && !forcedCollapsed ? (
      <SideNavCollapseButton isCollapsed={isCollapsed} toggle={onToggleCollapsed} />
    ) : null;

  return (
    <div
      css={navigationWrapperStyles}
      data-test-subj={rest['data-test-subj'] ?? NAVIGATION_ROOT_SELECTOR}
      id={NAVIGATION_ROOT_SELECTOR}
    >
      <SideNav isCollapsed={isCollapsed}>
        {showTopSeparator && <div css={topSeparatorStyles} aria-hidden />}
        {logo && (
          <SideNav.Logo
            isCollapsed={isCollapsed}
            isCurrent={actualActiveItemId === logo.id}
            isHighlighted={visuallyActivePageId === logo.id}
            onClick={() => onItemClick?.(logo)}
            {...logo}
          />
        )}

        <SideNav.PrimaryMenu ref={primaryMenuRef} isCollapsed={isCollapsed}>
          {({ mainNavigationInstructionsId }) => (
            <>
              {visibleMenuItems.map((item, index) => {
                const { sections, secondaryMenuTitle, ...itemProps } = item;
                const isFirstItem = index === 0;
                const ariaDescribedBy = isFirstItem ? mainNavigationInstructionsId : undefined;

                return (
                  <SideNav.Popover
                    key={item.id}
                    hasContent={getHasSubmenu(item)}
                    isSidePanelOpen={!isCollapsed && item.id === openerNode?.id}
                    isAnyPopoverLocked={isAnyPopoverLocked}
                    label={item.label}
                    secondaryMenuTitle={secondaryMenuTitle}
                    trigger={
                      <SideNav.PrimaryMenu.Item
                        aria-describedby={ariaDescribedBy}
                        aria-posinset={index + 1}
                        aria-setsize={setSize}
                        hasContent={getHasSubmenu(item)}
                        isCollapsed={isCollapsed}
                        isCurrent={actualActiveItemId === item.id}
                        isHighlighted={item.id === visuallyActivePageId}
                        isNew={getIsNewPrimary(item.id)}
                        onClick={() => onItemClick?.(item)}
                        {...itemProps}
                      >
                        {item.label}
                      </SideNav.PrimaryMenu.Item>
                    }
                  >
                    {(closePopover, ids) => (
                      <SideNav.SecondaryMenu
                        title={secondaryMenuTitle ?? item.label}
                        badgeType={item.badgeType}
                        isNew={getIsNewSecondary(item.id)}
                      >
                        {sections?.map((section, sectionIndex) => {
                          const firstNonEmptySectionIndex = item.sections?.findIndex(
                            (s) => s.items.length > 0
                          );

                          return (
                            <SideNav.SecondaryMenu.Section key={section.id} label={section.label}>
                              {section.items.map((subItem, subItemIndex) => {
                                const isFirstSubItem =
                                  sectionIndex === firstNonEmptySectionIndex && subItemIndex === 0;
                                const subItemAriaDescribedBy = isFirstSubItem
                                  ? ids?.popoverNavigationInstructionsId
                                  : undefined;
                                return (
                                  <SideNav.SecondaryMenu.Item
                                    aria-describedby={subItemAriaDescribedBy}
                                    key={subItem.id}
                                    isHighlighted={subItem.id === visuallyActiveSubpageId}
                                    isCurrent={actualActiveItemId === subItem.id}
                                    isNew={getIsNewSecondary(subItem.id)}
                                    onClick={() => {
                                      onItemClick?.(subItem);
                                      if (subItem.href) {
                                        closePopover();
                                      }
                                    }}
                                    testSubjPrefix={popoverItemPrefix}
                                    {...subItem}
                                  >
                                    {subItem.label}
                                  </SideNav.SecondaryMenu.Item>
                                );
                              })}
                            </SideNav.SecondaryMenu.Section>
                          );
                        })}
                      </SideNav.SecondaryMenu>
                    )}
                  </SideNav.Popover>
                );
              })}

              {hasMoreMenu && (
                <SideNav.Popover
                  hasContent
                  isSidePanelOpen={false}
                  isAnyPopoverLocked={isAnyPopoverLocked}
                  setIsLocked={setIsAnyPopoverLocked}
                  label={i18n.translate('kbnUI.sideNavigation.moreMenuLabel', {
                    defaultMessage: 'More',
                  })}
                  persistent
                  trigger={
                    <SideNav.PrimaryMenu.Item
                      aria-posinset={visibleMenuItems.length + 1}
                      aria-setsize={setSize}
                      data-test-subj={moreMenuTriggerTestSubj}
                      hasContent
                      iconType="boxesVertical"
                      id={MORE_MENU_ID}
                      isCollapsed={isCollapsed}
                      isHighlighted={allOverflowItems.some(
                        (item) => item.id === visuallyActivePageId
                      )}
                      isNew={allOverflowItems.some((item) => getIsNewPrimary(item.id))}
                      label={i18n.translate('kbnUI.sideNavigation.moreMenuItemLabel', {
                        defaultMessage: 'More',
                      })}
                    >
                      <FormattedMessage
                        id="kbnUI.sideNavigation.moreMenuItemText"
                        defaultMessage="More"
                      />
                    </SideNav.PrimaryMenu.Item>
                  }
                >
                  {(closePopover) => (
                    <SideNav.NestedSecondaryMenu>
                      <SideNav.NestedSecondaryMenu.Panel
                        id={MAIN_PANEL_ID}
                        title={i18n.translate('kbnUI.sideNavigation.nestedSecondaryMenuMoreTitle', {
                          defaultMessage: 'More',
                        })}
                      >
                        {({ panelNavigationInstructionsId, panelEnterSubmenuInstructionsId }) => (
                          <>
                            <SideNav.NestedSecondaryMenu.Section>
                              {allOverflowItems.map((item, index) => {
                                const hasSubmenu = getHasSubmenu(item);
                                const { sections, secondaryMenuTitle, ...itemProps } = item;
                                const isFirstItem = index === 0;
                                const ariaDescribedBy =
                                  [
                                    isFirstItem && panelNavigationInstructionsId,
                                    hasSubmenu && panelEnterSubmenuInstructionsId,
                                  ]
                                    .filter(Boolean)
                                    .join(' ') || undefined;
                                return (
                                  <SideNav.NestedSecondaryMenu.PrimaryMenuItem
                                    key={item.id}
                                    aria-describedby={ariaDescribedBy}
                                    isHighlighted={item.id === visuallyActivePageId}
                                    isNew={getIsNewPrimary(item.id)}
                                    hasSubmenu={hasSubmenu}
                                    onClick={() => {
                                      onItemClick?.(item);
                                      if (!hasSubmenu) {
                                        closePopover();
                                        focusMainContent();
                                      }
                                    }}
                                    {...itemProps}
                                  >
                                    {item.label}
                                  </SideNav.NestedSecondaryMenu.PrimaryMenuItem>
                                );
                              })}
                              {onCustomizeNavigation && (
                                <>
                                  <EuiSpacer size="s" />
                                  <EuiButton
                                    iconType="controls"
                                    color="text"
                                    size="s"
                                    onClick={() => {
                                      closePopover();
                                      onCustomizeNavigation();
                                    }}
                                    data-test-subj="customizeNavigationMoreMenuButton"
                                  >
                                    <FormattedMessage
                                      id="kbnUI.sideNavigation.customizeNavigationButton"
                                      defaultMessage="Customize navigation"
                                    />
                                  </EuiButton>
                                </>
                              )}
                            </SideNav.NestedSecondaryMenu.Section>
                          </>
                        )}
                      </SideNav.NestedSecondaryMenu.Panel>
                      {allOverflowItems.filter(getHasSubmenu).map((item) => (
                        <SideNav.NestedSecondaryMenu.Panel key={`submenu-${item.id}`} id={item.id}>
                          {({ panelNavigationInstructionsId }) => (
                            <>
                              <SideNav.NestedSecondaryMenu.Header
                                title={item.secondaryMenuTitle ?? item.label}
                                aria-describedby={panelNavigationInstructionsId}
                              />
                              {item.sections?.map((section) => (
                                <SideNav.NestedSecondaryMenu.Section
                                  key={section.id}
                                  label={section.label}
                                >
                                  {section.items.map((subItem) => (
                                    <SideNav.NestedSecondaryMenu.Item
                                      key={subItem.id}
                                      isHighlighted={subItem.id === visuallyActiveSubpageId}
                                      isCurrent={actualActiveItemId === subItem.id}
                                      isNew={getIsNewSecondary(subItem.id)}
                                      onClick={() => {
                                        onItemClick?.(subItem);
                                        closePopover();
                                        focusMainContent();
                                      }}
                                      {...subItem}
                                    >
                                      {subItem.label}
                                    </SideNav.NestedSecondaryMenu.Item>
                                  ))}
                                </SideNav.NestedSecondaryMenu.Section>
                              ))}
                            </>
                          )}
                        </SideNav.NestedSecondaryMenu.Panel>
                      ))}
                    </SideNav.NestedSecondaryMenu>
                  )}
                </SideNav.Popover>
              )}
            </>
          )}
        </SideNav.PrimaryMenu>

        <SideNav.Footer isCollapsed={isCollapsed} collapseButton={collapseButton}>
          {({ footerNavigationInstructionsId }) => (
            <>
              {items.footerItems.slice(0, MAX_FOOTER_ITEMS).map((item, index) => {
                const { sections, secondaryMenuTitle, ...itemProps } = item;
                const isFirstItem = index === 0;
                const ariaDescribedBy = isFirstItem ? footerNavigationInstructionsId : undefined;

                return (
                  <SideNav.Popover
                    key={item.id}
                    hasContent={getHasSubmenu(item)}
                    isSidePanelOpen={!isCollapsed && item.id === openerNode?.id}
                    isAnyPopoverLocked={isAnyPopoverLocked}
                    label={item.label}
                    secondaryMenuTitle={secondaryMenuTitle}
                    persistent={false}
                    trigger={
                      <SideNav.Footer.Item
                        aria-describedby={ariaDescribedBy}
                        isHighlighted={item.id === visuallyActivePageId}
                        isCurrent={actualActiveItemId === item.id}
                        isNew={getIsNewPrimary(item.id)}
                        hasContent={getHasSubmenu(item)}
                        onClick={() => onItemClick?.(item)}
                        {...itemProps}
                      />
                    }
                  >
                    {(closePopover, ids) => (
                      <SideNav.SecondaryMenu
                        title={secondaryMenuTitle ?? item.label}
                        badgeType={item.badgeType}
                        isNew={getIsNewSecondary(item.id)}
                      >
                        {sections?.map((section, sectionIndex) => {
                          const firstNonEmptySectionIndex = item.sections?.findIndex(
                            (s) => s.items.length > 0
                          );
                          return (
                            <SideNav.SecondaryMenu.Section key={section.id} label={section.label}>
                              {section.items.map((subItem, subItemIndex) => {
                                const isFirstSubItem =
                                  sectionIndex === firstNonEmptySectionIndex && subItemIndex === 0;
                                const subItemAriaDescribedBy = isFirstSubItem
                                  ? ids?.popoverNavigationInstructionsId
                                  : undefined;

                                return (
                                  <SideNav.SecondaryMenu.Item
                                    aria-describedby={subItemAriaDescribedBy}
                                    key={subItem.id}
                                    isHighlighted={subItem.id === visuallyActiveSubpageId}
                                    isCurrent={actualActiveItemId === subItem.id}
                                    isNew={getIsNewSecondary(subItem.id)}
                                    onClick={() => {
                                      onItemClick?.(subItem);
                                      if (subItem.href) {
                                        closePopover();
                                      }
                                    }}
                                    {...subItem}
                                    testSubjPrefix={popoverFooterItemPrefix}
                                  >
                                    {subItem.label}
                                  </SideNav.SecondaryMenu.Item>
                                );
                              })}
                            </SideNav.SecondaryMenu.Section>
                          );
                        })}
                      </SideNav.SecondaryMenu>
                    )}
                  </SideNav.Popover>
                );
              })}
            </>
          )}
        </SideNav.Footer>
      </SideNav>

      {isSidePanelOpen && openerNode && (
        <SideNav.SidePanel footer={sidePanelFooter} openerNode={openerNode}>
          {({ secondaryNavigationInstructionsId }) => {
            const firstNonEmptySectionIndex = openerNode.sections?.findIndex(
              (s) => s.items.length > 0
            );

            return (
              <SideNav.SecondaryMenu
                badgeType={openerNode.badgeType}
                isPanel
                title={openerNode.secondaryMenuTitle ?? openerNode.label}
                isNew={getIsNewSecondary(openerNode.id)}
              >
                {openerNode.sections?.map((section, sectionIndex) => (
                  <SideNav.SecondaryMenu.Section key={section.id} label={section.label}>
                    {section.items.map((subItem, subItemIndex) => {
                      const isFirstItem =
                        sectionIndex === firstNonEmptySectionIndex && subItemIndex === 0;
                      const ariaDescribedBy = isFirstItem
                        ? secondaryNavigationInstructionsId
                        : undefined;

                      return (
                        <SideNav.SecondaryMenu.Item
                          aria-describedby={ariaDescribedBy}
                          key={subItem.id}
                          isCurrent={actualActiveItemId === subItem.id}
                          isHighlighted={subItem.id === visuallyActiveSubpageId}
                          isNew={getIsNewSecondary(subItem.id)}
                          onClick={() => onItemClick?.(subItem)}
                          testSubjPrefix={sidePanelItemPrefix}
                          {...subItem}
                        >
                          {subItem.label}
                        </SideNav.SecondaryMenu.Item>
                      );
                    })}
                  </SideNav.SecondaryMenu.Section>
                ))}
              </SideNav.SecondaryMenu>
            );
          }}
        </SideNav.SidePanel>
      )}
    </div>
  );
};
