/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import type { AutocompleteStart, KqlPluginStart } from '@kbn/kql/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type { ScreenshotModePluginStart } from '@kbn/screenshot-mode-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { UiActionsSetup, UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type {
  UsageCollectionSetup,
  UsageCollectionStart,
} from '@kbn/usage-collection-plugin/public';
import type { Query, AggregateQuery } from '@kbn/es-query';
import type { CoreStart, DocLinksStart } from '@kbn/core/public';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import type { SavedObjectsManagementPluginStart } from '@kbn/saved-objects-management-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { IndexPatternSelectProps, StatefulSearchBarProps } from '.';
import type { FiltersBuilderProps } from './filters_builder/filters_builder';
import type { StatefulSearchBarDeps } from './search_bar/create_search_bar';

export interface UnifiedSearchDraft {
  query?: AggregateQuery | Query;
  dateRangeFrom?: string;
  dateRangeTo?: string;
}

export interface UnifiedSearchSetupDependencies {
  uiActions: UiActionsSetup;
  data: DataPublicPluginStart;
  usageCollection?: UsageCollectionSetup;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UnifiedSearchPluginSetup {}

export interface UnifiedSearchStartDependencies {
  dataViews: DataViewsPublicPluginStart;
  fieldFormats: FieldFormatsStart;
  data: DataPublicPluginStart;
  uiActions: UiActionsStart;
  screenshotMode?: ScreenshotModePluginStart;
  cps: CPSPluginStart;
  kql: KqlPluginStart;
}

type AggQuerySearchBarComp = <QT extends Query | AggregateQuery = Query>(
  props: StatefulSearchBarProps<QT>
) => React.ReactElement;

/**
 * Unified search plugin prewired UI components
 */
export interface UnifiedSearchPublicPluginStartUi {
  IndexPatternSelect: React.ComponentType<IndexPatternSelectProps>;
  getCustomSearchBar: (customDataService?: StatefulSearchBarDeps['data']) => AggQuerySearchBarComp;
  SearchBar: (props: StatefulSearchBarProps<Query>) => React.ReactElement;
  AggregateQuerySearchBar: AggQuerySearchBarComp;
  FiltersBuilderLazy: React.ComponentType<FiltersBuilderProps>;
}

/**
 * Unified search plugin public Start contract
 */
export interface UnifiedSearchPublicPluginStart {
  /**
   * prewired UI components
   * {@link UnifiedSearchPublicPluginStartUi}
   */
  ui: UnifiedSearchPublicPluginStartUi;
}

/**
 * Filter options from Unified Search menu panels
 */
export type FilterPanelOption =
  | 'pinFilter'
  | 'editFilter'
  | 'negateFilter'
  | 'disableFilter'
  | 'deleteFilter';

export interface IUnifiedSearchPluginServices extends Partial<CoreStart> {
  kql: {
    autocomplete: AutocompleteStart;
  };
  appName: string;
  chrome: CoreStart['chrome'];
  uiSettings: CoreStart['uiSettings'];
  notifications: CoreStart['notifications'];
  application: CoreStart['application'];
  http: CoreStart['http'];
  analytics: CoreStart['analytics'];
  i18n: CoreStart['i18n'];
  theme: CoreStart['theme'];
  userProfile: CoreStart['userProfile'];
  userStorage: CoreStart['userStorage'];
  storage: IStorageWrapper;
  docLinks: DocLinksStart;
  data: DataPublicPluginStart;
  dataViews: DataViewsPublicPluginStart;
  dataViewEditor: DataViewEditorStart;
  usageCollection?: UsageCollectionStart;
  savedObjectsManagement: SavedObjectsManagementPluginStart;
  cps: CPSPluginStart;
}
