/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { AppHeader, AppHeaderView } from './app_header';
export type { AppHeaderProps, AppHeaderViewProps } from './app_header';
export { ChromeAppHeaderRegistration, useChromeAppHeaderRegistration } from './app_header';
export { APP_HEADER_TEST_SUBJECTS } from './app_header/test_subjects';
export {
  APP_MENU_TEST_SUBJECTS,
  getAppMenuItemTestSubj,
  getAppMenuActionButtonTestSubj,
} from '@kbn/core-chrome-app-menu-components';
export type {
  AppHeaderBack,
  AppHeaderBadge,
  AppHeaderBadgeItem,
  AppHeaderTab,
  AppHeaderTabBadge,
  AppHeaderTabIconBadge,
  AppHeaderEditableTitle,
  AppHeaderMetadataButtonItem,
  AppHeaderMetadataHealthItem,
  AppHeaderMetadataItem,
  AppHeaderMetadataItems,
  AppHeaderMetadataTextItem,
  AppHeaderMenu,
  AppHeaderPadding,
  AppHeaderConfig,
  AppHeaderTitle,
  AppHeaderTitleSaveResult,
} from './types';
