/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createContext, useContext } from 'react';

export interface PanelSettingsToolbarAction {
  onOpen: () => void;
  label: string;
}

export const PanelSettingsToolbarContext = createContext<PanelSettingsToolbarAction | null>(null);

export const usePanelSettingsToolbarAction = (): PanelSettingsToolbarAction | null =>
  useContext(PanelSettingsToolbarContext);
