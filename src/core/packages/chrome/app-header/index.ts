/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { AppHeader } from './src';
export { AppHeaderView, ChromeAppHeaderRegistration, useChromeAppHeaderRegistration } from './src';
export {
  APP_HEADER_TEST_SUBJECTS,
  APP_MENU_TEST_SUBJECTS,
  getAppMenuItemTestSubj,
  getAppMenuActionButtonTestSubj,
} from './src';
export type { AppHeaderViewProps, AppHeaderConfig } from './src';
export type {
  AppHeaderProps,
  AppHeaderBack,
  AppHeaderBadge,
  AppHeaderBadgeItem,
  AppHeaderTab,
  AppHeaderEditableTitle,
  AppHeaderMetadataButtonItem,
  AppHeaderMetadataHealthItem,
  AppHeaderMetadataItem,
  AppHeaderMetadataItems,
  AppHeaderMetadataTextItem,
  AppHeaderMenu,
  AppHeaderPadding,
  AppHeaderTitle,
  AppHeaderTitleSaveResult,
} from './src';
