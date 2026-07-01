/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const SERVICE_FLYOUT_EBT_ELEMENTS = {
  TITLE: 'serviceFlyoutTitle',
  ALERTS_BADGE: 'serviceFlyoutAlertsBadge',
  SLO_BADGE: 'serviceFlyoutSloBadge',
  ACTIONS_MENU: 'serviceFlyoutActionsMenu',
  TABS: 'serviceFlyoutTabs',
} as const;

export const SERVICE_FLYOUT_EBT_ACTIONS = {
  VIEW_TAB: 'viewServiceFlyoutTab',
} as const;
