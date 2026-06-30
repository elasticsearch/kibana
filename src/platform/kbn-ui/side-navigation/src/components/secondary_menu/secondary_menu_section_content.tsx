/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type ReactNode } from 'react';

import type {
  MenuItem,
  SecondaryMenuItem,
  SecondaryMenuSection,
  NavExtensionRenderContext as SecondaryNavExtensionPointContext,
} from '../../../types';
import { SideNav } from '../side_nav';

type SecondaryMenuSurface = SecondaryNavExtensionPointContext['surface'];

export interface RenderSecondaryMenuSectionParams {
  section: SecondaryMenuSection;
  sectionIndex: number;
  primaryItem: MenuItem;
  surface: SecondaryMenuSurface;
  activeItemId?: string;
  visuallyActiveSubpageId?: string;
  firstNonEmptySectionIndex?: number;
  popoverNavigationInstructionsId?: string;
  secondaryNavigationInstructionsId?: string;
  testSubjPrefix?: string;
  getIsNewSecondary: (itemId: string) => boolean;
  onItemClick?: (item: SecondaryMenuItem) => void;
  onSecondaryItemClick?: (item: SecondaryMenuItem) => void;
  renderExtensionPoint?: (
    slotId: string,
    extensionId: string,
    context: SecondaryNavExtensionPointContext
  ) => ReactNode;
}

export const renderSecondaryMenuSection = ({
  section,
  sectionIndex,
  primaryItem,
  surface,
  activeItemId,
  visuallyActiveSubpageId,
  firstNonEmptySectionIndex,
  popoverNavigationInstructionsId,
  secondaryNavigationInstructionsId,
  testSubjPrefix,
  getIsNewSecondary,
  onItemClick,
  onSecondaryItemClick,
  renderExtensionPoint,
}: RenderSecondaryMenuSectionParams) => {
  if (section?.slotId && section?.extensionId) {
    if (!renderExtensionPoint) {
      return null;
    }

    const content = renderExtensionPoint(section.slotId, section.extensionId, {
      primaryItemId: primaryItem.id,
      sectionId: section.id,
      surface,
      activeItemId,
    });

    if (!content) {
      return null;
    }

    return (
      <SideNav.SecondaryMenu.Section key={section.id} label={section.label}>
        {content}
      </SideNav.SecondaryMenu.Section>
    );
  }

  if (!section.items?.length) {
    return null;
  }

  return (
    <SideNav.SecondaryMenu.Section key={section.id} label={section.label}>
      {section.items.map((subItem, subItemIndex) => {
        const isFirstSubItem = sectionIndex === firstNonEmptySectionIndex && subItemIndex === 0;
        const ariaDescribedBy =
          (surface === 'popover' && isFirstSubItem && popoverNavigationInstructionsId) ||
          (surface === 'sidePanel' && isFirstSubItem && secondaryNavigationInstructionsId) ||
          undefined;

        return (
          <SideNav.SecondaryMenu.Item
            aria-describedby={ariaDescribedBy}
            key={subItem.id}
            isHighlighted={subItem.id === visuallyActiveSubpageId}
            isCurrent={activeItemId === subItem.id}
            isNew={getIsNewSecondary(subItem.id)}
            onClick={() => {
              onSecondaryItemClick?.(subItem);
              onItemClick?.(subItem);
            }}
            testSubjPrefix={testSubjPrefix}
            {...subItem}
          >
            {subItem.label}
          </SideNav.SecondaryMenu.Item>
        );
      })}
    </SideNav.SecondaryMenu.Section>
  );
};

export interface RenderNestedSecondaryMenuSectionParams {
  section: SecondaryMenuSection;
  primaryItem: MenuItem;
  activeItemId?: string;
  visuallyActiveSubpageId?: string;
  getIsNewSecondary: (itemId: string) => boolean;
  onItemClick?: (item: SecondaryMenuItem) => void;
  onSecondaryItemClick?: (item: SecondaryMenuItem) => void;
  renderExtensionPoint?: (
    slotId: string,
    extensionId: string,
    context: SecondaryNavExtensionPointContext
  ) => ReactNode;
}

export const renderNestedSecondaryMenuSection = ({
  section,
  primaryItem,
  activeItemId,
  visuallyActiveSubpageId,
  getIsNewSecondary,
  onItemClick,
  onSecondaryItemClick,
  renderExtensionPoint,
}: RenderNestedSecondaryMenuSectionParams) => {
  if (section.slotId && section.extensionId) {
    if (!renderExtensionPoint) {
      return null;
    }

    const content = renderExtensionPoint(section.slotId, section.extensionId, {
      primaryItemId: primaryItem.id,
      sectionId: section.id,
      surface: 'overflow',
      activeItemId,
    });

    if (!content) {
      return null;
    }

    return (
      <SideNav.NestedSecondaryMenu.Section key={section.id} label={section.label}>
        {content}
      </SideNav.NestedSecondaryMenu.Section>
    );
  }

  if (!section.items?.length) {
    return null;
  }

  return (
    <SideNav.NestedSecondaryMenu.Section key={section.id} label={section.label}>
      {section.items.map((subItem) => (
        <SideNav.NestedSecondaryMenu.Item
          key={subItem.id}
          isHighlighted={subItem.id === visuallyActiveSubpageId}
          isCurrent={activeItemId === subItem.id}
          isNew={getIsNewSecondary(subItem.id)}
          onClick={() => {
            onSecondaryItemClick?.(subItem);
            onItemClick?.(subItem);
          }}
          {...subItem}
        >
          {subItem.label}
        </SideNav.NestedSecondaryMenu.Item>
      ))}
    </SideNav.NestedSecondaryMenu.Section>
  );
};
