/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { NavTreeExtensionSlotDataSources } from './nav_extensions';
import type { NavigationTreeDefinition } from './project_navigation';

const tree = {
  body: [
    {
      link: 'dashboards',
      icon: 'productDashboard',
      renderAs: 'panelOpener',
      children: [
        {
          id: 'recent-dashboards',
          title: 'Recently viewed',
          renderAs: 'extension',
          slotId: 'recentDashboards',
          extensionId: 'recentlyAccessedDashboards',
          popoverOnly: true,
        },
      ],
    },
  ],
} as const satisfies NavigationTreeDefinition;

/**
 * This is a type-level assertion to verify that the type that extracts extension slots works consistently
 */
type Assert<T extends true> = T;
type Tree = typeof tree;
type ExpectSlotKey = 'recentDashboards' extends keyof NavTreeExtensionSlotDataSources<Tree>
  ? true
  : false;

export type NavExtensionSlotsTypeChecks = Assert<ExpectSlotKey>;
