/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
export const VISUALIZATION_CONTEXT_MENU_TRIGGER = 'VISUALIZATION_CONTEXT_MENU_TRIGGER';
export const DEFAULT_ACTIONS = ['inspect', 'addToCase', 'saveToLibrary', 'openInLens'];
export const MOCK_ACTIONS = [
  {
    id: 'inspect',
    getDisplayName: () => 'Inspect',
    getIconType: () => 'inspect',
    type: 'actionButton',
    order: 3,
    isCompatible: () => true,
    execute: jest.fn(),
  },
  {
    id: 'addToCase',
    getDisplayName: () => 'Add to case',
    getIconType: () => 'casesApp',
    type: 'actionButton',
    order: 2,
    isCompatible: () => true,
    execute: jest.fn(),
  },
  {
    id: 'saveToLibrary',
    getDisplayName: () => 'Added to library',
    getIconType: () => 'save',
    type: 'actionButton',
    order: 1,
    isCompatible: () => true,
    execute: jest.fn(),
  },
  {
    id: 'openInLens',
    getDisplayName: () => 'Open in Lens',
    getIconType: () => 'chartArea',
    type: 'actionButton',
    order: 0,
    isCompatible: () => true,
    execute: jest.fn(),
  },
];
export const useActions = jest.fn().mockReturnValue(MOCK_ACTIONS);
