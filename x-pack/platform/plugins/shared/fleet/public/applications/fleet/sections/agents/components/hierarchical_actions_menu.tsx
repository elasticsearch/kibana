/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback, useState } from 'react';
import {
  EuiButton,
  EuiButtonIcon,
  EuiContextMenu,
  EuiIcon,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { EuiContextMenuPanelDescriptor, IconType, EuiIconProps } from '@elastic/eui';

/**
 * Recursive menu item interface that supports infinite nesting using EUI's ContextMenu component.
 * If `children` is provided, the item will render as a submenu trigger.
 * If `onClick` is provided (and no children), the item is an action.
 */
export interface MenuItem {
  /** Unique identifier for the menu item */
  id: string;
  /** Display name for the menu item */
  name: React.ReactNode;
  /** Icon to display (EUI icon type) */
  icon?: IconType;
  /** Color for the icon (e.g., 'danger' for destructive actions). Defaults to 'default' if not specified. */
  iconColor?: EuiIconProps['color'];
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Click handler for action items (not used if children are present) */
  onClick?: (event: React.MouseEvent) => void;
  /** Nested menu items - if present, this item becomes a submenu trigger */
  children?: MenuItem[];
  /** Optional data-test-subj for testing */
  'data-test-subj'?: string;
  /** Title for the child panel (used for back navigation). If not provided, uses `name` */
  panelTitle?: string;
  /** If true, the menu will NOT close after clicking this item. Useful for items that open a secondary popover anchored to the menu item button. */
  keepMenuOpen?: boolean;
}

export interface HierarchicalActionsMenuProps {
  /** The menu items to render */
  items: MenuItem[];
  /** Whether the popover is open (controlled) */
  isOpen?: boolean;
  /** Where the popover should be anchored. Defaults to downRight. */
  anchorPosition?: 'downRight' | 'downLeft' | 'upRight' | 'upLeft';
  /** Callback when open state changes (controlled) */
  onToggle?: (isOpen: boolean) => void;
  /** Custom button configuration. If not provided, renders a default icon button */
  button?: {
    props?: {
      iconType?: IconType;
      iconSide?: 'left' | 'right';
      color?: 'primary' | 'text' | 'accent' | 'success' | 'warning' | 'danger';
      fill?: boolean;
      isLoading?: boolean;
    };
    children: React.ReactNode;
  };
  /** Optional data-test-subj for the button */
  'data-test-subj'?: string;
}

/**
 * A reusable hierarchical context menu component that supports infinite nesting.
 * Uses EUI's EuiContextMenu with slide-in panels for nested items.
 */
export const HierarchicalActionsMenu: React.FC<HierarchicalActionsMenuProps> = ({
  items,
  isOpen: controlledIsOpen,
  anchorPosition = 'downRight',
  onToggle,
  button,
  'data-test-subj': dataTestSubj,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  // Support both controlled and uncontrolled modes
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = useCallback(
    (open: boolean) => {
      if (onToggle) {
        onToggle(open);
      } else {
        setInternalIsOpen(open);
      }
    },
    [onToggle]
  );

  const closeMenu = useCallback(() => setIsOpen(false), [setIsOpen]);
  const toggleMenu = useCallback(() => setIsOpen(!isOpen), [setIsOpen, isOpen]);

  /**
   * Recursively converts the MenuItem tree into EUI panel descriptors.
   * Uses item paths as panel IDs (e.g., "reassign.newPolicy") for simplicity.
   * Root panel has ID 0, child panels use their path as the ID.
   */
  const panels = useMemo(() => {
    const result: EuiContextMenuPanelDescriptor[] = [];

    const buildPanels = (
      menuItems: MenuItem[],
      panelId: string | number,
      parentPanelTitle?: string,
      parentPath: string = ''
    ) => {
      const panelItems = menuItems.map((item) => {
        const itemPath = parentPath ? `${parentPath}.${item.id}` : item.id;
        const hasChildren = item.children && item.children.length > 0;

        // For items with children, only include panel (no onClick)
        // For action items, only include onClick (no panel)
        if (hasChildren) {
          return {
            name: item.name,
            icon: item.icon ? (
              <EuiIcon type={item.icon} size="m" color={item.iconColor} aria-hidden={true} />
            ) : undefined,
            disabled: item.disabled,
            panel: itemPath,
            'data-test-subj': item['data-test-subj'],
          };
        }

        return {
          name: item.name,
          icon: item.icon ? (
            <EuiIcon type={item.icon} size="m" color={item.iconColor} aria-hidden={true} />
          ) : undefined,
          disabled: item.disabled,
          onClick: (event: React.MouseEvent) => {
            if (item.onClick) {
              item.onClick(event);
            }
            // Only close the menu if keepMenuOpen is not set to true
            if (!item.keepMenuOpen) {
              closeMenu();
            }
          },
          'data-test-subj': item['data-test-subj'],
        };
      });

      const panelDescriptor: EuiContextMenuPanelDescriptor = {
        id: panelId,
        items: panelItems,
      };

      // Add title for child panels - clicking it navigates back
      if (parentPanelTitle) {
        panelDescriptor.title = parentPanelTitle;
      }

      result.push(panelDescriptor);

      // Recursively build child panels
      menuItems.forEach((item) => {
        if (item.children && item.children.length > 0) {
          const itemPath = parentPath ? `${parentPath}.${item.id}` : item.id;
          // Use panelTitle if provided, otherwise try to extract string from name
          const childPanelTitle =
            item.panelTitle || (typeof item.name === 'string' ? item.name : item.id);
          buildPanels(item.children, itemPath, childPanelTitle, itemPath);
        }
      });
    };

    buildPanels(items, 0);

    return result;
  }, [items, closeMenu]);

  // Render the button
  const buttonElement = button ? (
    <EuiButton
      iconType={button.props?.iconType}
      iconSide={button.props?.iconSide}
      color={button.props?.color}
      fill={button.props?.fill}
      isLoading={button.props?.isLoading}
      onClick={toggleMenu}
      data-test-subj={dataTestSubj}
    >
      {button.children}
    </EuiButton>
  ) : (
    <EuiToolTip
      content={i18n.translate('xpack.fleet.hierarchicalMenu.openMenuAriaLabel', {
        defaultMessage: 'Open menu',
      })}
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        iconType="boxesVertical"
        onClick={toggleMenu}
        aria-label={i18n.translate('xpack.fleet.hierarchicalMenu.openMenuAriaLabel', {
          defaultMessage: 'Open menu',
        })}
        data-test-subj={dataTestSubj || 'hierarchicalMenuButton'}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.fleet.hierarchicalMenu.popoverAriaLabel', {
        defaultMessage: 'Menu',
      })}
      anchorPosition={anchorPosition}
      panelPaddingSize="none"
      button={buttonElement}
      isOpen={isOpen}
      closePopover={closeMenu}
    >
      <EuiContextMenu panels={panels} initialPanelId={0} />
    </EuiPopover>
  );
};
