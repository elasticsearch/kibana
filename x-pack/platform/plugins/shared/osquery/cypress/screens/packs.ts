/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ADD_PACK_HEADER_BUTTON = 'add-pack-button';
export const SAVE_PACK_BUTTON = 'save-pack-button';
export const UPDATE_PACK_BUTTON = 'update-pack-button';

export const ADD_QUERY_BUTTON = 'add-query-button';
export const UPDATE_QUERY_BUTTON = 'update-query-button';

export const FLYOUT_SAVED_QUERY_SAVE_BUTTON = 'query-flyout-save-button';
export const FLYOUT_SAVED_QUERY_CANCEL_BUTTON = 'query-flyout-cancel-button';

export const customActionEditSavedQuerySelector = (savedQueryName: string) =>
  `[aria-label="Edit ${savedQueryName}"]`;

export const rowActionsMenuSelector = (itemName: string) =>
  `[aria-label="Actions for ${itemName}"]`;

export const customActionRunSavedQuerySelector = (savedQueryName: string) =>
  `[aria-label="Run ${savedQueryName}"]`;

export const formFieldInputSelector = (fieldName: string) => `input[name="${fieldName}"]`;
export const activeStateSwitchComponentSelector = (packName: string) =>
  `[aria-label="${packName}"]`;

export const POLICY_SELECT_COMBOBOX = 'policyIdsComboBox';
export const SAVED_QUERY_DROPDOWN_SELECT = 'savedQuerySelect';

export const TABLE_ROWS = 'tbody > tr';
