/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginInitializerContext } from '@kbn/core/public';

import { DashboardPlugin } from './plugin';
export { DASHBOARD_GRID_COLUMN_COUNT } from '../common/page_bundle_constants';
export type {
  DashboardApi,
  DashboardInternalApi,
  DashboardCreationOptions,
  DashboardSaveEvent,
  DashboardInitializationState,
} from './dashboard_api/types';
export { DASHBOARD_API_TYPE } from './dashboard_api/types';
export type { DashboardRendererProps } from './dashboard_renderer/dashboard_renderer';
export { LazyDashboardRenderer as DashboardRenderer } from './dashboard_renderer/lazy_dashboard_renderer';
export type { DashboardStart, DashboardSetup } from './plugin';
export type { DashboardListingTab } from './dashboard_listing/types';

export { DashboardListingTable } from './dashboard_listing';
export { DashboardTopNav } from './dashboard_top_nav';
export type { RedirectToProps } from './dashboard_app/types';
export {
  RECENTLY_ACCESSED_DASHBOARDS_EXTENSION_ID,
  createRecentItemsData$,
} from './dashboard_nav_extensions/extensions';

export type { FindDashboardsByIdResponse } from './dashboard_client';

export { DASHBOARD_APP_ID } from '../common/page_bundle_constants';
export { cleanEmptyKeys, DashboardAppLocatorDefinition } from '../common/locator/locator';

export function plugin(initializerContext: PluginInitializerContext) {
  return new DashboardPlugin(initializerContext);
}
