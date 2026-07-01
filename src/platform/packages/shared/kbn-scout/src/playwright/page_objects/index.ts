/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import type { ScoutLogger } from '../../common';
import type { ScoutTestConfig } from '../../types';
import { CollapsibleNav } from './collapsible_nav';
import { DashboardApp } from './dashboard_app';
import { DataGrid } from './data_grid';
import { DataViewsManagementPage } from './data_views_management_page';
import { DatePicker } from './date_picker';
import { DiscoverApp } from './discover_app';
import { FilterBar } from './filter_bar';
import { MapsPage } from './maps_page';
import { QueryBar } from './query_bar';
import { RenderablePage } from './renderable_page';
import { Toasts } from './toasts';
import { createLazyPageObject } from './utils';
import { LensApp } from './lens_app';
import { ListingTable } from './listing_table';
import { LoginPage } from './login_page';
import { HomePage } from './home_page';
import { OverlaysPage } from './overlays';
import { VisualizeApp } from './visualize_app';
import { UnifiedFieldList } from './unified_field_list';
import { UnifiedTabs } from './unified_tabs';
import {
  ContentListWrapper,
  buildContentListSearch,
  buildContentListUrlRegex,
} from './content_list';
import type { ContentListUrlState } from './content_list';
import type { KibanaUrl } from '../../common/services/kibana_url';

export {
  ContentListWrapper,
  DataGrid,
  DataViewsManagementPage,
  ListingTable,
  buildContentListSearch,
  buildContentListUrlRegex,
};
export type { ContentListUrlState };

export interface PageObjectsFixtures {
  page: ScoutPage;
  config: ScoutTestConfig;
  log: ScoutLogger;
  kbnUrl: KibanaUrl;
}

export interface PageObjects {
  datePicker: DatePicker;
  dataGrid: DataGrid;
  dataViewsManagement: DataViewsManagementPage;
  discover: DiscoverApp;
  dashboard: DashboardApp;
  filterBar: FilterBar;
  listingTable: ListingTable;
  home: HomePage;
  maps: MapsPage;
  queryBar: QueryBar;
  renderable: RenderablePage;
  collapsibleNav: CollapsibleNav;
  toasts: Toasts;
  lens: LensApp;
  login: LoginPage;
  overlays: OverlaysPage;
  visualize: VisualizeApp;
  unifiedFieldList: UnifiedFieldList;
  unifiedTabs: UnifiedTabs;
}

/**
 * Creates a set of core page objects, each lazily instantiated on first access.
 *
 * @param page - `ScoutPage` instance used for initializing page objects.
 * @returns An object containing lazy-loaded core page objects.
 */
export function createCorePageObjects(fixtures: PageObjectsFixtures): PageObjects {
  return {
    datePicker: createLazyPageObject(DatePicker, fixtures.page),
    dataGrid: createLazyPageObject(DataGrid, fixtures.page),
    dataViewsManagement: createLazyPageObject(DataViewsManagementPage, fixtures.page),
    dashboard: createLazyPageObject(DashboardApp, fixtures.page),
    discover: createLazyPageObject(DiscoverApp, fixtures.page),
    filterBar: createLazyPageObject(FilterBar, fixtures.page),
    listingTable: createLazyPageObject(ListingTable, fixtures.page),
    home: createLazyPageObject(HomePage, fixtures.page),
    maps: createLazyPageObject(MapsPage, fixtures.page),
    queryBar: createLazyPageObject(QueryBar, fixtures.page),
    renderable: createLazyPageObject(RenderablePage, fixtures.page),
    collapsibleNav: createLazyPageObject(CollapsibleNav, fixtures.page, fixtures.config),
    toasts: createLazyPageObject(Toasts, fixtures.page),
    lens: createLazyPageObject(LensApp, fixtures.page),
    login: createLazyPageObject(LoginPage, fixtures.page, fixtures.kbnUrl),
    overlays: createLazyPageObject(OverlaysPage, fixtures.page),
    visualize: createLazyPageObject(VisualizeApp, fixtures.page),
    unifiedFieldList: createLazyPageObject(UnifiedFieldList, fixtures.page),
    unifiedTabs: createLazyPageObject(UnifiedTabs, fixtures.page),
  };
}
