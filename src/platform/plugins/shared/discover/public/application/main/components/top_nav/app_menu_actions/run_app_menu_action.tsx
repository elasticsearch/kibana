/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type {
  AppMenuItemType,
  AppMenuPopoverItem,
  AppMenuPrimaryActionItem,
  AppMenuRunActionParams,
} from '@kbn/core-chrome-app-menu-components';
import type {
  DiscoverAppMenuItemType,
  DiscoverAppMenuPopoverItem,
  DiscoverAppMenuPrimaryActionItem,
  DiscoverAppMenuRunActionParams,
} from '@kbn/discover-utils';
import type { DiscoverServices } from '../../../../../build_services';

const container = document.createElement('div');
let isOpen = false;
let currentReturnFocus: (() => void) | undefined;

function cleanup() {
  if (!isOpen) {
    return;
  }

  ReactDOM.unmountComponentAtNode(container);
  document.body.removeChild(container);
  isOpen = false;

  currentReturnFocus?.();
  currentReturnFocus = undefined;
}

export async function runAppMenuAction({
  appMenuItem,
  anchorElement,
  services,
  returnFocus,
}: {
  appMenuItem:
    | DiscoverAppMenuItemType
    | DiscoverAppMenuPrimaryActionItem
    | DiscoverAppMenuPopoverItem;
  anchorElement: HTMLElement;
  services: DiscoverServices;
  returnFocus: () => void;
}) {
  cleanup();
  currentReturnFocus = returnFocus;

  const onFinishAction = () => {
    if (isOpen) {
      cleanup();
    } else {
      returnFocus();
    }
  };

  const params: DiscoverAppMenuRunActionParams = {
    triggerElement: anchorElement,
    returnFocus,
    context: {
      onFinishAction,
    },
  };

  if (appMenuItem.run) {
    await appMenuItem.run(params);
    return;
  }

  const result = appMenuItem.render?.(params);

  if (!result || !React.isValidElement(result)) {
    return;
  }

  isOpen = true;
  document.body.appendChild(container);

  const element = (
    <KibanaRenderContextProvider {...services.core}>
      <KibanaContextProvider services={services}>{result}</KibanaContextProvider>
    </KibanaRenderContextProvider>
  );
  ReactDOM.render(element, container);
}

/**
 * Maps Discover-specific menu item types to their corresponding base AppMenu types.
 */
type EnhancedAppMenuItem<T> = T extends DiscoverAppMenuItemType
  ? AppMenuItemType
  : T extends DiscoverAppMenuPrimaryActionItem
  ? AppMenuPrimaryActionItem
  : T extends DiscoverAppMenuPopoverItem
  ? AppMenuPopoverItem
  : never;

type DiscoverAppMenuItem =
  | DiscoverAppMenuItemType
  | DiscoverAppMenuPrimaryActionItem
  | DiscoverAppMenuPopoverItem;

/**
 * Transforms Discover-specific menu items into base AppMenu types by replacing
 * the run action with one that wraps the Discover-specific behavior.
 * This allows the items to be used with the core AppMenu component.
 */
export function enhanceAppMenuItemWithRunAction<T extends DiscoverAppMenuItem>({
  appMenuItem,
  services,
}: {
  appMenuItem: T;
  services: DiscoverServices;
}): EnhancedAppMenuItem<T> {
  const { render, ...baseAppMenuItem } = appMenuItem;
  const enhancedRun =
    appMenuItem.run || render
      ? (params?: AppMenuRunActionParams) => {
          if (params) {
            runAppMenuAction({
              appMenuItem,
              anchorElement: params.triggerElement,
              services,
              returnFocus: params.returnFocus,
            });
          }
        }
      : undefined;

  const enhancedItems =
    'items' in appMenuItem && Array.isArray(appMenuItem.items)
      ? appMenuItem.items.map(
          (nestedItem): AppMenuPopoverItem =>
            enhanceAppMenuItemWithRunAction({
              appMenuItem: nestedItem,
              services,
            })
        )
      : undefined;

  return {
    ...baseAppMenuItem,
    items: enhancedItems,
    run: enhancedRun,
  } as unknown as EnhancedAppMenuItem<T>;
}
