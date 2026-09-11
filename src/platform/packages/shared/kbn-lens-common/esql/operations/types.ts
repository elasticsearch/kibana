/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IndexPattern, DateRange } from '../../types';
import type { BaseIndexPatternColumn, FormBasedLayer } from '../../datasources/types';
import type {
  AvgIndexPatternColumn,
  CardinalityIndexPatternColumn,
  CountIndexPatternColumn,
  DateHistogramIndexPatternColumn,
  MaxIndexPatternColumn,
  MedianIndexPatternColumn,
  MinIndexPatternColumn,
  PercentileIndexPatternColumn,
  RangeIndexPatternColumn,
  StandardDeviationIndexPatternColumn,
  StaticValueIndexPatternColumn,
  SumIndexPatternColumn,
  TermsIndexPatternColumn,
} from '../../datasources/operations';

/**
 * Represents an ES|QL expression with parameterized values.
 * Use ??paramName for field/column identifiers (esql-composer will escape properly)
 * Use ?paramName for literal values (strings, numbers)
 */
export interface ESQLExpressionWithParams {
  template: string;
  params?: Record<string, string | number>;
}

/**
 * Minimal read-only ui settings accessor, structurally compatible with
 * core's `IUiSettingsClient` so browser consumers can pass it directly.
 */
export interface UiSettingsReader {
  get<T = unknown>(key: string): T;
}

/**
 * Closed map of operations participating in the DSL-to-ES|QL conversion,
 * correlating each operation type with its column type. Keys must match the
 * operation IDs from `@kbn/lens-formula-docs` (and the local bucket /
 * static value IDs). Registries are mapped types over this map, which keeps
 * every entry precisely typed without casts or variance tricks.
 */
export interface EsqlOperationColumnMap {
  count: CountIndexPatternColumn;
  unique_count: CardinalityIndexPatternColumn;
  percentile: PercentileIndexPatternColumn;
  min: MinIndexPatternColumn;
  max: MaxIndexPatternColumn;
  average: AvgIndexPatternColumn;
  sum: SumIndexPatternColumn;
  median: MedianIndexPatternColumn;
  standard_deviation: StandardDeviationIndexPatternColumn;
  date_histogram: DateHistogramIndexPatternColumn;
  range: RangeIndexPatternColumn;
  static_value: StaticValueIndexPatternColumn;
  terms: TermsIndexPatternColumn;
}

export type EsqlSupportedOperation = keyof EsqlOperationColumnMap;

/**
 * Signature of a per-operation DSL-to-ES|QL conversion function.
 * Mirrors `OperationDefinition['toESQL']` but only depends on node-safe types.
 */
export type ToEsqlFn<C extends BaseIndexPatternColumn = BaseIndexPatternColumn> = (
  column: C,
  columnId: string,
  indexPattern: IndexPattern,
  layer: FormBasedLayer,
  uiSettings: UiSettingsReader,
  dateRange: DateRange
) => ESQLExpressionWithParams | undefined;

/**
 * Signature of a per-operation serialized-format resolver.
 * Mirrors `OperationDefinition['getSerializedFormat']` with node-safe types.
 */
export type GetSerializedFormatFn<C extends BaseIndexPatternColumn = BaseIndexPatternColumn> = (
  column: C,
  targetColumn: C,
  indexPattern?: IndexPattern,
  uiSettings?: UiSettingsReader,
  dateRange?: DateRange
) => Record<string, unknown>;
