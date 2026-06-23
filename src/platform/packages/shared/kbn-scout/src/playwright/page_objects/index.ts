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
import { CopySavedObjectsToSpaceFlyout } from './copy_saved_objects_to_space_flyout';
import { DashboardApp } from './dashboard_app';
import { DataViewsManagementPage } from './data_views_management_page';
import { DashboardLinks } from './dashboard_links';
import { DataViewEditorPage } from './data_view_editor_page';
import { DatePicker } from './date_picker';
import { DiscoverApp } from './discover_app';
import { FilterBar } from './filter_bar';
import { MapsPage } from './maps_page';
import { QueryBar } from './query_bar';
import { RenderablePage } from './renderable_page';
import { SavedObjectsManagementPage } from './saved_objects_management_page';
import { SavedQueryManagementMenu } from './saved_query_management_menu';
import { Toasts } from './toasts';
import { createLazyPageObject } from './utils';
import { Inspector } from './inspector';
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
  CopySavedObjectsToSpaceFlyout,
  DataViewsManagementPage,
  ListingTable,
  SavedObjectsManagementPage,
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
  dataViewsManagement: DataViewsManagementPage;
  discover: DiscoverApp;
  dashboard: DashboardApp;
  dashboardLinks: DashboardLinks;
  dataViewEditor: DataViewEditorPage;
  filterBar: FilterBar;
  listingTable: ListingTable;
  home: HomePage;
  maps: MapsPage;
  queryBar: QueryBar;
  renderable: RenderablePage;
  savedObjectsManagement: SavedObjectsManagementPage;
  copySavedObjectsToSpaceFlyout: CopySavedObjectsToSpaceFlyout;
  savedQueryManagementMenu: SavedQueryManagementMenu;
  collapsibleNav: CollapsibleNav;
  toasts: Toasts;
  inspector: Inspector;
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
    dataViewEditor: createLazyPageObject(DataViewEditorPage, fixtures.page),
    dataViewsManagement: createLazyPageObject(DataViewsManagementPage, fixtures.page),
    dashboard: createLazyPageObject(DashboardApp, fixtures.page),
    dashboardLinks: createLazyPageObject(DashboardLinks, fixtures.page),
    discover: createLazyPageObject(DiscoverApp, fixtures.page),
    filterBar: createLazyPageObject(FilterBar, fixtures.page),
    listingTable: createLazyPageObject(ListingTable, fixtures.page),
    home: createLazyPageObject(HomePage, fixtures.page),
    maps: createLazyPageObject(MapsPage, fixtures.page),
    queryBar: createLazyPageObject(QueryBar, fixtures.page),
    renderable: createLazyPageObject(RenderablePage, fixtures.page),
    savedObjectsManagement: createLazyPageObject(
      SavedObjectsManagementPage,
      fixtures.page,
      fixtures.kbnUrl
    ),
    copySavedObjectsToSpaceFlyout: createLazyPageObject(
      CopySavedObjectsToSpaceFlyout,
      fixtures.page
    ),
    savedQueryManagementMenu: createLazyPageObject(SavedQueryManagementMenu, fixtures.page),
    collapsibleNav: createLazyPageObject(CollapsibleNav, fixtures.page, fixtures.config),
    toasts: createLazyPageObject(Toasts, fixtures.page),
    inspector: createLazyPageObject(Inspector, fixtures.page),
    lens: createLazyPageObject(LensApp, fixtures.page),
    login: createLazyPageObject(LoginPage, fixtures.page, fixtures.kbnUrl),
    overlays: createLazyPageObject(OverlaysPage, fixtures.page),
    visualize: createLazyPageObject(VisualizeApp, fixtures.page),
    unifiedFieldList: createLazyPageObject(UnifiedFieldList, fixtures.page),
    unifiedTabs: createLazyPageObject(UnifiedTabs, fixtures.page),
  };
}
