/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  AppMenuItemType,
  AppMenuPopoverItem,
  AppMenuPrimaryActionItem,
  AppMenuRunActionParams,
} from '@kbn/core-chrome-app-menu-components';
import type { ReactElement } from 'react';

export enum AppMenuActionId {
  new = 'new',
  open = 'open',
  share = 'share',
  export = 'export',
  alerts = 'alerts',
  inspect = 'inspect',
  switchLanguageMode = 'switchLanguageMode',
  createRule = 'createRule',
  backgroundsearch = 'backgroundSearch',
  manageRulesAndConnectors = 'manageRulesAndConnectors',
}

/**
 * Discover-specific context that's always available in app menu run actions
 */
export interface DiscoverAppMenuContext extends Record<string, unknown> {
  onFinishAction: () => void;
}

/**
 * Typed params for Discover app menu actions with guaranteed context
 */
export interface DiscoverAppMenuRunActionParams extends AppMenuRunActionParams {
  context: DiscoverAppMenuContext;
}

/**
 * Discover-specific run action that always receives DiscoverAppMenuRunActionParams
 */
export type DiscoverAppMenuRunAction = (
  params: DiscoverAppMenuRunActionParams
) => void | Promise<void>;

/**
 * Discover-specific render action that returns content mounted by Discover.
 */
export type DiscoverAppMenuRenderAction = (
  params: DiscoverAppMenuRunActionParams
) => ReactElement | null;

/**
 * Replaces the core action/submenu union with Discover-specific action params.
 * The `never` fields keep `run`, `render`, and `items` mutually exclusive.
 */
type DiscoverAppMenuActionOrSubmenu =
  | {
      run: DiscoverAppMenuRunAction;
      render?: never;
      items?: never;
    }
  | {
      render: DiscoverAppMenuRenderAction;
      run?: never;
      items?: never;
    }
  | {
      run?: never;
      render?: never;
      items?: never;
    }
  | {
      items: DiscoverAppMenuPopoverItem[];
      run?: never;
      render?: never;
    };

type WithDiscoverAppMenuAction<BaseItem> = Omit<BaseItem, 'run' | 'items'> &
  DiscoverAppMenuActionOrSubmenu;

/**
 * Discover-specific popover item with typed run action and nested items
 */
export type DiscoverAppMenuPopoverItem = WithDiscoverAppMenuAction<AppMenuPopoverItem>;

/**
 * Discover-specific menu item type with typed run action and items
 */
export type DiscoverAppMenuItemType = WithDiscoverAppMenuAction<AppMenuItemType>;

/**
 * Discover-specific primary action item with typed run action
 */
export type DiscoverAppMenuPrimaryActionItem = WithDiscoverAppMenuAction<AppMenuPrimaryActionItem>;

/**
 * Discover-specific app menu config with typed menu items
 */
export interface DiscoverAppMenuConfig {
  items?: DiscoverAppMenuItemType[];
  primaryActionItem?: DiscoverAppMenuPrimaryActionItem;
}
