/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { NavigationCustomization } from '@kbn/core-chrome-browser';
import { CustomizeNavigationModal } from './components/customize_navigation_modal';
import type { NavigationItemInfo } from './types';

export interface OpenCustomizeNavigationModalDeps {
  items: NavigationItemInfo[];
  defaultItemIds: string[];
  /**
   * Injected by the caller (navigation plugin) to avoid importing
   * `@kbn/core-chrome-navigation-customization` from this shared package — the
   * caller lazy-loads it alongside this module.
   */
  computeMoves: (
    defaultOrder: readonly string[],
    userOrder: readonly string[]
  ) => NavigationCustomization['moves'];
  onChange: (customization: NavigationCustomization) => void;
  onSave: (customization: NavigationCustomization, order: string[], hiddenIds: string[]) => void;
  onReset: () => Promise<NavigationItemInfo[]>;
  onClose: () => void;
  /**
   * Caller-supplied mount function that handles `toMountPoint`,
   * `core.rendering.addContext`, and `core.overlays.openModal`.
   * Called synchronously so the caller can capture the overlay ref for closing.
   */
  mountModal: (element: React.ReactElement) => void;
}

/**
 * Assembles the `CustomizeNavigationModal` element and mounts it via the
 * caller-supplied `mountModal`. All chrome / core / userStorage interactions
 * are expressed as plain callbacks so this function has no platform imports.
 */
export const openCustomizeNavigationModal = ({
  items,
  defaultItemIds,
  computeMoves,
  onChange,
  onSave,
  onReset,
  onClose,
  mountModal,
}: OpenCustomizeNavigationModalDeps): void => {
  const toCustomization = (order: string[], hiddenIds: string[]): NavigationCustomization => ({
    moves: computeMoves(defaultItemIds, order),
    hidden: hiddenIds as NavigationCustomization['hidden'],
  });

  mountModal(
    React.createElement(CustomizeNavigationModal, {
      items,
      onChange: (order, hiddenIds) => onChange(toCustomization(order, hiddenIds)),
      onSave: (order, hiddenIds) => onSave(toCustomization(order, hiddenIds), order, hiddenIds),
      onReset,
      onClose,
    })
  );
};
