/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsqlEsqlColumnInfo, FieldValue } from '@elastic/elasticsearch/lib/api/types';
import type { TimeRange } from '../attachments/attachment_types';

export enum ToolResultType {
  resource = 'resource',
  resourceList = 'resource_list',
  esqlResults = 'esql_results',
  dashboard = 'dashboard',
  query = 'query',
  visualization = 'visualization',
  other = 'other',
  error = 'error',
  fileReference = 'file_reference',
}

interface ToolResultTypeDataMap {
  [ToolResultType.resource]: ResourceResultData;
  [ToolResultType.resourceList]: ResourceListData;
  [ToolResultType.esqlResults]: EsqlResultsData;
  [ToolResultType.dashboard]: DashboardResultData;
  [ToolResultType.query]: QueryResultData;
  [ToolResultType.visualization]: VisualizationResultData;
  [ToolResultType.error]: ErrorResultData;
  [ToolResultType.fileReference]: FileReferenceResultData;
  [ToolResultType.other]: OtherResultData;
}

export type ToolResultDataOf<Type extends ToolResultType> = ToolResultTypeDataMap[Type];

export interface ToolResultMixin<TType extends string = string, TData extends Object = Object> {
  tool_result_id: string;
  type: TType;
  data: TType extends ToolResultType.other
    ? TData
    : TType extends ToolResultType
    ? ToolResultDataOf<TType>
    : TData;
}

type UnknownToolType<T extends string> = T extends ToolResultType ? never : T;

export type KnownToolResult = {
  [K in ToolResultType]: ToolResultMixin<K>;
}[ToolResultType];

export type UnknownToolResult = ToolResultMixin<UnknownToolType<string>>;

export type ToolResult = KnownToolResult | UnknownToolResult;

// resource

export interface Resource {
  reference: {
    id: string;
    index: string;
  };
  title?: string;
  partial?: boolean;
  content: Record<string, unknown>;
}

export type ResourceResultData = Resource;

export type ResourceResult = ToolResultMixin<ToolResultType.resource>;

// resource list

export interface ResourceListData {
  resources: Resource[];
}

export type ResourceListResult = ToolResultMixin<ToolResultType.resourceList>;

// esql results

export interface EsqlResultsData {
  query: string;
  columns: EsqlEsqlColumnInfo[];
  values: FieldValue[][];
  /** Optional time range used for named parameters ?_tstart and ?_tend */
  time_range?: TimeRange;
}

export type EsqlResults = ToolResultMixin<ToolResultType.esqlResults>;

// dashboard

export interface DashboardResultData {
  id: string;
  title?: string;
  content: Record<string, unknown>;
}

export type DashboardResult = ToolResultMixin<ToolResultType.dashboard>;

// query

export interface QueryResultData {
  esql: string;
}

export type QueryResult = ToolResultMixin<ToolResultType.query>;

// visualization

export enum SupportedChartType {
  Metric = 'metric',
  Gauge = 'gauge',
  Tagcloud = 'tagcloud',
  XY = 'xy',
  RegionMap = 'region_map',
  Heatmap = 'heatmap',
  Datatable = 'datatable',
  Pie = 'pie',
  Treemap = 'treemap',
  Waffle = 'waffle',
  Mosaic = 'mosaic',
}

export interface VisualizationResultData {
  esql: string;
  time_range?: TimeRange;
  renderer?: 'lens' | 'vega';
  /** Shared visualization payload. Vega stores spec at visualization.spec. */
  visualization: Record<string, unknown> & { spec?: string };
  /** Optional chart type identifier (primarily Lens). */
  chart_type?: SupportedChartType;
  /**
   * ID of the persisted visualization attachment. Present when persistence
   * succeeded; the agent renders the visualization inline via
   * `<render_attachment id version>` and reuses it for follow-up updates.
   */
  attachment_id?: string;
  /** Version of the persisted attachment backing this result. */
  version?: number;
}

export type VisualizationResult = ToolResultMixin<ToolResultType.visualization>;

// other

export type OtherResultData<T extends Object = Object> = T;

export type OtherResult<T extends Object = Record<string, unknown>> = ToolResultMixin<
  ToolResultType.other,
  T
>;

// error

export interface ErrorResultData {
  message: string;
  stack?: unknown;
  metadata?: Record<string, unknown>;
}

export type ErrorResult = ToolResultMixin<ToolResultType.error>;

// file reference

export interface FileReferenceResultData {
  filepath: string;
  comment: string;
}

export type FileReferenceResult = ToolResultMixin<ToolResultType.fileReference>;

// Type guards

export const isResourceResult = (result: ToolResult): result is ResourceResult => {
  return result.type === ToolResultType.resource;
};

export const isResourceListResult = (result: ToolResult): result is ResourceListResult => {
  return result.type === ToolResultType.resourceList;
};

export const isEsqlResultsResult = (result: ToolResult): result is EsqlResults => {
  return result.type === ToolResultType.esqlResults;
};

export const isQueryResult = (result: ToolResult): result is QueryResult => {
  return result.type === ToolResultType.query;
};

export const isOtherResult = <T extends Object = Record<string, unknown>>(
  result: ToolResult
): result is OtherResult<T> => {
  return result.type === ToolResultType.other;
};

export const isErrorResult = (result: ToolResult): result is ErrorResult => {
  return result.type === ToolResultType.error;
};

export const isFileReferenceResult = (result: ToolResult): result is FileReferenceResult => {
  return result.type === ToolResultType.fileReference;
};

export const isVisualizationResult = (result: ToolResult): result is VisualizationResult => {
  return result.type === ToolResultType.visualization;
};
