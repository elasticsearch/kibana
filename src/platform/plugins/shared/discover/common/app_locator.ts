/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AsSerializableRecord, SerializableRecord } from '@kbn/utility-types';
import type { Filter, TimeRange, Query, AggregateQuery } from '@kbn/es-query';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import type { RefreshInterval } from '@kbn/data-plugin/public';
import type { LocatorDefinition, LocatorPublic } from '@kbn/share-plugin/public';
import type { DiscoverGridSettings } from '@kbn/saved-search-plugin/common';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import type { ControlPanelsState } from '@kbn/control-group-renderer';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { DocViewerShareableState } from '@kbn/unified-doc-viewer';
import type { ProfileStateMap } from './context_awareness';
import type { VIEW_MODE, NEW_TAB_ID } from './constants';
import type { ExpandedDocRef } from '../public';

export const DISCOVER_APP_LOCATOR = 'DISCOVER_APP_LOCATOR';

export type DiscoverAppLocatorParams = AsSerializableRecord<{
  /**
   * Optionally set saved search ID.
   */
  savedSearchId?: string;

  /**
   * Optionally set index pattern / data view ID.
   */
  dataViewId?: string;
  /**
   * Duplication of dataViewId
   * @deprecated
   */
  indexPatternId?: string;
  dataViewSpec?: DataViewSpec;

  /**
   * Optionally set the time range in the time picker.
   */
  timeRange?: TimeRange;

  /**
   * Optionally set the refresh interval.
   */
  refreshInterval?: RefreshInterval & SerializableRecord;

  /**
   * Optionally apply filters.
   */
  filters?: Filter[];

  /**
   * Optionally set a query.
   */
  query?: Query | AggregateQuery;

  /**
   * If not given, will use the uiSettings configuration for `storeInSessionStorage`. useHash determines
   * whether to hash the data in the url to avoid url length issues.
   */
  useHash?: boolean;

  /**
   * Background search session id
   */
  searchSessionId?: string;

  /**
   * Optionally set Discover tab state.
   * Use `new` as value for `id` to indicate that a new tab should be created.
   * Once created, the new tab will have a unique id which can be referenced too if necessary.
   * Use `label` to set a fallback tab label if it was not defined before yet.
   */
  tab?: { id: typeof NEW_TAB_ID | string; label?: string };

  /**
   * Columns displayed in the table
   */
  columns?: string[];

  /**
   * Data Grid related state
   */
  grid?: DiscoverGridSettings;

  /**
   * Used interval of the histogram
   */
  interval?: string;

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
   * Breakdown field
   */
  breakdownField?: string;
  /**
   * Used to force the chart to be hidden or visible
   */
  hideChart?: boolean;
  /**
   * Used to force the data table to be hidden or visible
   */
  hideTable?: boolean;
  /**
   * Used to force the field list sidebar to be hidden or visible
   */
  hideSidebar?: boolean;
  /**
   * Number of rows to sample for Discover grid
   */
  sampleSize?: number;
  /**
   * Used when navigating to particular alert results
   */
  isAlertResults?: boolean;
  /**
   * Optionally add some ESQL controls
   */
  esqlControls?: ControlPanelsState<OptionsListESQLControlState> & SerializableRecord;
  /**
   * Resolved ES|QL control variable values, so the reporting server can bind named
   * params (e.g. ?crew_id) at export time.
   *
   * Note: this overlaps with `esqlControls` (control definitions, from which variable
   * values could be derived), but it exists separately because some callers — e.g. the
   * dashboard panel CSV export action — only have access to the resolved variable
   * values, not the controls state.
   */
  esqlVariables?: ESQLControlVariable[];
  /**
   * When true, ES|QL queries use approximate execution for faster, estimated results.
   */
  esqlApproximation?: boolean;
  /**
   * Profile state carried by generated links. URL fields are written to `_p`; persistent fields
   * are carried in the navigation state.
   */
  profileState?: ProfileStateMap;
  /**
   * The document to expand in the doc viewer flyout on load.
   */
  expandedDoc?: ExpandedDocRef;
  /**
   * The URL-shareable doc viewer state (selected tab + per-tab shareable slices) restored alongside
   * `expandedDoc` when the flyout reopens from a shared link.
   */
  docViewerState?: DocViewerShareableState;
}>;

export type DiscoverAppLocator = LocatorPublic<DiscoverAppLocatorParams>;

/**
 * Location state of scoped history (history instance of Kibana Platform application service)
 */
export interface MainHistoryLocationState {
  dataViewSpec?: DataViewSpec;
  esqlControls?: ControlPanelsState<OptionsListESQLControlState>;
  isAlertResults?: boolean;
  profileState?: ProfileStateMap;
}

export type DiscoverAppLocatorGetLocation =
  LocatorDefinition<DiscoverAppLocatorParams>['getLocation'];
