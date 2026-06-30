/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/public';
import type { AggregateQuery, Query } from '@kbn/es-query';
import type { Datatable, DatatableColumn } from '@kbn/expressions-plugin/common';
import type { VisualizeFieldContext } from '@kbn/ui-actions-plugin/public';
import type { $Values } from '@kbn/utility-types';
import type {
  DateRange,
  IndexPattern,
  IndexPatternRef,
  Operation,
  TimeScaleUnit,
  ValueFormatConfig,
  VisualizeEditorContext,
} from '../types';
import type { StructuredDatasourceStates } from '../embeddable/types';

/**
 * A union type of all available operation types. The operation type is a unique id of an operation.
 * Each column is assigned to exactly one operation type.
 */
export type OperationType = string;

export interface BaseIndexPatternColumn extends Operation {
  // Private
  operationType: string;
  customLabel?: boolean;
  timeScale?: TimeScaleUnit;
  filter?: Query;
  reducedTimeRange?: string;
  timeShift?: string;
}

// Formatting can optionally be added to any column
export interface FormattedIndexPatternColumn extends BaseIndexPatternColumn {
  params?: {
    format?: ValueFormatConfig;
  };
}

export interface FieldBasedIndexPatternColumn extends BaseIndexPatternColumn {
  sourceField: string;
}

export interface ReferenceBasedIndexPatternColumn extends FormattedIndexPatternColumn {
  references: string[];
}

export type GenericIndexPatternColumn =
  | BaseIndexPatternColumn
  | FieldBasedIndexPatternColumn
  | ReferenceBasedIndexPatternColumn;

/**
 * Partial column metadata passed to buildColumn when creating a new column.
 * Contains hints from a previous column or incomplete state that should be
 * carried over to the new column (e.g., timeShift, filter, format).
 *
 * This is intentionally a partial type - buildColumn implementations should
 * use optional chaining when accessing these properties.
 */
export type ColumnBuildHints = Partial<
  BaseIndexPatternColumn &
    FieldBasedIndexPatternColumn &
    ReferenceBasedIndexPatternColumn & {
      params?: { format?: ValueFormatConfig; [key: string]: unknown };
    }
>;

/**
 * Base options passed to `buildColumn` in operation definitions.
 *
 * @property indexPattern - The data view (index pattern) for the layer
 * @property previousColumn - Optional hints from a previous column when transitioning
 *   between operations. This is partial metadata (not a full column) used to carry over
 *   settings like timeShift, filter, format, or operation-specific params.
 *   Use `hasOperationType()` to check the operation type and cast params as needed.
 */
export interface BuildColumnBaseOptions {
  indexPattern: IndexPattern;
  previousColumn?: ColumnBuildHints;
}

// Used to store the temporary invalid state
export interface IncompleteColumn {
  operationType?: OperationType;
  sourceField?: string;
}

export interface FormBasedLayer {
  columnOrder: string[];
  columns: Record<string, GenericIndexPatternColumn>;
  // Each layer is tied to the index pattern that created it
  indexPatternId: string;
  linkToLayers?: string[];
  // Partial columns represent the temporary invalid states
  incompleteColumns?: Record<string, IncompleteColumn | undefined>;
  sampling?: number;
  ignoreGlobalFilters?: boolean;
}

export interface FormBasedPersistedState {
  layers: Record<string, Omit<FormBasedLayer, 'indexPatternId'>>;
}

export type PersistedIndexPatternLayer = Omit<FormBasedLayer, 'indexPatternId'>;

export interface FormBasedPrivateState {
  currentIndexPatternId: string;
  layers: Record<string, FormBasedLayer>;
}

export interface TextBasedLayerColumn {
  columnId: string;
  fieldName: string;
  label?: string;
  customLabel?: boolean;
  params?: {
    format?: ValueFormatConfig;
    dropPartials?: boolean;
  };
  meta?: DatatableColumn['meta'];
  inMetricDimension?: boolean;
  variable?: string;
}

export interface TextBasedField {
  id: string;
  field: string;
}

export interface TextBasedLayer {
  index?: string;
  query?: AggregateQuery | undefined;
  table?: Datatable;
  columns: TextBasedLayerColumn[];
  timeField?: string;
  errors?: Error[];
  ignoreGlobalFilters?: boolean;
}

export interface TextBasedPersistedState {
  layers: Record<string, TextBasedLayer>;
  initialContext?: VisualizeFieldContext | VisualizeEditorContext;
}

export type TextBasedPrivateState = TextBasedPersistedState & {
  indexPatternRefs: IndexPatternRef[];
};

/** @public **/
export interface FormulaPublicApi {
  /**
   * Method which Lens consumer can import and given a formula string,
   * return a parsed result as list of columns to use as Embeddable attributes.
   *
   * @param id - Formula column id
   * @param column.formula - String representation of a formula
   * @param [column.label] - Custom formula label
   * @param layer - The layer to which the formula columns will be added
   * @param dataView - The dataView instance
   *
   * See `x-pack/examples/embedded_lens_example` for exemplary usage.
   */
  insertOrReplaceFormulaColumn: (
    id: string,
    column: {
      formula: string;
      label?: string;
      filter?: Query;
      reducedTimeRange?: string;
      timeScale?: TimeScaleUnit;
      format?: {
        id: string;
        params?: {
          decimals: number;
          compact?: boolean;
        };
      };
    },
    layer: PersistedIndexPatternLayer,
    dataView: DataView,
    dateRange?: DateRange
  ) => PersistedIndexPatternLayer | undefined;
}

export interface DatasourceState<S = unknown> {
  isLoading: boolean;
  state: S;
}
export type DatasourceStates = Record<string, DatasourceState>;

/**
 * A type to encompass all variants of DatasourceState types
 *
 * TODO: cleanup types/structure of datasources
 */
export type GeneralDatasourceState =
  | unknown
  | $Values<StructuredDatasourceStates>
  | DatasourceState<unknown>
  | DatasourceState<$Values<StructuredDatasourceStates>>;
