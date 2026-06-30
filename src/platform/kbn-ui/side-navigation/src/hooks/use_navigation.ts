/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';

import type { MenuItem, NavigationStructure } from '../../types';
import { getActiveItems } from '../utils/get_initial_active_items';
import { sectionHasSidePanelContent } from '../utils/section_has_content';

interface NavigationState {
  actualActiveItemId: string | undefined;
  visuallyActivePageId: string | undefined;
  visuallyActiveSubpageId: string | undefined;
  openerNode: MenuItem | null;
  isCollapsed: boolean;
  isSidePanelOpen: boolean;
}

/**
 * Hook for managing the main navigation state.
 *
 * @param isCollapsed - whether the side nav is collapsed.
 * @param items - the navigation structure including primary, secondary, and footer items.
 * @param logoId - the logo ID, used for highlighting the logo.
 * @param activeItemId - the active item ID, used for highlighting the active item.
 * @returns the navigation state including:
 * - `actualActiveItemId` - the actual active item ID. There can only be one `aria-current=page` link on the page.
 * - `visuallyActivePageId` - the visually active page ID. The link does not have to be `aria-current=page`, it can be a parent of an active page.
 * - `visuallyActiveSubpageId` - the visually active subpage ID.
 * - `openerNode` - the primary menu item whose submenu is shown in the side panel.
 * - `isCollapsed` - whether the side nav is collapsed.
 * - `isSidePanelOpen` - whether the side panel is open.
 */
export const useNavigation = (
  isCollapsed: boolean,
  items: NavigationStructure,
  logoId: string | undefined,
  activeItemId?: string
) => {
  const { primaryItem, secondaryItem, isLogoActive } = useMemo(
    () => getActiveItems(items, activeItemId, logoId),
    [items, activeItemId, logoId]
  );

  const actualActiveItemId = activeItemId;
  const visuallyActivePageId = isLogoActive ? logoId : primaryItem?.id;
  const visuallyActiveSubpageId = secondaryItem?.id;
  const openerNode = primaryItem;
  const isSidePanelOpen = !isCollapsed && !!openerNode?.sections?.some(sectionHasSidePanelContent);

  const state: NavigationState = {
    actualActiveItemId,
    visuallyActivePageId,
    visuallyActiveSubpageId,
    openerNode,
    isCollapsed,
    isSidePanelOpen,
  };

  return state;
};
