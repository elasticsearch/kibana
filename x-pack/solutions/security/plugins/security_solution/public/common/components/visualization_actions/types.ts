/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DatatableVisualizationState,
  FieldBasedIndexPatternColumn,
  FormBasedPersistedState,
  TypedLensByValueInput,
} from '@kbn/lens-plugin/public';
import type { IKibanaSearchResponse } from '@kbn/search-types';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import type { Action } from '@kbn/ui-actions-plugin/public';
import type { Filter, Query } from '@kbn/es-query';

import type { LensProps } from '@kbn/cases-plugin/public/types';
import type { EuiThemeComputed } from '@elastic/eui';
import type { TablesAdapter } from '@kbn/expressions-plugin/common';
import type { PageScope } from '../../../data_view_manager/constants';
import type { InputsModelId } from '../../store/inputs/constants';
import type { Status } from '../../../../common/api/detection_engine';

export type ColorSchemas = Record<string, string>;

export type LensAttributes = TypedLensByValueInput['attributes'];
export type GetLensAttributes = (params: {
  stackByField?: string;
  euiTheme: EuiThemeComputed;
  extraOptions?: ExtraOptions;
  esql?: string;
}) => LensAttributes;

export interface UseLensAttributesProps {
  applyGlobalQueriesAndFilters?: boolean;
  applyPageAndTabsFilters?: boolean;
  extraOptions?: ExtraOptions;
  getLensAttributes?: GetLensAttributes;
  lensAttributes?: LensAttributes | null;
  scopeId?: PageScope;
  stackByField?: string;
  title?: string;
  esql?: string;
  /**
   * Indices to use when fetching the lens componen
   */
  signalIndexName?: string | null;
  /**
   * Additional drop-list of index patterns layered on top of the scope's
   * allowlist as a *negated* `_index` filter (CPS-expanded). The chart's
   * primary scope is always the CPS-expanded `selectedPatterns` allowlist;
   * `excludedPatterns` adds a defensive exclusion (e.g. alert-backing
   * indices). An empty array is equivalent to `undefined`. Ignored when
   * `signalIndexName` is set. See `buildIndexFilters` for full semantics.
   */
  excludedPatterns?: string[];
}

export enum VisualizationContextMenuActions {
  addToCase = 'addToCase',
  inspect = 'inspect',
  openInLens = 'openInLens',
  saveToLibrary = 'saveToLibrary',
}

export interface VisualizationActionsProps {
  applyGlobalQueriesAndFilters?: boolean;
  className?: string;
  extraActions?: Action[];
  extraOptions?: ExtraOptions;
  getLensAttributes?: GetLensAttributes;
  inputId?: InputsModelId.global | InputsModelId.timeline;
  inspectIndex?: number;
  isInspectButtonDisabled?: boolean;
  isMultipleQuery?: boolean;
  lensAttributes?: LensAttributes | null;
  onCloseInspect?: () => void;
  queryId: string;
  scopeId?: PageScope;
  stackByField?: string;
  timerange: { from: string; to: string };
  title: React.ReactNode;
  withActions?: VisualizationContextMenuActions[];
  casesAttachmentMetadata?: LensProps['metadata'];
}

export interface VisualizationTablesWithMeta {
  tables: TablesAdapter['tables'];
  meta: {
    statistics: {
      totalCount: number;
    };
  };
}

export interface UseVisualizationResponseResponse {
  searchSessionId?: string;
  tables?: VisualizationTablesWithMeta;
  loading: boolean;
}

export interface EmbeddableData {
  requests: string[];
  responses: string[];
  isLoading: boolean;
  tables?: VisualizationTablesWithMeta;
}

export type OnEmbeddableLoaded = (data: EmbeddableData) => void;

export enum VisualizationContextMenuDefaultActionName {
  addToCase = 'addToCase',
  inspect = 'inspect',
  openInLens = 'openInLens',
  saveToLibrary = 'saveToLibrary',
}

export interface LensEmbeddableComponentProps {
  applyGlobalQueriesAndFilters?: boolean;
  applyPageAndTabsFilters?: boolean;
  extraActions?: Action[];
  extraOptions?: ExtraOptions;
  getLensAttributes?: GetLensAttributes;
  height?: number; // px
  id: string;
  inputsModelId?: InputsModelId.global | InputsModelId.timeline;
  inspectTitle?: React.ReactNode;
  lensAttributes?: LensAttributes;
  onLoad?: OnEmbeddableLoaded;
  enableLegendActions?: boolean;
  scopeId?: PageScope;
  stackByField?: string;
  timerange: { from: string; to: string };
  /**
   * Indices to use when fetching the lens component
   */
  signalIndexName?: string | null;
  /**
   * Additional drop-list of index patterns layered on top of the chart's
   * allowlist as a negated `_index` filter (CPS-expanded). See
   * `UseLensAttributesProps.excludedPatterns`.
   */
  excludedPatterns?: string[];
  width?: string | number;
  withActions?: VisualizationContextMenuActions[];
  /**
   * Disable the on click filter for the visualization.
   */
  disableOnClickFilter?: boolean;

  /**
   * Metadata for cases Attachable visualization.
   */
  casesAttachmentMetadata?: LensProps['metadata'];

  /**
   * When provided it will render an visualization where the query is ESQL.
   */
  esql?: string;
}

export enum RequestStatus {
  PENDING, // The request hasn't finished yet.
  OK, // The request has successfully finished.
  ERROR, // The request failed.
}

export interface Request extends RequestParams {
  id: string;
  name: string;
  json?: object;
  response?: Response;
  startTime: number;
  stats?: RequestStatistics;
  status: RequestStatus;
  time?: number;
}

export interface RequestParams {
  id?: string;
  description?: string;
  searchSessionId?: string;
}

export interface RequestStatistics {
  indexFilter: RequestStatistic;
}

export interface RequestStatistic {
  label: string;
  description?: string;
  value: string;
}

export interface Response {
  json?: IKibanaSearchResponse;
  time?: number;
}

export interface ExtraOptions {
  breakdownField?: string;
  dnsIsPtrIncluded?: boolean;
  /** When true, host KPI Lens charts use Entity Store v2 latest indices as the data source. */
  entityStoreV2Enabled?: boolean;
  filters?: Filter[];
  ruleId?: string;
  showLegend?: boolean;
  spaceId?: string;
  status?: Status;
}

export interface VisualizationEmbeddableProps extends LensEmbeddableComponentProps {
  donutTextWrapperClassName?: string;
  donutTitleLabel?: string;
  inputId?: InputsModelId.global | InputsModelId.timeline;
  isDonut?: boolean;
  label?: string;
  /**
   * Indices to use when fetching the lens component
   */
  signalIndexName?: string | null;
}

export interface VisualizationResponse<Hit = {}, Aggregations = {} | undefined> {
  took: number;
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  aggregations?: Aggregations;
  hits: {
    total: number;
    hits: Hit[];
  };
}

export interface SavedObjectReference {
  id: string;
  name: string;
  type: string;
}

export interface LensDataTableAttributes<TVisType, TVisState> {
  description?: string;
  references: SavedObjectReference[];
  visualizationType: TVisType;
  state: {
    query: Query;
    globalPalette?: {
      activePaletteId: string;
      state?: unknown;
    };
    filters: Filter[];
    adHocDataViews?: Record<string, DataViewSpec>;
    internalReferences?: SavedObjectReference[];
    datasourceStates: {
      formBased: FormBasedPersistedState;
    };
    visualization: TVisState;
  };
  title: string;
}

export interface LensDataTableEmbeddable {
  attributes: LensDataTableAttributes<'lnsDatatable', DatatableVisualizationState>;
  id: string;
  timeRange: { from: string; to: string; fromStr: string; toStr: string };
}

export interface LensEmbeddableDataTableColumn extends FieldBasedIndexPatternColumn {
  operationType: string;
  params?: unknown;
}
