/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ControlPanelsState } from '@kbn/control-group-renderer';
import type { RefreshInterval, SerializedSearchSourceFields } from '@kbn/data-plugin/common';
import type { DataViewListItem } from '@kbn/data-views-plugin/public';
import type { DataTableColumnsMeta, DataTableRecord } from '@kbn/discover-utils';
import type { AggregateQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import type { ESQLEditorRestorableState } from '@kbn/esql-editor';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type {
  DiscoverGridSettings,
  DiscoverSession,
  VIEW_MODE,
} from '@kbn/saved-search-plugin/common';
import type { DataGridDensity, UnifiedDataTableRestorableState } from '@kbn/unified-data-table';
import type {
  UnifiedFieldListRestorableState,
  UnifiedFieldListSidebarContainerProps,
} from '@kbn/unified-field-list';
import type { UnifiedHistogramVisContext } from '@kbn/unified-histogram';
import type { RenderDocumentViewMeta } from '@kbn/unified-data-table';
import type { UnifiedMetricsGridRestorableState } from '@kbn/unified-chart-section-viewer';
import type { UnifiedSearchDraft } from '@kbn/unified-search-plugin/public';
import type { TabItem } from '@kbn/unified-tabs';
import type { DocViewerRestorableState } from '@kbn/unified-doc-viewer';
import type { SerializedError } from '@reduxjs/toolkit';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import type { DataCascadeRestorableState } from '@kbn/shared-ux-document-data-cascade';
import type { DiscoverDataSource } from '../../../../../common/data_sources';
import type { DiscoverLayoutRestorableState } from '../../components/layout/discover_layout_restorable_state';
import type { DefaultEsqlQueryConfig } from '../../../../context_awareness';
import type { CascadedDocumentsDataGridUiStateMap } from '../../components/layout/cascaded_documents';

export interface InternalStateDataRequestParams {
  timeRangeAbsolute: TimeRange | undefined;
  timeRangeRelative: TimeRange | undefined;
  searchSessionId: string | undefined;
  isSearchSessionRestored: boolean;
}

export interface TabStateGlobalState {
  timeRange?: TimeRange;
  refreshInterval?: RefreshInterval;
  filters?: Filter[];
}

export interface DiscoverAppState {
  /**
   * Columns displayed in the table
   */
  columns?: string[];
  /**
   * Array of applied filters
   */
  filters?: Filter[];
  /**
   * Data Grid related state
   */
  grid?: DiscoverGridSettings;
  /**
   * Hide chart
   */
  hideChart?: boolean;
  /**
   * Hide table
   */
  hideTable?: boolean;
  /**
   * The current data source
   */
  dataSource?: DiscoverDataSource;
  /**
   * Used interval of the histogram
   */
  interval?: string;
  /**
   * Lucence or KQL query
   */
  query?: Query | AggregateQuery;
  /**
   * Array of the used sorting [[field,direction],...]
   */
  sort?: string[][];
  /**
   * id of the used saved query
   */
  savedQuery?: string;
  /**
   * Table view: Documents vs Field Statistics
   */
  viewMode?: VIEW_MODE;
  /**
   * Hide mini distribution/preview charts when in Field Statistics mode
   */
  hideAggregatedPreview?: boolean;
  /**
   * Document explorer row height option
   */
  rowHeight?: number;
  /**
   * Document explorer header row height option
   */
  headerRowHeight?: number;
  /**
   * Number of rows in the grid per page
   */
  rowsPerPage?: number;
  /**
   * Custom sample size
   */
  sampleSize?: number;
  /**
   * Breakdown field of chart
   */
  breakdownField?: string;
  /**
   * Density of table
   */
  density?: DataGridDensity;
  /**
   * When true, ES|QL queries use approximate execution for faster, estimated results.
   * Intentionally URL-only and not persisted to saved sessions in v1 — this may need to
   * be reconsidered in a future version once the embedding story is clearer.
   */
  useApproximation?: boolean;
}

export interface CascadedDocumentsState {
  availableCascadeGroups: string[];
  selectedCascadeGroups: string[];
  columnsMeta: DataTableColumnsMeta;
  cascadedDocumentsMap: Record<string, DataTableRecord[] | undefined>;
}

export enum TabInitializationStatus {
  NotStarted = 'NotStarted',
  InProgress = 'InProgress',
  Complete = 'Complete',
  NoData = 'NoData',
  Disconnected = 'Disconnected',
  Error = 'Error',
}

export const DEFAULT_PROFILE_STATE_FIELDS = [
  'columns',
  'rowHeight',
  'breakdownField',
  'hideChart',
  'hideTable',
] as const;

export type DefaultProfileStateField = (typeof DEFAULT_PROFILE_STATE_FIELDS)[number];

type NonEmptyDefaultProfileStateFields = [DefaultProfileStateField, ...DefaultProfileStateField[]];

export type DefaultProfileStateFields = 'all' | 'none' | NonEmptyDefaultProfileStateFields;

export type ProfileStateSnapshot = Partial<Pick<DiscoverAppState, DefaultProfileStateField>>;

export type ProfileStateSnapshotsByProfileId = Record<string, ProfileStateSnapshot | undefined>;

export interface DefaultProfileState {
  resetId: string;
  fieldsToReset: DefaultProfileStateFields;
  snapshotsByProfileId: ProfileStateSnapshotsByProfileId;
}

// This is used to identify heavy state values (e.g. long lists of nested objects)
// that should be excluded from the Redux serializable/immutable checks to avoid
// rendering delays when using Discover in dev builds
export const HEAVY_STATE_KEYS = [
  'cascadedDocumentsState',
  'fieldListExistingFieldsInfo',
  'renderDocumentViewMeta',
];

export interface TabState extends TabItem {
  initializationState:
    | { initializationStatus: Exclude<TabInitializationStatus, TabInitializationStatus.Error> }
    | { initializationStatus: TabInitializationStatus.Error; error: Error | SerializedError };

  // Initial state for the tab (provided before the tab is initialized).
  initialInternalState?: {
    serializedSearchSource?: SerializedSearchSourceFields;
    searchSessionId?: string;
  };

  // Persistable attributes of the tab (stored in Discover Session and in local storage).
  attributes: {
    visContext: UnifiedHistogramVisContext | {} | undefined;
    controlGroupState: ControlPanelsState<OptionsListESQLControlState> | undefined;
    timeRestore: boolean;
  };

  // The following properties are used to manage the tab's state after it has been initialized.
  globalState: TabStateGlobalState;
  appState: DiscoverAppState;
  previousAppState: DiscoverAppState;
  cascadedDocumentsState: CascadedDocumentsState;
  esqlVariables: ESQLControlVariable[] | undefined;
  forceFetchOnSelect: boolean;
  isDataViewLoading: boolean;
  dataRequestParams: InternalStateDataRequestParams;
  overriddenVisContextAfterInvalidation: UnifiedHistogramVisContext | {} | undefined; // it will be used during saving of the Discover Session
  defaultProfileState: DefaultProfileState;
  profileState: Record<string, object | undefined>;
  uiState: {
    esqlEditor?: Partial<ESQLEditorRestorableState>;
    dataGrid?: Partial<UnifiedDataTableRestorableState>;
    fieldList?: Partial<UnifiedFieldListRestorableState>;
    fieldListExistingFieldsInfo?: UnifiedFieldListSidebarContainerProps['initialExistingFieldsInfo'];
    layout?: Partial<DiscoverLayoutRestorableState>;
    searchDraft?: Partial<UnifiedSearchDraft>;
    metricsGrid?: Partial<UnifiedMetricsGridRestorableState>;
    docViewer?: Partial<DocViewerRestorableState>;
    dataCascade?: DataCascadeRestorableState;
    cascadedDocumentsDataGridMap?: CascadedDocumentsDataGridUiStateMap;
  };
  expandedDoc: DataTableRecord | undefined;
  expandedDocOwner: string | undefined;
  renderDocumentViewMeta: RenderDocumentViewMeta | undefined;
  initialDocViewerTabId?: string;
}

export interface RecentlyClosedTabState extends TabState {
  closedAt: number;
}

export enum TabsBarVisibility {
  default = 'default',
  hidden = 'hidden',
}

export interface DiscoverInternalState {
  initializationState: { hasESData: boolean; hasUserDataView: boolean };
  userId: string | undefined;
  spaceId: string | undefined;
  persistedDiscoverSession: DiscoverSession | undefined;
  hasUnsavedChanges: boolean;
  savedDataViews: DataViewListItem[];
  defaultProfileAdHocDataViewIds: string[];
  defaultProfileEsqlQuery: DefaultEsqlQueryConfig | undefined;
  isESQLToDataViewTransitionModalVisible: boolean;
  tabsBarVisibility: TabsBarVisibility;
  tabs: {
    areInitializing: boolean;
    byId: Record<string, TabState>;
    allIds: string[];
    unsavedIds: string[];
    recentlyClosedTabsById: Record<string, RecentlyClosedTabState>;
    recentlyClosedTabIds: string[];
    /**
     * WARNING: You probably don't want to use this property.
     * This is used high in the component tree for managing tabs,
     * but is unsafe to use in actions and selectors since it can
     * change between renders and leak state between tabs.
     * Actions and selectors should use a tab ID parameter instead.
     */
    unsafeCurrentId: string;
  };
}

export interface UpdateESQLQueryActionPayload {
  tabId: string;
  queryOrUpdater: string | ((prevQuery: string) => string);
}
