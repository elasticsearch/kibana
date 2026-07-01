/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView, DataViewField, DataViewSpec } from '@kbn/data-views-plugin/common';
import type {
  CustomCellRenderer,
  DataGridDensity,
  UnifiedDataTableProps,
  DataGridPaginationMode,
  CustomGridColumnsConfiguration,
} from '@kbn/unified-data-table';
import type { DocViewsRegistry } from '@kbn/unified-doc-viewer';
import type { AppMenuRegistry, DataTableRecord } from '@kbn/discover-utils';
import type { CellAction, CellActionExecutionContext, CellActionsData } from '@kbn/cell-actions';
import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import type { AggregateQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import type { OmitIndexSignature } from 'type-fest';
import type { DocViewRenderProps } from '@kbn/unified-doc-viewer/types';
import type {
  ChartSectionProps,
  UnifiedHistogramTopPanelHeightContext,
} from '@kbn/unified-histogram/types';
import type { TypedLensByValueInput } from '@kbn/lens-plugin/public';
import type { RestorableStateProviderProps } from '@kbn/restorable-state';
import type { DiscoverDataSource } from '../../common/data_sources';
import type { DiscoverAppState } from '../application/main/state_management/redux';

export type UpdateESQLQueryFn = (queryOrUpdater: string | ((prevQuery: string) => string)) => void;

/**
 * Supports extending the Discover app menu
 */
export interface AppMenuExtension {
  /**
   * Supports extending the app menu with additional actions
   * @param prevRegistry The app menu registry
   * @returns The updated app menu registry
   */
  appMenuRegistry: (prevRegistry: AppMenuRegistry) => AppMenuRegistry;
}

/**
 * Supports extending the Pagination Config in Discover
 */
export interface PaginationConfigExtension {
  /**
   * Supports customizing the pagination mode in Discover
   * @returns paginationMode - which mode to use for loading Pagination toolbar
   */
  paginationMode: DataGridPaginationMode;
}

/**
 * Support exposing additional fields for the Field List API
 */

export interface FieldListExtension {
  /**
   * Adds additional fields to the field list
   * @param recommendedFields The field list
   * @returns The updated field list
   */
  recommendedFields: Array<DataViewField['name']>;
}

/**
 * Parameters passed to the app menu extension
 */
export interface AppMenuExtensionParams {
  /**
   * True if Discover is in ESQL mode
   */
  isEsqlMode: boolean;
  /**
   * The current data view
   */
  dataView: DataView | undefined;
  /**
   * The available ad hoc data views
   */
  adHocDataViews: DataView[];
  /**
   * The authorized alerting rule type IDs for the current user
   */
  authorizedRuleTypeIds: string[];
}

/**
 * Parameters passed to the open in new tab action
 */
export interface OpenInNewTabParams {
  /**
   * The query to open in the new tab
   */
  query?: Query | AggregateQuery;
  /**
   * The label of the new tab
   */
  tabLabel?: string;
  /**
   * The time range to open in the new tab
   */
  timeRange?: TimeRange;
}

/**
 * Supports customizing the chart (UnifiedHistogram) section in Discover
 */
export type ChartSectionConfiguration<T extends object = object> =
  | {
      /**
       * The render function for the chart section
       */
      renderChartSection: (
        props: ChartSectionProps & RestorableStateProviderProps<T>
      ) => React.ReactElement;
      /**
       * Controls whether or not to replace the default histogram and activate the custom chart
       */
      replaceDefaultChart: true;
      /**
       * Prefix for the local storage key used to store the chart section state, when not set, it will use the default Discover key
       */
      localStorageKeyPrefix?: string;
      /**
       * The default chart section height
       */
      defaultTopPanelHeight?: UnifiedHistogramTopPanelHeightContext;
    }
  | {
      replaceDefaultChart: false;
    };

/**
 * Supports customizing the Discover document viewer flyout
 */
export interface DocViewerExtension {
  /**
   * Title displayed in the flyout header
   */
  title: string | undefined;
  /**
   * Supports modifying existing tabs or adding new tabs to the flyout
   * @param prevRegistry The doc views registry
   * @returns The updated doc views registry
   */
  docViewsRegistry: (prevRegistry: DocViewsRegistry) => DocViewsRegistry;
  /**
   * Optional render function to display a custom header section above the tabs
   * @param props The doc view render props
   * @returns A React element to render above the tabs
   */
  renderHeader?: (props: DocViewRenderProps) => React.ReactElement;
  /**
   * Optional render function to display a custom footer section at the bottom of the flyout.
   * The footer is always visible while scrolling through the flyout content.
   * @param props The doc view render props
   * @returns A React element to render at the bottom of the flyout
   */
  renderFooter?: (props: DocViewRenderProps) => React.ReactElement;
}

/**
 * Parameters passed to the doc viewer extension
 */
export interface DocViewerExtensionParams {
  /**
   * The record being displayed in the doc viewer
   */
  record: DataTableRecord;
}

/**
 * Parameters passed to the row indicator extension
 */
export interface RowIndicatorExtensionParams {
  /**
   * The current data view
   */
  dataView: DataView;
}

/**
 * Default data grid column configuration
 */
export interface DefaultAppStateColumn {
  /**
   * The field name of the column
   */
  name: string;
  /**
   * The width of the column in pixels -- leave undefined for auto width
   */
  width?: number;
}

/**
 * Parameters passed to the default app state extension
 */
export interface DefaultAppStateExtensionParams {
  /**
   * The current data view
   */
  dataView: DataView;
}

/**
 * Supports customizing the default Discover application state
 */
export interface DefaultAppStateExtension {
  /**
   * The columns to display in the data grid
   */
  columns?: DefaultAppStateColumn[];
  /**
   * The height of each row in the data grid:
   * * -1: auto height mode
   * * 0: single line mode
   * * 1-20: number of lines to display
   */
  rowHeight?: number;
  /**
   * The field to apply for the histogram breakdown
   */
  breakdownField?: string;
  /**
   * The state for chart visibility toggle
   */
  hideChart?: boolean;
  /**
   * The state for data table visibility toggle
   */
  hideTable?: boolean;
  /**
   * The state for field list sidebar visibility toggle
   */
  hideSidebar?: boolean;
}

/**
 * Supports setting a default ES|QL query when Discover starts in ES|QL mode
 */
export interface DefaultEsqlQueryConfig {
  /**
   * The ES|QL query string to use as the default
   */
  query: string;
}

/**
 * Parameters passed to the modified vis attributes extension
 */
export interface ModifiedVisAttributesExtensionParams {
  /**
   * The vis attributes to modify
   */
  attributes: TypedLensByValueInput['attributes'];
}

/**
 * Parameters passed to the cell renderers extension
 */
export interface CellRenderersExtensionParams {
  /**
   * The current data view
   */
  dataView: DataView;
  /**
   * The current density applied to the data grid component
   */
  density: DataGridDensity | undefined;
  /**
   * The current row height mode applied to the data grid component
   */
  rowHeight: number | undefined;
}

/**
 * Parameters passed to the row controls extension
 */
export interface RowControlsExtensionParams {
  /**
   * The current data view
   */
  dataView: DataView;
  /**
   * The current query
   */
  query?: DiscoverAppState['query'];
}

/**
 * Metadata passed to Discover cell actions
 */
export interface DiscoverCellActionMetadata extends Record<string, unknown> {
  /**
   * The Discover instance ID (distinct for each dashboard panel)
   */
  instanceId?: string;
  /**
   * The current data source (ES|QL or data view)
   */
  dataSource?: DiscoverDataSource;
  /**
   * The current data view
   */
  dataView?: DataView;
  /**
   * The current query
   */
  query?: Query | AggregateQuery;
  /**
   * The current filters
   */
  filters?: Filter[];
  /**
   * The current time range
   */
  timeRange?: TimeRange;
}

export interface DiscoverCellActionExecutionContext extends CellActionExecutionContext {
  metadata: DiscoverCellActionMetadata | undefined;
}

export type DiscoverCellAction = CellAction<DiscoverCellActionExecutionContext>;

/**
 * Context object passed to additional cell action methods
 */
export type AdditionalCellActionContext = CellActionsData &
  Omit<OmitIndexSignature<DiscoverCellActionMetadata>, 'instanceId'>;

/**
 * Additional action to show within expanded cell popovers in the data grid
 */
export interface AdditionalCellAction {
  /**
   * Unique ID for the action
   */
  id: string;
  /**
   * Gets the display name for the action, used for button text
   * @param context Current cell action context
   * @returns The action display name
   */
  getDisplayName: (context: AdditionalCellActionContext) => string;
  /**
   * Gets the icon type for the action, used for button icon
   * @param context Current cell action context
   * @returns The action icon type
   */
  getIconType: (context: AdditionalCellActionContext) => EuiIconType;
  /**
   * Checks if the action is compatible with the current cell
   * @param context The current cell action context
   * @returns `true` if the action is compatible, `false` otherwise
   */
  isCompatible?: (
    context: Omit<AdditionalCellActionContext, 'value'>
  ) => boolean | Promise<boolean>;
  /**
   * The action to execute when the button is clicked
   * @param context The current cell action context
   */
  execute: (context: AdditionalCellActionContext) => void | Promise<void>;
}

/**
 * Parameters passed to the deep-analysis playbook extension
 */
export interface DeepAnalysisPlaybookExtensionParams {
  /**
   * The current data view, if any
   */
  dataView: DataView | undefined;
  /**
   * The current query
   */
  query: AggregateQuery | Query | undefined;
  /**
   * The columns of the current ES|QL query result, if any
   */
  columns?: Array<{ name: string; type?: string }>;
}

/**
 * A per-shape contribution to the agent-builder deep-analysis playbook.
 * Returning `undefined` means "no contribution" — the server playbook
 * falls back to inferring analysis strategy from column names and types.
 */
export interface DeepAnalysisPlaybookExtension {
  /**
   * Stable shape identifier, e.g. 'logs' | 'traces' | 'metrics'
   */
  shapeId: string;
  /**
   * Human-readable shape label, e.g. "Application & infrastructure logs"
   */
  shapeLabel: string;
  /**
   * Field names that characterize this shape. Intersected against the
   * actual attachment columns server-side so the agent never sees
   * fields that don't exist in the result.
   */
  characteristicFields: string[];
  /**
   * Short guidance (≤600 chars) describing what "deep analysis" means for
   * this shape — what to group by, what to avoid, what's interesting.
   */
  guidance: string;
  /**
   * Optional short bullets (≤5 entries) to seed the Drill-Down Queries section.
   */
  interestingSignals?: string[];
}

/**
 * The core profile interface for Discover context awareness.
 * Each of the available methods map to a specific extension point in the Discover application.
 */
export interface Profile {
  /**
   * Lifecycle
   */

  /**
   * Gets default Discover app state that should be used when the profile is resolved
   * @param params The default app state extension parameters
   * @returns The default app state
   */
  getDefaultAppState: (params: DefaultAppStateExtensionParams) => DefaultAppStateExtension;

  /**
   * Gets an array of default ad hoc data views to display in the data view picker (e.g. "All logs").
   * The returned specs must include consistent IDs across resolutions for Discover to manage them correctly.
   * @returns The default data views to display in the data view picker
   */
  getDefaultAdHocDataViews: () => Array<
    Omit<DataViewSpec, 'id'> & { id: NonNullable<DataViewSpec['id']> }
  >;

  /**
   * Gets the default ES|QL query that should be used when Discover starts in ES|QL mode.
   *
   * This extension point is evaluated on Discover app initialization and is resolved from the
   * root profile only.
   *
   * @returns The default ES|QL query config, or `undefined` to fall back to Discover defaults.
   */
  getDefaultEsqlQuery: () => DefaultEsqlQueryConfig | undefined;

  /**
   * Chart
   */

  /**
   * Allows modifying the default vis attributes used in the Discover chart
   * @returns The modified vis attributes to use in the chart
   */
  getModifiedVisAttributes: (
    params: ModifiedVisAttributesExtensionParams
  ) => TypedLensByValueInput['attributes'];

  /**
   * Gets configuration for the Discover chart (UnifiedHistogram) section
   * This allows modifying the chart section with a custom component
   * @returns The custom configuration for the chart
   */
  getChartSectionConfiguration: () => ChartSectionConfiguration;

  /**
   * Data grid
   */

  /**
   * Gets a map of column names to custom cell renderers to use in the data grid
   * @returns The custom cell renderers to use in the data grid
   */
  getCellRenderers: (params: CellRenderersExtensionParams) => CustomCellRenderer;

  /**
   * Gets a row indicator provider, allowing rows in the data grid to be given coloured highlights
   * based on the properties of each result (e.g. highlighting logs based on `log.level`)
   * @param params The row indicator extension parameters
   * @returns The row indicator provider to use in the data grid
   */
  getRowIndicatorProvider: (
    params: RowIndicatorExtensionParams
  ) => UnifiedDataTableProps['getRowIndicator'] | undefined;

  /**
   * Gets additional leading controls (row actions) to display for each row in the data grid
   * @param params The row controls extension parameters
   * @returns The additional leading controls to display in the data grid
   */
  getRowAdditionalLeadingControls: (
    params: RowControlsExtensionParams
  ) => UnifiedDataTableProps['rowAdditionalLeadingControls'] | undefined;

  /**
   * Gets additional cell actions to show within expanded cell popovers in the data grid
   * @returns The additional cell actions to show in the data grid
   */
  getAdditionalCellActions: () => AdditionalCellAction[];

  /**
   * Allows setting the pagination mode and its configuration
   * The `getPaginationConfig` extension point currently gives `paginationMode` which can be set to 'multiPage' | 'singlePage' | 'infinite';
   * Note: This extension point currently only returns `paginationMode` but can be extended to return `pageSize` etc as well.
   * @returns The pagination mode extension
   */
  getPaginationConfig: () => PaginationConfigExtension;

  /**
   * Allows overwriting the default columns configuration used in the data grid.customGridColumnsConfiguration
   * Example use case is to overwrite the column header display name or to add icons to the column headers.
   */
  getColumnsConfiguration: () => CustomGridColumnsConfiguration;

  /**
   * Field list
   */

  /**
   * Allows passing additional fields (recommended fields) to the field list area.
   * @returns The additional fields to display in the Field List under Recommended fields section
   */
  getRecommendedFields: () => FieldListExtension;

  /**
   * Document viewer flyout
   */

  /**
   * Supports customizing the behaviour of the Discover document
   * viewer flyout, such as the flyout title and available tabs.
   *
   * To add restorable state to your custom doc viewer tabs, see:
   * {@link /src/platform/plugins/shared/unified_doc_viewer/README.md#using-restorable-state-in-doc-viewer-tabs}
   *
   * @param params The doc viewer extension parameters
   * @returns The doc viewer extension
   */
  getDocViewer: (params: DocViewerExtensionParams) => DocViewerExtension;

  /**
   * Deep analysis (agent-builder)
   */

  /**
   * Contributes per-shape guidance to the Discover deep-analysis agent-builder skill.
   * The contribution is attached to the ES|QL query results sent to the agent so
   * the playbook can prioritise shape-relevant fields and aggregations.
   * @param params The deep-analysis playbook extension parameters
   * @returns The shape-specific playbook contribution, or `undefined` for the default behaviour
   */
  getDeepAnalysisPlaybook: (
    params: DeepAnalysisPlaybookExtensionParams
  ) => DeepAnalysisPlaybookExtension | undefined;

  /**
   * App Menu (Top Nav actions)
   */

  /**
   * Supports extending the app menu with additional actions
   * The `getAppMenu` extension point gives access to AppMenuRegistry with methods registerCustomAction and registerCustomActionUnderSubmenu.
   * The extension also provides the essential params like current dataView, adHocDataViews etc when defining a custom action implementation.
   * And it supports opening custom flyouts and any other modals on the click.
   * `getAppMenu` can be configured in both root and data source profiles.
   * Note: Only 2 custom actions are allowed to be rendered in the app menu. The rest will be ignored.
   * @param params The app menu extension parameters
   * @returns The app menu extension
   */
  getAppMenu: (params: AppMenuExtensionParams) => AppMenuExtension;
}
