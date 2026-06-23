/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { AggregateQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import type { IUiSettingsClient, Capabilities, AnalyticsServiceStart } from '@kbn/core/public';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type {
  LensPublicStart,
  TypedLensByValueInput,
  LensEmbeddableInput,
  Suggestion,
} from '@kbn/lens-plugin/public';
import type { DataViewField, DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { RequestAdapter } from '@kbn/inspector-plugin/public';
import type {
  Datatable,
  DatatableColumn,
  DefaultInspectorAdapters,
} from '@kbn/expressions-plugin/common';
import type { ReplaySubject } from 'rxjs';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { PublishingSubject } from '@kbn/presentation-publishing';
import type { SerializedStyles } from '@emotion/serialize';
import type { ResizableLayoutProps } from '@kbn/resizable-layout';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { ControlPanelsState } from '@kbn/control-group-renderer';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import { UnifiedHistogramSuggestionType } from '@kbn/discover-utils';

/**
 * The fetch status of a Unified Histogram request
 */
export enum UnifiedHistogramFetchStatus {
  uninitialized = 'uninitialized',
  loading = 'loading',
  partial = 'partial',
  complete = 'complete',
  error = 'error',
}

/**
 * The services required by the Unified Histogram components
 */
export interface UnifiedHistogramServices {
  data: DataPublicPluginStart;
  uiActions: UiActionsStart;
  uiSettings: IUiSettingsClient;
  fieldFormats: FieldFormatsStart;
  lens: LensPublicStart;
  storage: Storage;
  expressions: ExpressionsStart;
  capabilities: Capabilities;
  dataViews: DataViewsPublicPluginStart;
  fieldsMetadata?: FieldsMetadataPublicStart;
  analytics?: AnalyticsServiceStart;
}

/**
 * The bucketInterval object returned by {@link buildBucketInterval}
 */
export interface UnifiedHistogramBucketInterval {
  scaled?: boolean;
  description?: string;
  scale?: number;
}

/**
 * The adapters passed up from Lens
 */
export type UnifiedHistogramAdapters = Partial<DefaultInspectorAdapters>;

/**
 * Emitted when the histogram loading status changes
 */
export interface UnifiedHistogramChartLoadEvent {
  /**
   * Inspector adapters for the request
   */
  adapters: UnifiedHistogramAdapters;
  /**
   * Observable for the data change subscription
   */
  dataLoading$?: PublishingSubject<boolean | undefined>;
}

/**
 * Context object for the hits count
 */
export interface UnifiedHistogramHitsContext {
  /**
   * The fetch status of the hits count request
   */
  status?: UnifiedHistogramFetchStatus;
  /**
   * The total number of hits
   */
  total?: number;
}

export type UnifiedHistogramTopPanelHeightContext = ResizableLayoutProps['fixedPanelSize'];

/**
 * Context object for the chart
 */
export interface UnifiedHistogramChartContext {
  /**
   * Controls whether or not the chart is hidden
   */
  hidden?: boolean;
  /**
   * Controls the time interval of the chart
   */
  timeInterval?: string;
}

/**
 * Context object for the histogram breakdown
 */
export interface UnifiedHistogramBreakdownContext {
  /**
   * The field used for the breakdown
   */
  field?: DataViewField;
}

export enum UnifiedHistogramExternalVisContextStatus {
  unknown = 'unknown',
  applied = 'applied',
  automaticallyCreated = 'automaticallyCreated',
  automaticallyOverridden = 'automaticallyOverridden',
  manuallyCustomized = 'manuallyCustomized',
}

export { UnifiedHistogramSuggestionType };

export interface UnifiedHistogramSuggestionContext {
  suggestion: Suggestion | undefined;
  type: UnifiedHistogramSuggestionType;
}

export interface LensRequestData {
  dataViewId?: string;
  timeField?: string;
  timeInterval?: string;
  breakdownField?: string;
}

export enum LensVisServiceStatus {
  'initial' = 'initial',
  'completed' = 'completed',
}

export interface LensVisServiceState {
  status: LensVisServiceStatus;
  currentSuggestionContext: UnifiedHistogramSuggestionContext;
  visContext: UnifiedHistogramVisContext | undefined;
}
/**
 * Unified Histogram type for recreating a stored Lens vis
 */
export interface UnifiedHistogramVisContext {
  attributes: TypedLensByValueInput['attributes'];
  requestData: LensRequestData;
  suggestionType: UnifiedHistogramSuggestionType;
}

export interface UnifiedHistogramFetchParamsExternal {
  /**
   * The request adapter to use for the inspector
   */
  requestAdapter: RequestAdapter | undefined;
  /**
   * The current search session ID
   */
  searchSessionId: string | undefined;
  /**
   * The abort controller to use for requests
   */
  abortController?: AbortController;
  /**
   * The current data view
   */
  dataView: DataView;
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
  /**
   * The relative time range, used when timeRange is an absolute range (e.g. for edit visualization button)
   */
  relativeTimeRange?: TimeRange;
  /**
   * The ES|QL variables to use for the chart
   */
  esqlVariables?: ESQLControlVariable[];
  /**
   * The controls state to use for the chart
   */
  controlsState?: ControlPanelsState<OptionsListESQLControlState>;
  /**
   * The current columns
   */
  columns?: DatatableColumn[];
  /**
   * Preloaded data table sometimes used for rendering the chart in ES|QL mode
   */
  table?: Datatable;
  /**
   * The current breakdown field
   */
  breakdownField?: string;
  /**
   * The current time interval of the chart
   */
  timeInterval?: string;
  /**
   * The external custom Lens vis
   */
  externalVisContext?: UnifiedHistogramVisContext;
  /**
   * Callback to modify the default Lens vis attributes used in the chart
   */
  getModifiedVisAttributes?: (
    attributes: TypedLensByValueInput['attributes']
  ) => TypedLensByValueInput['attributes'];
}

export type UnifiedHistogramFetchParams = Omit<
  UnifiedHistogramFetchParamsExternal,
  'breakdownField' | 'timeInterval'
> & {
  query: Query | AggregateQuery;
  filters: Filter[];
  timeRange: TimeRange;
  relativeTimeRange: TimeRange;
  esqlVariables: ESQLControlVariable[];

  // additional
  lastReloadRequestTime: number;
  isESQLQuery: boolean;
  isTimeBased: boolean;
  columnsMap: Record<string, DatatableColumn> | undefined;
  breakdown:
    | {
        field: DataViewField | undefined;
      }
    | undefined;
  timeInterval: string;
};

export interface UnifiedHistogramFetch$Arguments {
  fetchParams: UnifiedHistogramFetchParams;
  lensVisServiceState: LensVisServiceState | undefined;
}

export type UnifiedHistogramFetch$ = ReplaySubject<UnifiedHistogramFetch$Arguments>;

// A shared interface for communication between Discover and custom components.
export interface ChartSectionProps {
  /**
   * Required services
   */
  services: UnifiedHistogramServices;
  /**
   * Callback to pass to the Lens embeddable to handle filter changes
   */
  onFilter?: LensEmbeddableInput['onFilter'];
  /**
   * Callback to pass to the Lens embeddable to handle brush events
   */
  onBrushEnd?: LensEmbeddableInput['onBrushEnd'];
  /**
   * CSS styles for toggleable actions container
   */
  chartToolbarCss?: SerializedStyles;
  /**
   * CSS styles for the charts section
   */
  histogramCss?: SerializedStyles;
  /**
   * Renders the toggle actions
   * @returns The toggle action elements
   */
  renderToggleActions: () => React.ReactElement | undefined;
  /**
   * The request parameters for the chart
   */
  fetchParams: UnifiedHistogramFetchParams;
  /**
   * Observable for fetching the histogram data
   */
  fetch$: UnifiedHistogramFetch$;
  /**
   * Flag indicating that the chart is currently loading
   */
  isChartLoading?: boolean;
  /**
   * Controls whether or not the chart is visible (used for Show and Hide toggle)
   */
  isComponentVisible: boolean;
  /**
   * Optional callback for registering a request adapter for custom chart section requests
   * in the Inspector. When called, the adapter will be synced to
   * inspectorAdapters.lensRequests via the unified histogram state service.
   */
  setLensRequestAdapter?: (adapter: RequestAdapter | undefined) => void;
  /**
   * Indicates whether the current tab is selected/active.
   */
  isTabSelected: boolean;
}
