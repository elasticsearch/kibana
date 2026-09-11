/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface VegaInspectorRuntimeView {
  addSignalListener: (name: string, handler: (name: string, value: unknown) => void) => unknown;
  removeSignalListener: (name: string, handler: (name: string, value: unknown) => void) => unknown;
  _runtime?: {
    data?: Record<
      string,
      {
        values?: {
          value?: Array<Record<string, unknown>>;
        };
      }
    >;
    signals?: Record<
      string,
      {
        value?: unknown;
      }
    >;
  };
}

export interface VegaSandboxDataSetSnapshot {
  columns: Array<{ id: string; schema: 'json' }>;
  data: Array<Record<string, string>>;
  id: string;
}

export interface VegaSandboxSignalsSnapshot {
  data: Array<{ name: string; value: string }>;
}

export const serializeCell = (cell: unknown): string => {
  try {
    return typeof cell === 'object' ? JSON.stringify(cell) : `${cell}`;
  } catch {
    return '(..)';
  }
};

const serializeColumns = (
  item: Record<string, unknown>,
  columns: string[]
): Record<string, string> =>
  columns.reduce((row: Record<string, string>, column) => {
    row[column] = serializeCell(item[column]);
    return row;
  }, {});

/** Serialize Vega runtime data sets to stringified cells. Shared with the unsandboxed inspector. */
export const serializeDataSetsFromView = (
  view: VegaInspectorRuntimeView
): VegaSandboxDataSetSnapshot[] => {
  const data = view._runtime?.data ?? {};

  return Object.keys(data).reduce((acc: VegaSandboxDataSetSnapshot[], key) => {
    const value = data[key]?.values?.value;
    const first = value?.[0];

    if (value && first && typeof first === 'object' && !Array.isArray(first)) {
      const columns = Object.keys(first);
      acc.push({
        id: key,
        columns: columns.map((column) => ({ id: column, schema: 'json' })),
        data: value.map((item) => serializeColumns(item, columns)),
      });
    }

    return acc;
  }, []);
};

/** Serialize Vega runtime signals as name/value rows without UI labels. */
export const serializeSignalsFromView = (
  view: VegaInspectorRuntimeView
): VegaSandboxSignalsSnapshot => {
  const signals = view._runtime?.signals ?? {};

  return {
    data: Object.keys(signals).map((key) => ({
      name: key,
      value: serializeCell(signals[key]?.value),
    })),
  };
};
