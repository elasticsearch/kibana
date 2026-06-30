/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
import { map, pick, zipObject } from 'lodash';
import type { SerializedFieldFormat } from '@kbn/field-formats-plugin/common';

import type { ExpressionTypeDefinition, ExpressionValueBoxed } from '../types';
import type { PointSeries, PointSeriesColumn } from './pointseries';
import type { ExpressionValueRender } from './render';

export enum DimensionType {
  Y_AXIS = 'y',
  X_AXIS = 'x',
  REFERENCE_LINE = 'reference',
  BREAKDOWN = 'breakdown',
  MARK_SIZE = 'markSize',
  SPLIT_COLUMN = 'splitCol',
  SPLIT_ROW = 'splitRow',
}

const name = 'datatable';

/**
 * A Utility function that Typescript can use to determine if an object is a Datatable.
 * @param datatable
 */
export const isDatatable = (datatable: unknown): datatable is Datatable =>
  (datatable as ExpressionValueBoxed | undefined)?.type === 'datatable';

/**
 * This type represents the `type` of any `DatatableColumn` in a `Datatable`.
 * its duplicated from KBN_FIELD_TYPES
 */
export type DatatableColumnType =
  | '_source'
  | 'attachment'
  | 'boolean'
  | 'date'
  | 'geo_point'
  | 'geo_shape'
  | 'ip'
  | 'murmur3'
  | 'number'
  | 'string'
  | 'unknown'
  | 'conflict'
  | 'object'
  | 'nested'
  | 'histogram'
  | 'flattened'
  | 'null';

/**
 * This type represents a row in a `Datatable`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatatableRow = Record<string, any>;

/**
 * Datatable column meta information
 */
export interface DatatableColumnMeta {
  /**
   * The Kibana normalized type of the column
   */
  type: DatatableColumnType;
  /**
   * The original type of the column from ES
   */
  esType?: string;
  /**
   * field this column is based on
   */
  field?: string;
  /**
   * index/table this column is based on
   */
  index?: string;
  /**
   * i18nized names the domain this column represents
   */
  dimensionName?: string;
  /**
   * types of dimension this column represents
   */
  dimensionType?: string;
  /**
   * serialized field format
   */
  params?: SerializedFieldFormat;
  /**
   * source function that produced this column
   */
  source?: string;
  /**
   * any extra parameters for the source that produced this column
   */
  sourceParams?: SerializableRecord;
}

interface SourceParamsESQL extends Record<string, unknown> {
  indexPattern: string;
  sourceField: string;
  operationType: string;
  interval?: number;
  dropPartials?: boolean;
  appliedTimeRange?: {
    from?: string;
    to?: string;
  };
}

export function isSourceParamsESQL(obj: Record<string, unknown>): obj is SourceParamsESQL {
  return Boolean(
    obj &&
      typeof obj.indexPattern === 'string' &&
      typeof obj.sourceField === 'string' &&
      (typeof obj.interval === 'number' || !obj.interval) &&
      (typeof obj.dropPartials === 'boolean' || !obj.dropPartials) &&
      (!obj.appliedTimeRange ||
        (typeof obj.appliedTimeRange === 'object' &&
          obj.appliedTimeRange !== null &&
          ('from' in obj.appliedTimeRange || 'to' in obj.appliedTimeRange)))
  );
}

/**
 * This type represents the shape of a column in a `Datatable`.
 */
export interface DatatableColumn {
  id: string;
  name: string;
  meta: DatatableColumnMeta;
  isNull?: boolean;
  // Whether the column is computed by the query (not from the index)
  isComputedColumn?: boolean;
  variable?: string;
}

/**
 * Metadata with statistics about the `Datatable` source.
 */
export interface DatatableMetaStatistics {
  /**
   * Total hits number returned for the request generated the `Datatable`.
   */
  totalCount?: number;
}

/**
 * The `Datatable` meta information.
 */
export interface DatatableMeta {
  /**
   * Statistics about the `Datatable` source.
   */
  statistics?: DatatableMetaStatistics;

  /**
   * The `Datatable` type (e.g. `essql`, `eql`, `esdsl`, etc.).
   */
  type?: string;

  /**
   * The `Datatable` data source.
   */
  source?: string;

  [key: string]: unknown;
}

/**
 * A `Datatable` in Canvas is a unique structure that represents tabulated data.
 */
export interface Datatable {
  type: typeof name;
  columns: DatatableColumn[];
  meta?: DatatableMeta;
  rows: DatatableRow[];
  warning?: string;
}

export interface SerializedDatatable extends Datatable {
  rows: string[][];
}

interface RenderedDatatable {
  datatable: Datatable;
  paginate: boolean;
  perPage: number;
  showHeader: boolean;
}

export const datatable: ExpressionTypeDefinition<typeof name, Datatable, SerializedDatatable> = {
  name,
  validate: (table: Record<string, unknown>) => {
    // TODO: Check columns types. Only string, boolean, number, date, allowed for now.
    if (!table.columns) {
      throw new Error('datatable must have a columns array, even if it is empty');
    }

    if (!table.rows) {
      throw new Error('datatable must have a rows array, even if it is empty');
    }
  },
  serialize: (table) => {
    const { columns, rows } = table;
    return {
      ...table,
      rows: rows.map((row) => {
        return columns.map((column) => row[column.name]);
      }),
    };
  },
  deserialize: (table) => {
    const { columns, rows } = table;
    return {
      ...table,
      rows: rows.map((row) => {
        return zipObject(map(columns, 'name'), row);
      }),
    };
  },
  from: {
    null: () => ({
      type: name,
      meta: {},
      rows: [],
      columns: [],
    }),
    pointseries: (value: PointSeries) => ({
      type: name,
      meta: {},
      rows: value.rows,
      columns: map(value.columns, (val: PointSeriesColumn, colName) => {
        return { id: colName, name: val.expression, meta: { type: val.type } };
      }),
    }),
  },
  to: {
    render: (table): ExpressionValueRender<RenderedDatatable> => ({
      type: 'render',
      as: 'table',
      value: {
        datatable: table,
        paginate: true,
        perPage: 10,
        showHeader: true,
      },
    }),
    pointseries: (table: Datatable): PointSeries => {
      const validFields = ['x', 'y', 'color', 'size', 'text'];
      const columns = table.columns.filter((column) => validFields.includes(column.id));
      const rows = table.rows.map((row) => pick(row, validFields));
      return {
        type: 'pointseries',
        columns: columns.reduce<Record<string, PointSeries['columns']>>((acc, column) => {
          acc[column.name] = {
            type: column.meta.type,
            expression: column.name,
            role: 'dimension',
          };
          return acc;
        }, {}),
        rows,
      };
    },
  },
};
