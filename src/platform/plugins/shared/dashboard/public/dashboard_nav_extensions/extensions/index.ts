/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { NavExtensionEntry } from '@kbn/core-chrome-browser';

import {
  RECENTLY_ACCESSED_DASHBOARDS_EXTENSION_ID,
  recentlyAccessedNavExtensionDefinition,
  createRecentItemsData$,
  type RecentItemRow,
} from './recently_accessed';

export {
  RECENTLY_ACCESSED_DASHBOARDS_EXTENSION_ID,
  recentlyAccessedNavExtensionDefinition,
  createRecentItemsData$,
};

/**
 * Register navigation extensions provided by the dashboard plugin to the registry in core Chrome browser
 * so consumers of the dashboard plugin get type suggestions when attempting
 * to define an extension node in their navigation trees.
 */
declare module '@kbn/core-chrome-browser' {
  interface NavExtensionRegistry {
    [RECENTLY_ACCESSED_DASHBOARDS_EXTENSION_ID]: NavExtensionEntry<RecentItemRow[]>;
  }
}
