/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import { createContext, useContext } from 'react';

export interface ExpandableContextMenuPanelContextValue {
  openPanel: (panel: React.ReactNode, title?: React.ReactNode) => void;
  closePanel: () => void;
}

const ExpandableContextMenuPanelContext = createContext<
  ExpandableContextMenuPanelContextValue | undefined
>(undefined);

export const ExpandableContextMenuPanelProvider = ExpandableContextMenuPanelContext.Provider;

/** Returns the expandable context menu panel context if available, or undefined otherwise. */
export const useExpandableContextMenuPanel = ():
  | ExpandableContextMenuPanelContextValue
  | undefined => useContext(ExpandableContextMenuPanelContext);
