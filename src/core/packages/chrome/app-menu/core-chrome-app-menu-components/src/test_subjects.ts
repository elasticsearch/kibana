/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Structural `data-test-subj` values the app menu renders by default, shared between the components
 * and test consumers to prevent drift. Subjects derived from a caller-provided `testId`/`id` use the
 * helpers below.
 */
export const APP_MENU_TEST_SUBJECTS = {
  root: 'app-menu',
  overflowButton: 'app-menu-overflow-button',
  popover: 'app-menu-popover',
  switch: 'app-menu-switch',
  popoverActionButtonsContainer: 'app-menu-popover-action-buttons-container',
  notificationIndicator: 'split-button-notification-indicator',
} as const;

/** Default `data-test-subj` for a menu item without an explicit `testId`. */
export const getAppMenuItemTestSubj = (id: string): string => `app-menu-item-${id}`;

/** Default `data-test-subj` for an action button without an explicit `testId`. */
export const getAppMenuActionButtonTestSubj = (id: string): string =>
  `app-menu-action-button-${id}`;
